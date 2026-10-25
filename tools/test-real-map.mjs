import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({
  assert, Blob, AbortController, Image: function Image() {}, Intl, Map, Math, Number, Set, String, URL, console, setImmediate,
  document: { addEventListener() {}, createElementNS() { return { setAttribute() {} }; } }
});

for (const file of [
  "src/data.js", "src/state.js", "src/utils.js", "src/boundary-detail.js", "src/boundary-loader.js", "src/csv.js",
  "src/matching.js", "src/classification.js", "src/render-utils.js", "src/export.js", "src/ui.js", "src/app.js"
]) {
  vm.runInContext(await readFile(file, "utf8"), context, { filename: file });
}

for (const value of [null, undefined, "", "  ", "\t\r\n", "\u00a0", "%", ", ,"]) {
  assert(Number.isNaN(context.parseValue(value)), "blank and whitespace-only values must remain missing");
}
for (const value of [0, "0", " 0 ", "0%"]) {
  assert.equal(context.parseValue(value), 0, "numeric zero must remain a valid statistic");
}
assert.equal(context.parseValue(" 1,234.5 "), 1234.5);
assert.equal(context.parseValue(" 12% "), 12);

vm.runInContext(`
  const ring = (west, south, east, north) => [
    [west, south], [east, south], [east, north], [west, north], [west, south]
  ];
  const boundaryFeature = (code, name, level, geometry, parents = {}) => ({
    type: "Feature", properties: { psgc_code: code, name, level, ...parents }, geometry
  });
  const collection = (...features) => ({ type: "FeatureCollection", features });
  const regionGeometry = { type: "Polygon", coordinates: [ring(122, 9, 126, 12)] };
  const provinceGeometry = { type: "Polygon", coordinates: [ring(123, 9.5, 124.5, 11.5)] };
  const cityGeometry = { type: "Polygon", coordinates: [ring(123.8, 10.2, 124, 10.5)] };
  const adminFixture = collection(
    boundaryFeature("0700000000", "Central Visayas", "region", regionGeometry, { region_code: "0700000000" }),
    boundaryFeature("0702200000", "Cebu", "province", provinceGeometry, {
      region_code: "0700000000", province_code: "0702200000"
    }),
    boundaryFeature("0730600000", "City of Cebu", "city", cityGeometry, {
      region_code: "0700000000", city_municipality_code: "0730600000", admin_type: "highly_urbanized_city"
    })
  );
  generatedAdminFeatures = geoJsonToAdminFeatures(adminFixture);
  generatedScopes = buildBoundaryScopes([...generatedAdminFeatures, generatedAdminFeatures[2]]);
  state.boundarySource = "generated";
  state.generatedBoundaryStatus = "ready";

  const scopes = getScopes();
  assert.deepEqual(scopes.map((scope) => scope.id), [
    "PH", "REG-0700000000", "PROV-0702200000", "CITY-0730600000"
  ], "real boundaries must expose country and every distinct canonical administrative scope");
  for (const scope of scopes) {
    assert(scope.allowedLevels.includes("barangay"), "every geographic scope must support barangays");
    state.scopeId = scope.id;
    assert.equal(getScope().id, scope.id, "scope selection must use generated IDs rather than fixture IDs");
  }

  const sharedGeometry = { type: "Polygon", coordinates: [ring(123.9, 10.3, 124, 10.4)] };
  const sharedFeature = boundaryFeature("0730600001", "Adlaon", "barangay", sharedGeometry, {
    region_code: "0700000000", city_municipality_code: "0730600000", barangay_code: "0730600001"
  });
  const independentlyLoaded = geoJsonToAdminFeatures(collection(sharedFeature))[0];
  const nationallyLoaded = geoJsonToAdminFeatures(collection(adminFixture.features[0], sharedFeature))[1];
  assert.deepEqual(independentlyLoaded.polygons, nationallyLoaded.polygons,
    "the same geographic coordinates must align across independently loaded scopes");
  assert.equal(independentlyLoaded.cityName, "City of Cebu", "scoped chunks must resolve names from the admin registry");
  assert.equal(independentlyLoaded.regionName, "Central Visayas");
  assert.equal(independentlyLoaded.provinceCode, "", "HUC fixtures must not acquire a fictional province parent");
  state.scopeId = "CITY-0730600000";
  assert(featureInScope(independentlyLoaded, getScope()), "canonical HUC city codes must include their barangays");

  const islandGeometry = { type: "MultiPolygon", coordinates: [
    [ring(123, 10, 124, 11), ring(123.2, 10.2, 123.4, 10.4)],
    [ring(124.5, 10, 124.8, 10.3)]
  ] };
  const islandFeature = geoJsonToAdminFeatures(collection(
    boundaryFeature("0730600002", "Island with a lake", "barangay", islandGeometry)
  ))[0];
  assert.equal(islandFeature.polygonGroups.length, 2, "multipart geometry must retain separate polygons");
  assert.equal(islandFeature.polygonGroups[0].length, 2, "an interior ring must remain attached to its exterior");
  assert.equal(islandFeature.polygonGroups[1].length, 1);
  assert(islandFeature.polygons.every((polygon) => polygon.length === 4), "closing coordinates must be removed once");
  const islandPath = pathFromFeature(islandFeature);
  assert.equal((islandPath.match(/M /g) || []).length, 3, "SVG paths must retain the exterior, hole, and second island");
  assert.equal((islandPath.match(/Z/g) || []).length, 3, "all retained rings must close");
  assert(!/NaN|Infinity/.test(islandPath), "valid geometry must produce finite path coordinates");
`, context);

console.log("Real-map fixtures passed: shared projection, multipart geometry, holes, names, and dynamic scopes");

await vm.runInContext(`(async () => {
  const requestedPaths = [];
  globalThis.fetch = async (url) => {
    requestedPaths.push(url);
    return { ok: true, json: async () => collection(sharedFeature) };
  };
  render = () => {};
  state.level = "barangay";
  for (const scope of getScopes()) {
    state.scopeId = scope.id;
    maybeLoadGeneratedBarangaysForScope();
    await new Promise(setImmediate);
    assert.equal(getLoadedGeneratedBarangays()[0].code, "0730600001", "every scope must expose its loaded chunk");
  }
  assert.deepEqual(requestedPaths, [
    "data/generated/barangays/national.geojson",
    "data/generated/barangays/region/0700000000.geojson",
    "data/generated/barangays/province/0702200000.geojson",
    "data/generated/barangays/city/0730600000.geojson"
  ], "country, region, province, and canonical city scopes must request their own boundary files");

  generatedBarangayFeaturesByScope.clear();
  requestedPaths.length = 0;
  generatedBarangayPaths = new Map([["city:0730600000", "barangays/city/indexed-cebu.geojson"]]);
  state.scopeId = "CITY-0730600000";
  maybeLoadGeneratedBarangaysForScope();
  await new Promise(setImmediate);
  assert.deepEqual(requestedPaths, ["data/generated/barangays/city/indexed-cebu.geojson"],
    "indexed chunk paths must override guessed names and receive exactly one generated-data prefix");

  generatedBarangayFeaturesByScope.clear();
  generatedBarangayPaths = new Map();
  requestedPaths.length = 0;
  maybeLoadGeneratedBarangaysForScope();
  await new Promise(setImmediate);
  assert.equal(requestedPaths.length, 0, "an absent indexed scope must not trigger a guessed request");
  assert.equal(getLoadedGeneratedBarangays().length, 0, "an unavailable scope must not display another scope's cached geometry");
  assert(failedBarangayScopes.has("city:0730600000"), "the unavailable indexed scope must be recorded explicitly");
  generatedBarangayPaths = null;
})()`, context);

