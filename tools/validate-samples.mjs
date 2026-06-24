import { readFile } from "node:fs/promises";

const expected = {
  "sample-data/region_values.csv": { rows: 12, columns: ["psgc_code", "name", "value"], numeric: ["value"] },
  "sample-data/province_values.csv": { rows: 12, columns: ["psgc_code", "name", "value"], numeric: ["value"] },
  "sample-data/barangay_values.csv": { rows: 12, columns: ["psgc_code", "name", "value", "households"], numeric: ["value", "households"] },
  "sample-data/match_issues_demo.csv": { rows: 7, columns: ["psgc_code", "name", "value"], demoIssues: true }
};

for (const [file, spec] of Object.entries(expected)) {
  const rows = parseCsv(await readFile(file, "utf8"));
  assert(rows.length === spec.rows, `${file}: expected ${spec.rows} rows, got ${rows.length}`);
  assert(spec.columns.every((column) => column in rows[0]), `${file}: missing required columns`);

  if (spec.demoIssues) {
    assert(rows.some((row) => !row.psgc_code), `${file}: expected a missing-code demo row`);
    assert(rows.some((row) => !Number.isFinite(Number(row.value))), `${file}: expected an invalid-value demo row`);
    assert(new Set(rows.map((row) => row.psgc_code)).size < rows.length, `${file}: expected a duplicate-code demo row`);
    continue;
  }

  rows.forEach((row, index) => {
    const rowName = `${file} row ${index + 2}`;
    assert(/^\d{10}$/.test(row.psgc_code), `${rowName}: PSGC code must be 10 digits`);
    assert(row.name.trim(), `${rowName}: name is required`);
    spec.numeric.forEach((column) => {
      assert(Number.isFinite(Number(row[column])), `${rowName}: ${column} must be numeric`);
    });
  });
}

console.log(`Validated ${Object.keys(expected).length} sample CSVs`);

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const columns = lines.shift().split(",");
  return lines.map((line, index) => {
    const values = line.split(",");
    assert(values.length === columns.length, `CSV row ${index + 2}: expected ${columns.length} columns, got ${values.length}`);
    return Object.fromEntries(values.map((value, valueIndex) => [columns[valueIndex], value]));
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
