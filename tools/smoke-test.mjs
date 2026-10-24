import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import vm from "node:vm";

const scriptOrder = [
  "src/data.js",
  "src/state.js",
  "src/utils.js",
  "src/boundary-detail.js", "src/boundary-loader.js",
  "src/csv.js",
  "src/matching.js",
  "src/classification.js",
  "src/render-utils.js",
  "src/export.js",
  "src/ui.js",
  "src/app.js"
];

const context = vm.createContext({
  assert,
  Blob,
  Image: function Image() {},
  Intl,
  Map,
  Math,
  Number,
  Set,
  String,
  URL,
  console,
  document: {
    addEventListener() {},
    createElementNS() {
      return { setAttribute() {} };
    }
  }
});

for (const file of scriptOrder) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

const generatedBoundaryJson = await readFile("tools/fixtures/generated/admin_boundaries.normalized.geojson", "utf8");
context.generatedBoundaryJson = generatedBoundaryJson;

vm.runInContext(`
  state.boundarySource = "fixture";
  const generatedFeatures = geoJsonToAdminFeatures(JSON.parse(generatedBoundaryJson));
  if (generatedFeatures.length < 7) throw new Error("expected generated boundary features");
  if (!generatedFeatures.every((feature) => feature.polygons.length && feature.polygons.every((polygon) => polygon.length >= 3))) {
    throw new Error("generated boundary conversion produced invalid polygons");
  }

  parseImportedCsv(SAMPLE_BARANGAY_CSV, { scopeId: "CITY-137404", level: "barangay" });
  let join = buildJoin();
  if (join.matchedRows.length !== 12) throw new Error("expected 12 clean barangay matches");
  if (join.mappedRows.length !== 12) throw new Error("expected 12 mapped barangay geographies");
  if (join.issueRows.length !== 0) throw new Error("expected no sample issues");

  parseImportedCsv(\`psgc_code,name,value
1374040001,Batasan Hills,91
1374040001,Batasan Hills copy,92
1374040002,Commonwealth,not-a-number
0722170001,Lahug,12
1374040000,Quezon City,77
9999999999,Unknown,1
,Missing,2\`, { scopeId: "CITY-137404", level: "barangay" });
  join = buildJoin();
  const issueTypes = join.issueRows.map((issue) => issue.type).sort();
  for (const expected of ["duplicate_code", "invalid_value", "missing_code", "outside_scope", "unknown_code", "wrong_level"]) {
    if (!issueTypes.includes(expected)) throw new Error("missing issue type " + expected);
  }
  if (join.mappedRows.length !== 1) throw new Error("expected one uniquely mapped geography after duplicate handling");
  if (join.unmatchedRows.length !== 4) throw new Error("expected four unmatched rows");
`, context);

console.log("Smoke checked import matching workflow");

vm.runInContext(`
  const beforeIndexState = { ...state }, beforeAdmin = generatedAdminFeatures;
  const beforeChunks = new Map(generatedBarangayFeaturesByScope);
  try {
    const city = { code: "1234500000", name: "Parent city", level: "city", regionCode: "1200000000", adminType: "highly_urbanized_city" };
    const first = { code: "1234500001", name: "First boundary record", level: "barangay", cityCode: city.code };
    const duplicate = { ...first, name: "Repeated boundary record" };
    generatedAdminFeatures = [city];
    Object.assign(state, { boundarySource: "generated", scopeId: "PH", level: "barangay", importedRows: [{ psgc_code: first.code, value: "7" }],
      keyColumn: "psgc_code", valueColumn: "value", placeOverrides: {} });
    generatedBarangayFeaturesByScope.set("country:PH", [first, duplicate]);
    const loadedIndex = getFeatureIndex(), countryFeatures = getVisibleFeatures();
    assert.equal(featureByCode(first.code), first, "place identity must keep the first boundary record for a repeated PSGC code");
    assert.equal(buildJoin().matchedRows[0].feature, duplicate, "CSV joining must retain its existing latest-boundary duplicate behavior");
    assert.equal(countryFeatures.length, 2, "cached country features must preserve every repeated polygon record");
    assert.equal(getFeatureIndex(), loadedIndex, "unchanged loaded boundaries must reuse the combined country index");
    assert.equal(getVisibleFeatures(), countryFeatures, "unchanged scope must avoid filtering all boundaries again");
    const detailed = { ...first, name: "Detailed replacement" };
    generatedBarangayFeaturesByScope.set("country:PH", [detailed]);
    assert.equal(featureByCode(first.code), detailed, "replacing a loaded chunk must invalidate identity lookups");
    assert.equal(getVisibleFeatures().length, 1, "a replaced chunk must remove stale geometry records");
    assert.equal(buildJoin().matchedRows[0].feature, detailed, "CSV joins must use replacement geometry");
    state.level = "city";
    assert.equal(featureByCode(first.code), undefined, "leaving the barangay layer must not retain inactive loaded barangays");
    assert.equal(featureByCode(city.code), city);
    state.level = "barangay";
    generatedBarangayFeaturesByScope.clear();
    assert.equal(featureByCode(first.code), undefined, "reloading boundaries must discard lookups from cleared chunks");
    generatedAdminFeatures = [{ ...city, name: "Reloaded city" }];
    assert.equal(featureByCode(city.code).name, "Reloaded city", "replacing the admin registry must invalidate parent lookups");
  } finally {
    Object.assign(state, beforeIndexState);
    generatedAdminFeatures = beforeAdmin;
    generatedBarangayFeaturesByScope.clear();
    for (const [key, value] of beforeChunks) generatedBarangayFeaturesByScope.set(key, value);
  }
`, context);