console.log("Real-map loading passed: national, regional, provincial, and city chunks without network access");

vm.runInContext(`
  state.classification = "quantile";
  state.bins = 3;
  state.palette = "bay";
  state.customThresholds = "";
  const repeatedGeometry = ["A", "A", "A", "B", "C", "D"].map((code) => ({ code }));
  const distinctValues = new Map([["A", 0], ["B", 10], ["C", 20], ["D", 100]]);
  const distinctScale = buildScale(repeatedGeometry, distinctValues);
  assert.deepEqual(distinctScale.labels, ["0", "10", "20", "100"],
    "quantile breaks must weight administrative units once rather than repeated geometry records");
  assert.equal(distinctScale.colorForValue(10), distinctScale.colors[0]);
  assert.equal(distinctScale.colorForValue(20), distinctScale.colors[1]);
  assert.equal(distinctScale.colorForValue(100), distinctScale.colors[2]);

  state.boundarySource = "generated";
  for (const latestValue of ["not-a-number", "", "   "]) {
    parseImportedCsv("psgc_code,name,value\\n0730600000,First row,73\\n0730600000,Latest row," + latestValue,
      { scopeId: "PH", level: "city" });
    const duplicateJoin = buildJoin();
    assert(!duplicateJoin.valueByCode.has("0730600000"),
      "the latest duplicate CSV row must leave invalid/blank statistics missing rather than reuse the earlier number");
    assert.equal(duplicateJoin.mappedRows.length, 0, "invalid latest duplicates must not remain in mapped exports or summaries");
    assert.equal(duplicateJoin.invalidValueRows.length, 1);
  }
`, context);

console.log("Statistical regressions passed: distinct-unit quantiles and latest invalid duplicate rows");

vm.runInContext(`
  state.boundarySource = "generated";
  parseImportedCsv("psgc_code,name,value\\n0730600000,City of Cebu,73", { scopeId: "PH", level: "city" });
  state.placeOverrides = { "0730600000": { label: "My city label" } };
  assert.equal(buildJoin().valueByCode.get("0730600000"), 73, "a label-only edit must preserve imported statistics");

  state.placeOverrides["0730600000"].value = "0";
  let editedJoin = buildJoin();
  assert.equal(editedJoin.valueByCode.get("0730600000"), 0, "explicit zero must override an imported statistic");
  assert.equal(editedJoin.mappedRows[0].value, 0);
  assert.equal(state.importedRows[0].value, "73", "manual edits must not mutate the imported source row");

  for (const blank of ["", "   "]) {
    state.placeOverrides["0730600000"].value = blank;
    editedJoin = buildJoin();
    assert(!editedJoin.valueByCode.has("0730600000"), "an explicit blank must remove the imported statistic");
    assert.equal(editedJoin.mappedRows.length, 0, "a cleared statistic must not remain in exports or summaries");
  }

  state.importedRows = [];
  state.placeOverrides["0730600000"].value = "0";
  editedJoin = buildJoin();
  assert.equal(editedJoin.valueByCode.get("0730600000"), 0, "manual statistics must work without a CSV upload");
  assert.equal(editedJoin.mappedRows.length, 1);
  state.level = "region";
  assert.equal(buildJoin().valueByCode.size, 0, "city edits must not leak into regional statistics");
`, context);

console.log("Manual-statistic fixtures passed: label-only edits, zero, clearing values, and editing without CSV");

vm.runInContext(`
  parseImportedCsv("psgc_code,name,value,annotation\\n0730600000,City of Cebu,73,CSV annotation", {
    scopeId: "PH", level: "city"
  });
  state.labelColumn = "annotation";
  const editedFeature = generatedAdminFeatures.find((feature) => feature.code === "0730600000");
  let labelJoin = buildJoin();
  assert.equal(customLabelForFeature(editedFeature, labelJoin), "CSV annotation", "CSV annotations must be available by code");
  state.placeOverrides = { "0730600000": { label: "Local <name>", value: "0" } };
  labelJoin = buildJoin();
  assert.equal(customLabelForFeature(editedFeature, labelJoin), "Local <name>", "manual labels must override CSV annotations");
  assert.equal(editedFeature.name, "City of Cebu", "annotations must not rename canonical source geography");
  state.placeOverrides["0730600000"].label = "";
  assert.equal(customLabelForFeature(editedFeature, buildJoin()), "", "explicitly clearing a label must suppress CSV fallback");
  delete state.placeOverrides["0730600000"].label;
  state.placeOverrides["0730600000"].value = "";
  labelJoin = buildJoin();
  assert.equal(customLabelForFeature(editedFeature, labelJoin), "CSV annotation", "clearing a statistic must preserve its CSV annotation");
  state.importedRows = [];
  state.placeOverrides["0730600000"].label = "Manual without CSV";
  assert.equal(customLabelForFeature(editedFeature, buildJoin()), "Manual without CSV");

  const savedSettings = {
    scopeId: "CITY-0730600000", level: "barangay", boundarySource: "generated",
    labelMode: "custom", labelColumn: "annotation", statisticLabel: "Population",
    labelSize: 100, showMapLegend: false,
    placeOverrides: {
      "0730600001": { label: "  Local <name>  ", value: "0" },
      "0730600002": { label: "Label only" },
      "0730600003": { value: "" },
      "0730600004": { value: 0 },
      "0730600005": null,
      "0730600006": "invalid entry",
      "0730600007": { value: "Infinity" },
      "0730600008": { value: {} },
      "0730600009": { label: "x".repeat(200) },
      "NAMRIA_PH123": { label: "Unmatched source feature" },
      "bad-code": { label: "Invalid code" }
    }
  };
  const loadedSettings = validateProjectState(JSON.parse(JSON.stringify(savedSettings)));
  assert.equal(loadedSettings.scopeId, "CITY-0730600000", "saved canonical scopes must survive validation");
  assert.equal(loadedSettings.labelMode, "custom");
  assert.equal(loadedSettings.labelColumn, "annotation");
  assert.equal(loadedSettings.statisticLabel, "Population");
  assert.equal(loadedSettings.labelSize, 24, "loaded label sizes must stay within UI bounds");
  assert.equal(loadedSettings.showMapLegend, false);
  assert.equal(loadedSettings.placeOverrides["0730600001"].label, "Local <name>");
  assert.equal(loadedSettings.placeOverrides["0730600001"].value, "0");
  assert(!Object.hasOwn(loadedSettings.placeOverrides["0730600002"], "value"), "label-only saves must not invent zero statistics");
  assert.equal(loadedSettings.placeOverrides["0730600003"].value, "", "explicit blank statistics must survive JSON round trips");
  assert.equal(loadedSettings.placeOverrides["0730600004"].value, "0", "numeric JSON zero must normalize to the stored string format");
  assert.equal(loadedSettings.placeOverrides["0730600009"].label.length, 160);
  assert.equal(loadedSettings.placeOverrides.NAMRIA_PH123.label, "Unmatched source feature");
  for (const invalidCode of ["0730600005", "0730600006", "0730600007", "0730600008", "bad-code"]) {
    assert(!Object.hasOwn(loadedSettings.placeOverrides, invalidCode), "invalid imported override entries must be discarded: " + invalidCode);
  }
  assert.deepEqual(validateProjectState({ scopeId: "PH", level: "region" }).placeOverrides, {},
    "opening an older project must clear manual edits from the previously open project");
  assert.deepEqual(validateProjectState({ scopeId: "PH", level: "region", placeOverrides: [] }).placeOverrides, {},
    "an override map must not accept an array");
  const unsafeProject = JSON.parse('{"scopeId":"PH","level":"region","placeOverrides":{"__proto__":{"label":"polluted"}}}');
  assert(!Object.hasOwn(validateProjectState(unsafeProject).placeOverrides, "__proto__"),
    "imported override keys must not modify object prototypes");
  assert.equal(validateProjectState({ scopeId: "PH", level: "region", labelMode: "unknown" }).labelMode, "none");
  assert.equal(validateProjectState({ scopeId: "PH", level: "region", labelSize: -10 }).labelSize, 6);
  assert.equal(validateProjectState(null), null);
`, context);

