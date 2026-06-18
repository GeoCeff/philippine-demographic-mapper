import { readFile } from "node:fs/promises";
import vm from "node:vm";

const scriptOrder = [
  "src/data.js",
  "src/state.js",
  "src/utils.js",
  "src/boundary-loader.js",
  "src/csv.js",
  "src/matching.js",
  "src/classification.js",
  "src/render-utils.js",
  "src/export.js",
  "src/app.js"
];

const context = vm.createContext({
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

const generatedBoundaryJson = await readFile("data/generated/admin_boundaries.normalized.geojson", "utf8");

vm.runInContext(`
  const generatedFeatures = geoJsonToAdminFeatures(${generatedBoundaryJson});
  if (generatedFeatures.length !== 7) throw new Error("expected 7 generated boundary features");
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
