import { readFile } from "node:fs/promises";

const expected = {
  "sample-data/region_values.csv": { rows: 12, columns: ["psgc_code", "name", "value"] },
  "sample-data/province_values.csv": { rows: 12, columns: ["psgc_code", "name", "value"] },
  "sample-data/barangay_values.csv": { rows: 12, columns: ["psgc_code", "name", "value", "households"] },
  "sample-data/match_issues_demo.csv": { rows: 7, columns: ["psgc_code", "name", "value"] }
};

for (const [file, spec] of Object.entries(expected)) {
  const rows = parseCsv(await readFile(file, "utf8"));
  assert(rows.length === spec.rows, `${file}: expected ${spec.rows} rows, got ${rows.length}`);
  assert(spec.columns.every((column) => column in rows[0]), `${file}: missing required columns`);
}

console.log(`Validated ${Object.keys(expected).length} sample CSVs`);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const columns = lines.shift().split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