console.log("Label and project fixtures passed: CSV/manual precedence, explicit clearing, JSON persistence, and input validation");

await vm.runInContext(`(async () => {
  const previous = { ...state }, previousEditor = { ...layoutEditor }, previousDownload = downloadBlob;
  try {
    const customized = {
      customColors: ["#123456", "#abcdef", "#fedcba"], reverseColors: true,
      legendTitle: "Households", legendLabels: ["Low", "", "High"], legendShowMissing: false, legendMissingLabel: "Not reported",
      legendScale: 1.4, legendTextColor: "#123123", legendBackgroundColor: "#fefefe", legendBackgroundOpacity: 0.4,
      layoutTextColor: "#112233", layoutTextScale: 1.5,
      layoutPositions: { legend: { x: 0.1, y: 0.2 }, title: { x: 0.3, y: 0.1 }, subtitle: { x: 0.4, y: 0.2 }, source: { x: 0.1, y: 0.9 } }
    };
    Object.assign(state, customized);
    layoutEditor.enabled = true; layoutEditor.selected = "title";
    let projectBlob;
    downloadBlob = (blob) => { projectBlob = blob; };
    saveProject();
    const payload = JSON.parse(await projectBlob.text()), restored = validateProjectState(payload.state);
    assert.equal(payload.version, 2);
    for (const key of Object.keys(MAP_STYLE_DEFAULTS)) assert.deepEqual(restored[key], customized[key], "project roundtrip must preserve " + key);
    assert(!Object.hasOwn(payload, "layoutEditor") && !Object.hasOwn(payload.state, "layoutEditor"), "arrange mode and selection are ephemeral");
    const oldProject = validateProjectState({ scopeId: "PH", level: "region" });
    for (const key of Object.keys(MAP_STYLE_DEFAULTS)) assert.deepEqual(oldProject[key], MAP_STYLE_DEFAULTS[key], "older projects must reset " + key);
    oldProject.customColors.push("#000000"); oldProject.legendLabels.push("changed"); oldProject.layoutPositions.title = { x: 1, y: 1 };
    const nextOldProject = validateProjectState({ scopeId: "PH", level: "region" });
    assert.deepEqual(nextOldProject.customColors, []); assert.deepEqual(nextOldProject.legendLabels, []); assert.deepEqual(nextOldProject.layoutPositions, {});
    const invalid = validateProjectState({ scopeId: "PH", level: "region", palette: "__proto__", classification: "unknown", boundarySource: "unknown",
      customColors: ["red", "#123", "#12345678", "url(unsafe)", {}, "#ABCDEF"], reverseColors: "true", legendShowMissing: "false",
      legendTitle: "x".repeat(200), legendLabels: [" First ", 0, null, "x".repeat(200)], legendTextColor: "url(unsafe)",
      legendBackgroundColor: "#ABCDEF", layoutTextColor: "#GGGGGG", legendScale: Infinity, layoutTextScale: "1.5", legendBackgroundOpacity: NaN,
      layoutPositions: { legend: { x: -1, y: 2 }, title: { x: "0.5", y: 0.2 }, subtitle: { x: Infinity, y: 0 }, source: { x: 0.2, y: 0.9 }, unexpected: { x: 0, y: 0 } }
    });
    assert.deepEqual(invalid.customColors, ["#abcdef"]); assert.equal(invalid.legendBackgroundColor, "#abcdef");
    assert.equal(invalid.reverseColors, false); assert.equal(invalid.legendShowMissing, true);
    assert.equal(invalid.legendTitle.length, 160); assert.deepEqual(invalid.legendLabels.slice(0, 3), ["First", "", ""]);
    assert.equal(invalid.legendLabels[3].length, 160);
    assert.equal(invalid.legendTextColor, MAP_STYLE_DEFAULTS.legendTextColor); assert.equal(invalid.layoutTextColor, MAP_STYLE_DEFAULTS.layoutTextColor);
    assert.equal(invalid.legendScale, 1); assert.equal(invalid.layoutTextScale, 1); assert.equal(invalid.legendBackgroundOpacity, 0.92);
    assert.deepEqual(invalid.layoutPositions, { legend: { x: 0, y: 1 }, source: { x: 0.2, y: 0.9 } });
    assert.equal(invalid.palette, "density"); assert.equal(invalid.classification, "equal"); assert.equal(invalid.boundarySource, "generated");
    const capped = validateProjectState({ scopeId: "PH", level: "region", customColors: Array(50).fill("#123456"), legendLabels: Array(50).fill("label"),
      legendScale: 100, layoutTextScale: 0, legendBackgroundOpacity: -1 });
    assert.equal(capped.customColors.length, 32); assert.equal(capped.legendLabels.length, 32);
    assert.equal(capped.legendScale, 2); assert.equal(capped.layoutTextScale, 0.5); assert.equal(capped.legendBackgroundOpacity, 0);
    const poison = validateProjectState(JSON.parse('{"scopeId":"PH","level":"region","layoutPositions":{"__proto__":{"x":0,"y":0},"constructor":{"x":0,"y":0},"legend":{"x":0.2,"y":0.3,"__proto__":{"polluted":true}}}}'));
    assert.deepEqual(Object.keys(poison.layoutPositions), ["legend"]); assert.deepEqual(poison.layoutPositions.legend, { x: 0.2, y: 0.3 });
    assert.equal({}.polluted, undefined);
    assert.deepEqual(validateProjectState({ scopeId: "PH", level: "region", layoutPositions: { title: Object.create({ x: 0.2, y: 0.3 }) } }).layoutPositions, {},
      "layout coordinates must be explicit values rather than inherited properties");

    const features = ["A", "B", "C"].map((code) => ({ code })), values = new Map([["A", 0], ["B", 50], ["C", 100]]);
    const originalPalettes = JSON.stringify(PALETTES);
    Object.assign(state, { customColors: ["#000000", "#ffffff"], reverseColors: false, bins: 3, customThresholds: "25,75" });
    for (const classification of ["equal", "quantile", "custom", "continuous"]) {
      state.classification = classification;
      let scale = buildScale(features, values);
      assert.equal(scale.colors[0], "#000000"); assert.equal(scale.colors.at(-1), "#ffffff");
      assert.equal(getFeatureFill(features[0], 0, scale), scale.colors[0]);
      assert.equal(getFeatureFill(features[2], 100, scale), scale.colors.at(-1));
      state.reverseColors = true; scale = buildScale(features, values);
      assert.equal(scale.colors[0], "#ffffff"); assert.equal(getFeatureFill(features[0], 0, scale), "#ffffff");
      assert.equal(getFeatureFill(features[2], 100, scale), "#000000");
      if (classification === "continuous") assert.equal(scale.colorForValue(50), "#808080");
      state.reverseColors = false;
    }
    state.classification = "equal"; state.customColors = [];
    const builtin = buildScale(features, values).colors;
    state.customColors = ["#ff0000", "bad"];
    assert.deepEqual(buildScale(features, values).colors, builtin, "one custom color must not replace a multicolor ramp");
    Object.assign(state, { customColors: ["#000000", "#ffffff"], legendLabels: ["Low", "", "High"], legendShowMissing: true, legendMissingLabel: "Not reported" });
    const legendScale = buildScale(features, values), withMissing = [...features, { code: "D" }];
    let entries = legendEntries(legendScale, withMissing, { valueByCode: values });
    assert.equal(entries.length, 4); assert.equal(entries[0].label, "Low"); assert.equal(entries[2].label, "High");
    assert(entries[1].label.includes("–"), "an empty custom class label must retain its automatic numeric range");
    assert.deepEqual(entries.slice(0, 3).map((entry) => entry.color), legendScale.colors, "legend swatches must use the exact fill scale");
    assert.deepEqual(entries.at(-1), { color: state.missingColor, label: "Not reported", index: -1 });
    assert.equal(legendEntries(legendScale, withMissing, { valueByCode: new Map() }).length, 1, "an all-missing map must retain its missing-data key");
    state.legendShowMissing = false;
    assert.equal(legendEntries(legendScale, withMissing, { valueByCode: new Map() }).length, 0);
    state.legendShowMissing = true; state.legendLabels = []; state.customColors = ["#ff0000"];
    state.classification = "highlight";
    let highlight = buildScale(features, values);
    assert.deepEqual(highlight.colors, ["#ff0000"]); assert.equal(getFeatureFill(features[0], 0, highlight), "#ff0000");
    entries = legendEntries(highlight, withMissing, { valueByCode: values });
    assert.equal(entries[0].label, "With statistic"); assert.equal(entries[0].color, "#ff0000");
    assert.equal(getFeatureFill(features[0], NaN, highlight), state.missingColor);
    state.customColors = []; highlight = buildScale(features, values);
    assert.equal(highlight.colors[0], state.highlightColor); assert.equal(highlight.colorForValue(0), state.highlightColor);
    state.classification = "custom"; state.customThresholds = Array.from({ length: 32 }, (_, i) => i + 1).join(","); state.reverseColors = true;
    const manyBuiltin = buildScale(features, values).colors;
    state.customColors = ["#000000", "#ffffff"];
    assert.deepEqual(buildScale(features, values).colors, manyBuiltin, "more than32 classes must retain the built-in ramp and reverse control");
    assert.equal(JSON.stringify(PALETTES), originalPalettes, "reversing must not mutate built-in palettes");
    const beforeLoad = { cancelMapGesture, confirmDataReplacement, resetWorkspaceEdits, render, projectInput: el.projectInput, areaFilterInput: el.areaFilterInput };
    let gestureCancellations = 0, projectRenders = 0;
    try {
      el.projectInput = { value: "chosen.json" }; el.areaFilterInput = { value: "old filter" };
      state.layoutPositions = { title: { x: 0.1, y: 0.1 } };
      Object.assign(layoutEditor, { enabled: true, selected: "title" });
      cancelMapGesture = () => { gestureCancellations++; state.layoutPositions.title = { x: 0.9, y: 0.9 }; };
      resetWorkspaceEdits = () => {}; render = () => { projectRenders++; };
      const projectEvent = { target: { files: [{ text: async () => JSON.stringify({ version: 2,
        state: { scopeId: "PH", level: "province", layoutPositions: { legend: { x: 0.35, y: 0.45 } } } }) }] } };
      confirmDataReplacement = async () => false;
      const beforeCancelledLoad = JSON.stringify(state);
      await loadProject(projectEvent);
      assert.equal(JSON.stringify(state), beforeCancelledLoad); assert.equal(gestureCancellations, 0); assert.equal(projectRenders, 0);
      assert(layoutEditor.enabled && layoutEditor.selected === "title", "cancelled replacement must preserve the previous editing mode");
      confirmDataReplacement = async () => true;
      await loadProject(projectEvent);
      assert.equal(gestureCancellations, 1); assert.equal(projectRenders, 1);
      assert(!layoutEditor.enabled && layoutEditor.selected === "legend", "confirmed project loading must reset ephemeral arrangement mode");
      assert.deepEqual(state.layoutPositions, { legend: { x: 0.35, y: 0.45 } }, "cancel the old gesture before assigning positions so its rollback cannot contaminate the new project");
    } finally {
      cancelMapGesture = beforeLoad.cancelMapGesture; confirmDataReplacement = beforeLoad.confirmDataReplacement;
      resetWorkspaceEdits = beforeLoad.resetWorkspaceEdits; render = beforeLoad.render;
      el.projectInput = beforeLoad.projectInput; el.areaFilterInput = beforeLoad.areaFilterInput;
    }
  } finally { Object.assign(state, previous); Object.assign(layoutEditor, previousEditor); downloadBlob = previousDownload; }
})()`, context);
console.log("Customization passed: color scales, safe project roundtrips, old-project defaults, and bounded layout settings");