console.log("Geography indexes preserve duplicate handling and refresh after boundary replacement");

vm.runInContext(`
  assert.deepEqual(parseThresholds(""), [], "blank thresholds must not introduce zero");
  assert.deepEqual(parseThresholds(", , "), [], "empty segments must be ignored");
  assert.deepEqual(parseThresholds(" 20,0,-5,20,,bad,Infinity, "), [-5, 0, 20],
    "thresholds must preserve explicit zero/negatives and remove duplicate numbers");

  const scaleFeatures = Array.from({ length: 10 }, (_, index) => ({ code: String(index) }));
  const scaleValues = new Map(scaleFeatures.map((feature, index) => [feature.code, index * 10]));
  state.classification = "custom";
  state.customThresholds = "10,20,30,40,50,60,70,80";
  for (const [paletteId, palette] of Object.entries(PALETTES)) {
    state.palette = paletteId;
    for (const count of [1, palette.colors.length, 9]) {
      const sampled = sampleColors(palette.colors, count);
      assert.equal(sampled.length, count, "requested class count must be honored");
      assert(sampled.every((color) => /^#[0-9a-f]{6}$/i.test(color)), "every class needs a valid color");
      assert.equal(sampled.at(-1), palette.colors.at(-1), "preserve the ramp endpoint");
      if (count > 1) assert.equal(sampled[0], palette.colors[0], "preserve the ramp start");
    }
    const scale = buildScale(scaleFeatures, scaleValues);
    assert.equal(scale.colors.length, 9, "eight thresholds require nine classes");
    assert.equal(scale.labels.length, scale.colors.length + 1, "legend needs one label per boundary");
    for (const [value, bin] of [[-1, 0], [10, 0], [10.01, 1], [75, 7], [80, 7], [81, 8], [100, 8]]) {
      assert.equal(scale.colorForValue(value), scale.colors[bin], "custom class boundaries must match map fills");
      assert(/^#[0-9a-f]{6}$/i.test(getFeatureFill({ code: "unselected" }, value, scale)),
        "rendered map fills must remain valid beyond the base palette size");
    }
  }

  state.bins = 5;
  state.customThresholds = "";
  const blankCustomScale = buildScale(scaleFeatures, scaleValues);
  state.classification = "equal";
  const equalScale = buildScale(scaleFeatures, scaleValues);
  for (const value of scaleValues.values()) {
    assert.equal(blankCustomScale.colorForValue(value), equalScale.colorForValue(value),
      "blank custom thresholds must use equal intervals");
  }

  state.classification = "custom";
  state.customThresholds = "-10,100";
  const openEndedScale = buildScale(scaleFeatures, scaleValues);
  assert.deepEqual(openEndedScale.labels, ["−∞", "-10", "100", "+∞"],
    "custom legend must describe open-ended classes, including thresholds outside the data range");
  assert.equal(getFeatureFill({ code: "unselected" }, NaN, openEndedScale), state.missingColor);

  for (const [input, expected] of [[1e9, 7], [-1, 3], [4.6, 5]]) {
    const loaded = validateProjectState({ scopeId: "PH", level: "region", bins: input });
    assert.equal(loaded.bins, expected, "imported bin counts must stay within the integer slider range");
  }
`, context);

console.log("Smoke checked classification colors, thresholds, legends, and project bin limits");