const detailsState = vm.runInContext("state", context);
const previousDetailsState = Object.fromEntries(["placeOverrides", "statisticLabel", "valueColumn", "labelColumn", "sourceNote"].map((key) => [key, detailsState[key]]));
try {
  Object.assign(detailsState, { placeOverrides: {}, statisticLabel: "Value", valueColumn: "value", labelColumn: "label", sourceNote: "Imported statistics" });
  const sablayan = { code: "1705109000", name: "Sablayan", level: "city", adminType: "municipality", matchStatus: "matched",
    regionName: "MIMAROPA Region", provinceName: "Occidental Mindoro", cityName: "Sablayan" };
  const detailsJoin = (row) => ({ importedRowByCode: new Map(row ? [[sablayan.code, row]] : []) });
  const initialDetails = context.placeDetailsMarkup(sablayan, NaN, detailsJoin());
  assert.match(initialDetails, /Municipality/);
  assert.match(initialDetails, /MIMAROPA Region/); assert.match(initialDetails, /Occidental Mindoro/);
  assert.equal((initialDetails.match(/Sablayan/g) || []).length, 1, "a place must not repeat itself as a parent");
  assert.match(initialDetails, /PSGC code/); assert.match(initialDetails, /Philippine Standard Geographic Code/);
  assert.match(initialDetails, /<dt>Statistic<\/dt>/, "the generic value column must be called a statistic");
  assert.match(initialDetails, /No statistic has been added/);
  assert.match(initialDetails, /Missing does not mean zero/);
  assert.match(context.placeDetailsMarkup(sablayan, 5, detailsJoin()), /Mapped statistic/);
  assert.equal(context.placeTypeLabel({ level: "province" }), "Province");
  const cases = [
    { value: 0, row: { value: "0" }, override: {}, source: /CSV column: value/, content: /<strong>0<\/strong>/ },
    { value: NaN, row: { value: "   " }, override: {}, source: /CSV column: value/, content: /cell in the CSV is blank/ },
    { value: NaN, row: { value: "not-a-number" }, override: {}, source: /CSV column: value/, content: /CSV entry.*not-a-number.*not a valid number/ },
    { value: 0, row: { value: "73" }, override: { value: "0" }, source: /Manual entry/, content: /<strong>0<\/strong>/ },
    { value: NaN, row: { value: "73" }, override: { value: "  " }, source: /Manual entry/, content: /Cleared manually.*CSV value is overridden/ },
    { value: NaN, row: { value: "73" }, override: { value: "invalid" }, source: /Manual entry/, content: /manual statistic is not a valid number/ },
    { value: 73, row: { value: "73" }, override: { label: "Annotation only" }, source: /CSV column: value/, content: /<strong>73<\/strong>/ }
  ];
  for (const { value, row, override, source, content } of cases) {
    detailsState.placeOverrides = { [sablayan.code]: override };
    const markup = context.placeDetailsMarkup(sablayan, value, detailsJoin(row));
    assert.match(markup, source); assert.match(markup, content);
    if (!Number.isFinite(value)) assert.match(markup, /No statistic available/);
  }
  detailsState.placeOverrides = {};
  detailsState.sourceNote = "Illustrative sample statistics";
  assert.match(context.placeDetailsMarkup(sablayan, 0, detailsJoin({ value: "0" })), /not a demographic observation/);
  const independent = { ...sablayan, code: "0730600000", name: "City of Cebu", adminType: "highly_urbanized_city",
    regionName: "Central Visayas", provinceName: "Cebu", cityName: "City of Cebu" };
  for (const adminType of ["highly_urbanized_city", "independent_component_city"]) {
    const markup = context.placeDetailsMarkup({ ...independent, adminType }, NaN, detailsJoin());
    assert.doesNotMatch(markup, /<dt>Province<\/dt>/, "an independent city must not acquire its geographic province as a parent");
  }
  const barangay = { ...independent, code: "0730600001", name: "Sample barangay", level: "barangay", cityCode: independent.code, adminType: "" };
  const barangayDetails = context.placeDetailsMarkup(barangay, NaN, detailsJoin());
  assert.match(barangayDetails, /City of Cebu/);
  assert.doesNotMatch(barangayDetails, /<dt>Province<\/dt>/, "an HUC barangay must use its city's administrative parent context");
  const unmatched = context.placeDetailsMarkup({ ...sablayan, code: "NAMRIA_PH1705109", matchStatus: "unmatched" }, NaN, detailsJoin());
  assert.match(unmatched, /Source identifier/); assert.match(unmatched, /not an official PSGC code/);
  assert.doesNotMatch(unmatched, /<dt>PSGC code<\/dt>/);
  assert.doesNotMatch(context.placeDetailsMarkup({ ...sablayan, matchStatus: "unmatched" }, NaN, detailsJoin()), /<dt>PSGC code<\/dt>/,
    "a numeric-looking unmatched source record must not be certified as PSGC");
  assert.match(context.placeDetailsMarkup({ ...sablayan, matchStatus: "fuzzy" }, NaN, detailsJoin()), /similar name/);
  Object.assign(detailsState, { statisticLabel: "People <unsafe-stat>", valueColumn: "count<unsafe-column>", labelColumn: "label" });
  const unsafeFeature = { ...sablayan, code: "NAMRIA_<unsafe-code>", name: "Place <unsafe-name>", regionName: "Region <unsafe-region>", provinceName: "Province <unsafe-province>" };
  const unsafeJoin = { importedRowByCode: new Map([[unsafeFeature.code, { [detailsState.valueColumn]: "<unsafe-value>", label: "<unsafe-label>" }]]) };
  const escaped = context.placeDetailsMarkup(unsafeFeature, NaN, unsafeJoin);
  for (const field of ["stat", "column", "code", "name", "region", "province", "value", "label"]) {
    assert(escaped.includes("&lt;unsafe-" + field + "&gt;"), "dynamic place detail must be escaped: " + field);
    assert(!escaped.includes("<unsafe-" + field + ">"));
  }
  detailsState.placeOverrides = { [unsafeFeature.code]: { label: "<unsafe-manual-label>" } };
  assert.match(context.placeDetailsMarkup(unsafeFeature, NaN, unsafeJoin), /&lt;unsafe-manual-label&gt;/);
} finally { Object.assign(detailsState, previousDetailsState); }
console.log("Place details passed: hierarchy, explicit identifiers, reason-aware statistics, provenance, independent cities, and escaped fields");

vm.runInContext(`
  {
    state.boundarySource = "generated";
    state.level = "barangay";
    const scope = getScopes().find((item) => item.type === "city");
    state.scopeId = scope.id;
    generatedBarangayFeaturesByScope.set(barangayScopeKey(scope), [independentlyLoaded]);
    state.generatedBarangayMessage = "Previous scope: 99 geometry records";
    maybeLoadGeneratedBarangaysForScope();
    assert(state.generatedBarangayMessage.startsWith(scope.name + ":"), "cached scopes must report their own name");
    assert(state.generatedBarangayMessage.includes("1 geometry records"), "cached scopes must report their own count");
    for (const [box, width, height] of [[[0, 0, 100, 200], 1600, 2000], [[20, 30, 300, 100], 1000, 2000]]) {
      const fitted = fitExportViewBox(box, width, height);
      assert(Math.abs(fitted[2] / fitted[3] - width / height) < 1e-12, "export frame must match the target aspect ratio");
      assert.equal(fitted[0] + fitted[2] / 2, box[0] + box[2] / 2, "export fitting must preserve horizontal center");
      assert.equal(fitted[1] + fitted[3] / 2, box[1] + box[3] / 2, "export fitting must preserve vertical center");
      assert(fitted[2] >= box[2] && fitted[3] >= box[3], "export fitting must preserve all source geometry");
    }
    const bounded = validateProjectState({ scopeId: "PH", level: "region", exportWidth: 1e9, exportHeight: -1 });
    assert.equal(bounded.exportWidth, 5000);
    assert.equal(bounded.exportHeight, 640);
    const originalSerialize = serializeMapSvg, originalImage = Image, originalCreate = document.createElement;
    serializeMapSvg = () => '<svg xmlns="http://www.w3.org/2000/svg" />';
    Image = function () { Object.defineProperty(this, "src", { set: () => this.onload() }); };
    const calls = [];
    document.createElement = () => ({ getContext: () => ({ clearRect() { calls.push("clear"); }, fillRect() { calls.push("fill"); }, drawImage() { calls.push("draw"); } }), toBlob() {} });
    state.transparent = false;
    exportPng();
    assert.deepEqual(calls, ["clear", "fill", "draw"], "opaque PNG must fill its entire canvas before drawing");
    calls.length = 0;
    state.transparent = true;
    exportPng();
    assert.deepEqual(calls, ["clear", "draw"], "transparent PNG must preserve the clear canvas");
    serializeMapSvg = originalSerialize; Image = originalImage; document.createElement = originalCreate;
  }
`, context);

console.log("Cached status and export fixtures passed: fresh counts, undistorted frames, bounded dimensions, and PNG backgrounds");

vm.runInContext(`
  {
    const originalCreate = document.createElementNS, originalSerializer = globalThis.XMLSerializer, originalMap = el.mapSvg;
    const svgNode = (tag, attributes = {}) => ({
      tag, attributes: { ...attributes }, children: [], parent: null,
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key] ?? null; },
      removeAttribute(key) { delete this.attributes[key]; },
      getBoundingClientRect() { return { width: 390, height: 600 }; },
      get firstChild() { return this.children[0] || null; },
      appendChild(child) {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = this; this.children.push(child); return child;
      },
      insertBefore(child, before) { child.parent = this; this.children.splice(this.children.indexOf(before), 0, child); },
      remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
      querySelectorAll(selector) {
        const result = [], selectors = selector.split(",").map((item) => item.trim());
        const visit = (node) => node.children.forEach((child) => {
          if (selectors.some((item) => item.startsWith(".") ? (child.attributes.class || "").split(/\\s+/).includes(item.slice(1))
            : item.startsWith("[") ? Object.hasOwn(child.attributes, item.slice(1, -1)) : child.tag === item)) result.push(child);
          visit(child);
        });
        visit(this); return result;
      }
    });
    let exportedTree;
    document.createElementNS = (_namespace, tag) => svgNode(tag);
    globalThis.XMLSerializer = function () { this.serializeToString = (node) => { exportedTree = node; return "<svg/>"; }; };
    try {
      state.exportWidth = 1600; state.exportHeight = 2000; state.backgroundColor = "#fff4e6";
      for (const transparent of [false, true]) {
        const clone = svgNode("svg", { viewBox: "0 0 100 200", class: "map-canvas is-arranging" });
        clone.appendChild(svgNode("path", { class: "map-feature", role: "button", tabindex: "0", d: "M -20 20 L -10 20 L -10 40 Z" }));
        clone.appendChild(svgNode("text", { class: "map-label" }));
        clone.appendChild(svgNode("text", { class: "layout-title" }));
        const arranged = svgNode("g", { class: "layout-item is-layout-selected legend-layout", "data-layout-item": "legend", "data-layout-x": "0.1", "data-layout-y": "0.2", "data-layout-width": "20", "data-layout-height": "40",
          role: "button", tabindex: "0", "aria-label": "Move legend", transform: "translate(12 34) scale(1.2)", style: "opacity:0.8" });
        arranged.appendChild(svgNode("rect", { fill: "#123456" }));
        arranged.appendChild(svgNode("rect", { "data-editor-only": "true", class: "resize-handle" }));
        clone.appendChild(arranged); clone.appendChild(svgNode("rect", { "data-editor-only": "true" }));
        el.mapSvg = { cloneNode: () => clone };
        state.transparent = transparent;
        serializeMapSvg();
        assert.equal(exportedTree.getAttribute("viewBox"), "-30 0 160 200");
        const definitions = exportedTree.children.find((node) => node.tag === "defs");
        const clip = definitions.firstChild, viewport = clip.firstChild;
        assert.equal(clip.tag, "clipPath");
        assert.equal(clip.getAttribute("clipPathUnits"), "userSpaceOnUse");
        assert.deepEqual(viewport.attributes, { x: "0", y: "0", width: "100", height: "200" },
          "export clipping must retain the original preview extent rather than its padded frame");
        const content = exportedTree.children.find((node) => node.tag === "g");
        assert.equal(content.getAttribute("clip-path"), "url(#" + clip.getAttribute("id") + ")");
        assert.deepEqual(content.children.map((node) => node.tag), ["path", "text", "text", "g"],
          "geometry, place labels, and layout text must all stay inside the preview clip");
        assert.equal(exportedTree.getAttribute("class"), "map-canvas");
        assert.deepEqual(arranged.attributes, { class: "legend-layout", transform: "translate(12 34) scale(1.2)", style: "opacity:0.8" },
          "arranged transforms and styling must survive while editing markers and roles are removed");
        assert.equal(arranged.children.length, 1); assert.equal(arranged.firstChild.getAttribute("fill"), "#123456");
        assert.equal(exportedTree.querySelectorAll("[data-editor-only], [data-layout-item], .is-layout-selected, .is-arranging").length, 0);
        assert.equal(content.firstChild.getAttribute("role"), null); assert.equal(content.firstChild.getAttribute("tabindex"), null);
        const background = exportedTree.children.find((node) => node.tag === "rect");
        if (transparent) assert.equal(background, undefined, "transparent padding must not gain a background");
        else assert.deepEqual(background.attributes, { x: "-30", y: "0", width: "160", height: "200", fill: "#fff4e6" },
          "opaque padding must cover the fitted frame outside the clipped preview");
      }
      el.mapSvg = svgNode("svg");
      state.sourceNote = "Boundary source";
      renderLayoutText([0, 0, 13, 20]);
      const sourceGroup = el.mapSvg.children.find((node) => node.getAttribute("data-layout-item") === "source");
      assert(sourceGroup.querySelectorAll("text").some((node) => node.textContent === "Boundary source"), "source text must remain within its movable group");
      const sourceTop = Number(sourceGroup.getAttribute("data-layout-y")) * 20, sourceMetrics = layoutItemMetrics.get(sourceGroup);
      assert(sourceTop > 18 && sourceTop + sourceMetrics.height <= 20,
        "movable source notes must stay bounded near the bottom of small city map extents");
    } finally {
      document.createElementNS = originalCreate; globalThis.XMLSerializer = originalSerializer; el.mapSvg = originalMap;
    }

    const originalFeatures = generatedAdminFeatures, originalInput = el.geographySearchInput, originalNote = el.densityNote, originalRender = render;
    generatedAdminFeatures = [...originalFeatures,
      { ...originalFeatures[2], code: "0702201000", name: "San Jose" },
      { ...originalFeatures[2], code: "0702202000", name: "San Jose" }];
    el.geographySearchInput = { value: " 0730600000 " }; el.densityNote = { textContent: "" };
    let searchRenders = 0; render = () => { searchRenders++; };
    try {
      state.boundarySource = "generated"; state.scopeId = "PH"; state.level = "province"; state.selectedCode = null;
      selectSearchedGeography();
      assert.equal(state.selectedCode, "0730600000", "exact PSGC search must select the matching geography");
      assert.equal(state.scopeId, "REG-0700000000");
      assert.equal(state.level, "city");
      assert.equal(el.geographySearchInput.value, "");
      assert.equal(searchRenders, 1);
      state.selectedCode = null; el.geographySearchInput.value = "San Jose";
      selectSearchedGeography();
      assert.equal(state.selectedCode, null, "ambiguous names must not silently select one place");
      assert.equal(searchRenders, 1);
      assert.equal(el.geographySearchInput.value, "San Jose");
      assert(el.densityNote.textContent.includes("Several places"));
    } finally {
      generatedAdminFeatures = originalFeatures; el.geographySearchInput = originalInput; el.densityNote = originalNote; render = originalRender;
    }
  }
`, context);

console.log("Preview export and geography search passed: clipped padding, exact codes, and ambiguous-name refusal");

await vm.runInContext(`(async () => {
  const previous = { ...state }, previousDownload = downloadBlob, previousAlert = globalThis.alert;
  const previousRender = render, previousConfirm = confirmDataReplacement, previousInput = el.projectInput;
  try {
    const quoted = parseCsv('psgc_code,name,value\\r\\n0100000000,"A, ""quoted"" place\\nsecond line",0\\r\\n');
    assert.equal(quoted.rows[0].name, 'A, "quoted" place\\nsecond line');
    assert.equal(quoted.rows[0].value, "0");
    for (const malformed of [
      'code,value,value\\nA,1,2', 'code,Value,value\\nA,1,2', 'code,\\nA,1',
      'code,name,value\\nA,Place,1,000', 'code,name,value\\nA,Place',
      'code,value\\nA,"unclosed', 'code,value\\nA,bad"quote', 'code,value\\nA,"1"extra'
    ]) assert.throws(() => parseCsv(malformed), /CSV/, "ambiguous CSV structure must be rejected");
    const unusualHeaders = parseCsv('__proto__,constructor,value\\nplain,ordinary,0');
    assert.equal(unusualHeaders.rows[0].__proto__, "plain");
    assert.equal(unusualHeaders.rows[0].constructor, "ordinary");
    assert.equal({}.plain, undefined);

    Object.assign(state, { boundarySource: "fixture", scopeId: "PH", level: "region" });
    const feature = ADMIN_FEATURES.find((item) => item.level === "region");
    parseImportedCsv('psgc_code,name,Population (2025)\\n' + feature.code + ',Example,1234');
    assert.equal(state.valueColumn, "Population (2025)");
    assert.equal(buildJoin().valueByCode.get(feature.code), 1234, "the PSGC identifier must never become the inferred statistic");
    assert.equal(chooseNumericColumn([{ psgc_code: feature.code, other_id: "99" }], ["psgc_code", "other_id"]), undefined);
    parseImportedCsv('psgc_code\\n' + feature.code);
    assert.equal(state.valueColumn, "");
    assert.equal(buildJoin().valueByCode.size, 0, "a code-only file contains no statistic");
    state.placeOverrides = { [feature.code]: { value: "73", label: "Keep me" } };
    const beforeBadCsv = JSON.stringify(state);
    assert.throws(() => parseImportedCsv('code,value,value\\nA,1,2'), /CSV/);
    assert.equal(JSON.stringify(state), beforeBadCsv, "parse errors must not replace imported data or place edits");

    const malicious = 'red"><img src="data:," onerror="document.documentElement.dataset.auditPoc=1">';
    for (const key of ["borderColor", "missingColor", "highlightColor", "backgroundColor", "legendTextColor", "legendBackgroundColor", "layoutTextColor"]) {
      const loaded = validateProjectState({ scopeId: "PH", level: "region", [key]: malicious });
      assert.equal(loaded[key], PROJECT_STATE_DEFAULTS[key], "unsafe color must use a fresh safe default: " + key);
      assert.equal(validateProjectState({ scopeId: "PH", level: "region", [key]: "#ABCDEF" })[key], "#abcdef");
    }
    const unsafeHighlight = validateProjectState({ scopeId: "PH", level: "region", classification: "highlight", highlightColor: malicious });
    Object.assign(state, unsafeHighlight);
    assert.match(buildScale([{ code: "A" }], new Map([["A", 1]])).colors[0], /^#[0-9a-f]{6}$/);

    for (const invalid of [
      { importedRows: [null] }, { importedRows: [[]] }, { importedRows: [1] }, { importedRows: [{ value: {} }] },
      { importedRows: [{ value: true }] }, { importedRows: [{ value: Infinity }] }, { importedRows: {} },
      { columns: [null] }, { columns: [{}] }, { columns: [""] }, { columns: ["value", "VALUE"] },
      { columns: [" value "] }, { importedRows: [{ value: "1" }] },
      { columns: ["psgc_code", "value"], importedRows: [{ psgc_code: "A", value: "1" }], keyColumn: "absent" }
    ]) assert.equal(validateProjectState({ scopeId: "PH", level: "region", ...invalid }), null, "invalid project data shapes must be rejected before replacement");
    assert.equal(validateProjectState({ scopeId: "PH", level: "unknown" }), null);
    assert.equal(validateProjectState({ scopeId: "invalid", level: "region" }), null);
    const old = validateProjectState({ scopeId: "PH", level: "region" });
    assert.deepEqual(Object.keys(old).sort(), PROJECT_STATE_KEYS.slice().sort(), "validation must return complete persisted state");
    assert.deepEqual(old.importedRows, []); assert.deepEqual(old.columns, []);
    assert.equal(old.projectName, PROJECT_STATE_DEFAULTS.projectName);
    assert.equal(old.backgroundColor, PROJECT_STATE_DEFAULTS.backgroundColor);
    const source = { scopeId: "PH", level: "region", columns: ["psgc_code", "constructor", "value"], importedRows: [{ psgc_code: feature.code, value: 0 }] };
    const detached = validateProjectState(source);
    assert.equal(detached.importedRows[0].value, "0");
    assert.equal(detached.importedRows[0].constructor, "", "missing CSV fields must not resolve inherited object properties");
    detached.importedRows[0].value = "changed"; detached.columns.push("extra");
    assert.equal(source.importedRows[0].value, 0); assert.equal(source.columns.length, 3);

    Object.assign(state, { importedRows: [{ psgc_code: feature.code, value: "17" }], columns: ["psgc_code", "value"], placeOverrides: { [feature.code]: { value: "42" } } });
    let confirmations = 0, renders = 0, alerts = 0;
    globalThis.alert = () => { alerts++; }; confirmDataReplacement = async () => { confirmations++; return true; };
    render = () => { renders++; }; el.projectInput = { value: "bad.json" };
    const beforeBadProject = JSON.stringify(state);
    await loadProject({ target: { files: [{ text: async () => JSON.stringify({ version: 2, state: { scopeId: "PH", level: "region", importedRows: [null] } }) }] } });
    assert.equal(JSON.stringify(state), beforeBadProject, "rejected projects must preserve the active project atomically");
    assert.equal(confirmations, 0); assert.equal(renders, 0); assert.equal(alerts, 1); assert.equal(el.projectInput.value, "");
    const payload = projectPayload();
    payload.state.importedRows[0].value = "detached";
    assert.equal(state.importedRows[0].value, "17", "recovery/save payloads must be detached snapshots");

    Object.assign(state, { boundarySource: "fixture", scopeId: "PH", level: "region", placeOverrides: {} });
    parseImportedCsv('psgc_code,name,value,_status,_row_number,_value,input__status,_Detail\\nBAD,Example,nope,Trusted,999,0,Original,Untrusted detail');
    let report;
    downloadBlob = (blob) => { report = blob; };
    exportImportIssues();
    const issueCsv = parseCsv(await report.text());
    assert.equal(issueCsv.rows[0]._status, "Unknown code"); assert.equal(issueCsv.rows[0]._row_number, "1"); assert.equal(issueCsv.rows[0]._value, "nope");
    assert.equal(issueCsv.rows[0].input_input__status, "Trusted", "reserved original fields must be retained with unique names");
    assert.equal(issueCsv.rows[0].input__status, "Original"); assert.equal(issueCsv.rows[0].input__row_number, "999"); assert.equal(issueCsv.rows[0].input__value, "0");
    assert.equal(issueCsv.rows[0].input__Detail, "Untrusted detail"); assert.notEqual(issueCsv.rows[0]._detail, "Untrusted detail");

    Object.assign(state, { bins: 3, palette: "density", customColors: [], reverseColors: false, legendLabels: [], customThresholds: "" });
    const features = ["A", "B", "C"].map((code) => ({ code })), rates = new Map([["A", 0.001], ["B", 0.002], ["C", 0.003]]);
    assert.equal(formatNumber(0.001), "0.001"); assert.equal(formatNumber(-0.001), "-0.001"); assert.notEqual(formatNumber(1e-30), "0");
    assert.equal(formatNumber(123456789012345), "123,456,789,012,345", "precision changes must not round whole counts");
    assert.equal(formatNumber(1.2345, 2), "1.23");
    state.numberPrecision = 2;
    assert.equal(formatNumber(1.2345), "1.23", "saved display precision must apply by default");
    assert.equal(formatNumber(1.2345, "auto"), "1.2345", "an explicit precision argument must take precedence");
    state.numberPrecision = "auto";
    for (const classification of ["equal", "quantile", "continuous"]) {
      state.classification = classification;
      const scale = buildScale(features, rates), entries = legendEntries(scale, features, { valueByCode: rates });
      assert.equal(new Set(entries.map((entry) => entry.label)).size, entries.length, "small-rate class labels must remain distinguishable");
      assert(entries.every((entry) => entry.label !== "0" && entry.label !== "0 – 0"));
      const constant = new Map(features.map((feature) => [feature.code, 5]));
      const constantScale = buildScale(features, constant);
      assert.equal(constantScale.colors.length, 1, "constant-valued data must have one meaningful color group");
      assert.equal(legendEntries(constantScale, features, { valueByCode: constant }).length, 1);
    }
    state.customColors = ["#123456"];
    assert.equal(buildScale(features, new Map(features.map((feature) => [feature.code, 5]))).colorForValue(5), "#123456", "a sole constant group must remain color-editable");
  } finally {
    Object.assign(state, previous); downloadBlob = previousDownload; globalThis.alert = previousAlert;
    render = previousRender; confirmDataReplacement = previousConfirm; el.projectInput = previousInput;
  }
})()`, context);
console.log("Import trust boundaries passed: strict CSV, identifier inference, safe complete projects, atomic rejection, precision, constant groups, and issue metadata");

// ponytail: local source checks are optional; the synthetic regression suite never downloads boundaries.
if (existsSync("data/generated/barangays/national.geojson")) {
  const lookup = JSON.parse(await readFile("data/generated/admin_lookup.json", "utf8"));
  const cityCodes = new Set(lookup.filter((entry) => entry.level === "city").map((entry) => entry.psgc_code));
  for (const [code, name] of [["0730600000", "Cebu City"], ["1381300000", "Quezon City"], ["1130700000", "Davao City"]]) {
    assert(cityCodes.has(code), `${name} must have a canonical generated city record`);
    const scoped = JSON.parse(await readFile(`data/generated/barangays/city/${code}.geojson`, "utf8"));
    assert(scoped.features.length > 0, `${name} must have a nonempty barangay chunk`);
    assert(scoped.features.every((feature) => feature.properties.city_municipality_code === code),
      `${name} barangays must use canonical PSGC city parents rather than NAMRIA's geographic keys`);
  }
  console.log("Optional local generated data passed: canonical HUC barangay chunks");
} else {
  console.log("Optional local generated data skipped: national boundary output is not present");
}
