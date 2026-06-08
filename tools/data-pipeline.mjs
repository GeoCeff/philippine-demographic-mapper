import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const DEFAULTS = {
  psgc: "tools/fixtures/psgc_sample.csv",
  boundaries: "tools/fixtures/boundaries_sample.geojson",
  out: "data/generated",
  report: "data/psgc_reconciliation_report.md",
  metadata: "data/source_metadata.json"
};

const FIELD_CANDIDATES = {
  code: ["psgc_code", "PSGC_CODE", "psgc", "PSGC", "code", "CODE", "pcode", "PCODE", "adm_pcode"],
  name: ["name", "Name", "area_name", "AREA_NAME", "adm_name", "ADM_NAME", "ADM1_EN", "ADM2_EN", "ADM3_EN", "ADM4_EN"],
  level: ["level", "Level", "geographic_level", "GEOGRAPHIC_LEVEL", "admin_level", "adm_level", "ADM_LEVEL"],
  regionCode: ["region_code", "REGION_CODE", "reg_code", "ADM1_PCODE", "adm1_pcode"],
  provinceCode: ["province_code", "PROVINCE_CODE", "prv_code", "ADM2_PCODE", "adm2_pcode"],
  cityCode: ["city_municipality_code", "CITY_MUNICIPALITY_CODE", "municipality_code", "mun_code", "ADM3_PCODE", "adm3_pcode"],
  barangayCode: ["barangay_code", "BARANGAY_CODE", "bgy_code", "ADM4_PCODE", "adm4_pcode"],
  version: ["source_version", "version", "Version", "psgc_version", "PSGC_VERSION"]
};

const LEVEL_ALIASES = new Map([
  ["reg", "region"],
  ["region", "region"],
  ["adm1", "region"],
  ["province", "province"],
  ["prov", "province"],
  ["district", "province"],
  ["adm2", "province"],
  ["city", "city"],
  ["municipality", "city"],
  ["municipalities", "city"],
  ["city/municipality", "city"],
  ["city municipality", "city"],
  ["mun", "city"],
  ["adm3", "city"],
  ["barangay", "barangay"],
  ["bgy", "barangay"],
  ["adm4", "barangay"]
]);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.validate) {
    await validateGenerated(args.validate, args.lookup);
    return;
  }

  const options = { ...DEFAULTS, ...args };
  const psgcRecords = await readPsgc(options.psgc);
  const boundaryCollection = await readGeoJson(options.boundaries);
  const boundaryRecords = boundaryCollection.features.map((feature, index) => normalizeBoundaryFeature(feature, index));
  const reconciliation = reconcile(psgcRecords, boundaryRecords);
  await writeOutputs(options, reconciliation);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

async function readPsgc(filePath) {
  const text = await readFile(filePath, "utf8");
  const ext = extname(filePath).toLowerCase();
  const records = ext === ".json" ? extractJsonRecords(JSON.parse(text)) : parseCsv(text);
  return records.map(normalizePsgcRecord).filter((record) => record.psgc_code && record.name && record.level);
}

async function readGeoJson(filePath) {
  const collection = JSON.parse(await readFile(filePath, "utf8"));
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${filePath} must be a GeoJSON FeatureCollection`);
  }
  return collection;
}

function extractJsonRecords(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "results", "records", "features"]) {
    if (Array.isArray(payload[key])) {
      if (key === "features") return payload[key].map((feature) => feature.properties || feature);
      return payload[key];
    }
  }
  throw new Error("JSON PSGC input must be an array or contain data/results/records");
}

function normalizePsgcRecord(record) {
  const code = normalizeCode(pick(record, FIELD_CANDIDATES.code));
  const level = normalizeLevel(pick(record, FIELD_CANDIDATES.level), code);
  const parents = deriveParentCodes(code, level, record);
  return {
    psgc_code: code,
    name: cleanName(pick(record, FIELD_CANDIDATES.name)),
    level,
    region_code: parents.region_code,
    province_code: parents.province_code,
    city_municipality_code: parents.city_municipality_code,
    barangay_code: level === "barangay" ? code : normalizeCode(pick(record, FIELD_CANDIDATES.barangayCode)),
    source_version: String(pick(record, FIELD_CANDIDATES.version) || ""),
    raw: record
  };
}

function normalizeBoundaryFeature(feature, index) {
  const properties = feature.properties || {};
  const code = normalizeCode(pick(properties, FIELD_CANDIDATES.code));
  const level = normalizeLevel(pick(properties, FIELD_CANDIDATES.level), code);
  const parents = deriveParentCodes(code, level, properties);
  return {
    psgc_code: code,
    name: cleanName(pick(properties, FIELD_CANDIDATES.name)),
    level,
    region_code: parents.region_code,
    province_code: parents.province_code,
    city_municipality_code: parents.city_municipality_code,
    barangay_code: level === "barangay" ? code : normalizeCode(pick(properties, FIELD_CANDIDATES.barangayCode)),
    source_version: String(pick(properties, FIELD_CANDIDATES.version) || ""),
    geometry: feature.geometry,
    source_index: index,
    raw_properties: properties
  };
}

function deriveParentCodes(code, level, record) {
  const explicit = {
    region_code: normalizeCode(pick(record, FIELD_CANDIDATES.regionCode)),
    province_code: normalizeCode(pick(record, FIELD_CANDIDATES.provinceCode)),
    city_municipality_code: normalizeCode(pick(record, FIELD_CANDIDATES.cityCode))
  };
  if (!code) return explicit;

  const officialRegion = `${code.slice(0, 2)}00000000`;
  const officialProvince = `${code.slice(0, 5)}00000`;
  const officialCity = `${code.slice(0, 7)}000`;

  return {
    region_code: explicit.region_code || (level ? officialRegion : ""),
    province_code: explicit.province_code || (level === "province" ? code : ["city", "barangay"].includes(level) ? officialProvince : ""),
    city_municipality_code: explicit.city_municipality_code || (level === "city" ? code : level === "barangay" ? officialCity : "")
  };
}

function reconcile(psgcRecords, boundaryRecords) {
  const psgcByCode = new Map();
  const duplicatePsgcCodes = new Set();
  for (const record of psgcRecords) {
    if (psgcByCode.has(record.psgc_code)) duplicatePsgcCodes.add(record.psgc_code);
    psgcByCode.set(record.psgc_code, record);
  }

  const boundaryNameIndex = buildNameIndex(boundaryRecords);
  const psgcNameIndex = buildNameIndex(psgcRecords);
  const matchedPsgcCodes = new Set();
  const matched = [];
  const boundaryOnly = [];
  const duplicateBoundaryCodes = new Set();
  const seenBoundaryCodes = new Set();

  for (const boundary of boundaryRecords) {
    if (seenBoundaryCodes.has(boundary.psgc_code)) duplicateBoundaryCodes.add(boundary.psgc_code);
    seenBoundaryCodes.add(boundary.psgc_code);

    const codeMatch = psgcByCode.get(boundary.psgc_code);
    if (codeMatch) {
      matched.push({ method: "psgc_code", psgc: codeMatch, boundary });
      matchedPsgcCodes.add(codeMatch.psgc_code);
      continue;
    }

    const nameKey = matchKey(boundary);
    const candidates = psgcNameIndex.get(nameKey) || [];
    if (candidates.length === 1) {
      matched.push({ method: "name_parent", psgc: candidates[0], boundary });
      matchedPsgcCodes.add(candidates[0].psgc_code);
      continue;
    }

    boundaryOnly.push({
      ...boundary,
      ambiguity_count: candidates.length,
      nearby_boundary_name_count: (boundaryNameIndex.get(nameKey) || []).length
    });
  }

  const psgcOnly = psgcRecords.filter((record) => !matchedPsgcCodes.has(record.psgc_code));
  const features = matched.map(({ method, psgc, boundary }) => ({
    type: "Feature",
    properties: {
      psgc_code: psgc.psgc_code,
      name: psgc.name,
      level: psgc.level,
      region_code: psgc.region_code,
      province_code: psgc.province_code,
      city_municipality_code: psgc.city_municipality_code,
      barangay_code: psgc.barangay_code,
      source_version: psgc.source_version || boundary.source_version,
      boundary_source_version: boundary.source_version,
      match_status: "matched",
      match_method: method,
      boundary_source_index: boundary.source_index
    },
    geometry: boundary.geometry
  }));

  return {
    psgcRecords,
    boundaryRecords,
    matched,
    psgcOnly,
    boundaryOnly,
    duplicatePsgcCodes: [...duplicatePsgcCodes],
    duplicateBoundaryCodes: [...duplicateBoundaryCodes].filter(Boolean),
    featureCollection: { type: "FeatureCollection", features },
    lookup: buildLookup(features, psgcOnly)
  };
}

function buildNameIndex(records) {
  const index = new Map();
  for (const record of records) {
    const key = matchKey(record);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  }
  return index;
}

function matchKey(record) {
  return [record.level, parentMatchCode(record), normalizeName(record.name)].join("|");
}

function parentMatchCode(record) {
  if (record.level === "barangay") return record.city_municipality_code || record.province_code || record.region_code || "";
  if (record.level === "city") return record.province_code || record.region_code || "";
  if (record.level === "province") return record.region_code || "";
  return "";
}

function buildLookup(features, psgcOnly) {
  const matched = features.map((feature) => ({
    ...feature.properties,
    bbox: geometryBbox(feature.geometry),
    has_geometry: true
  }));
  const unmatched = psgcOnly.map((record) => ({
    psgc_code: record.psgc_code,
    name: record.name,
    level: record.level,
    region_code: record.region_code,
    province_code: record.province_code,
    city_municipality_code: record.city_municipality_code,
    barangay_code: record.barangay_code,
    source_version: record.source_version,
    bbox: null,
    has_geometry: false
  }));
  return [...matched, ...unmatched].sort((a, b) => a.psgc_code.localeCompare(b.psgc_code));
}

async function writeOutputs(options, reconciliation) {
  await mkdir(options.out, { recursive: true });
  const boundaryPath = resolve(options.out, "admin_boundaries.normalized.geojson");
  const lookupPath = resolve(options.out, "admin_lookup.json");
  await writeFile(boundaryPath, `${JSON.stringify(reconciliation.featureCollection, null, 2)}\n`);
  await writeFile(lookupPath, `${JSON.stringify(reconciliation.lookup, null, 2)}\n`);
  await writeFile(options.report, buildReport(reconciliation));
  await writeGeneratedMetadata(options, reconciliation, boundaryPath, lookupPath);
  console.log(`Wrote ${reconciliation.featureCollection.features.length} normalized boundary features`);
  console.log(`Wrote ${lookupPath}`);
  console.log(`Wrote ${options.report}`);
}

async function writeGeneratedMetadata(options, reconciliation, boundaryPath, lookupPath) {
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(options.metadata, "utf8"));
  } catch {
    metadata = {};
  }
  metadata.latest_pipeline_run = {
    generated_at: new Date().toISOString(),
    psgc_input: options.psgc,
    boundary_input: options.boundaries,
    normalized_boundaries: repoRelativePath(boundaryPath),
    lookup: repoRelativePath(lookupPath),
    psgc_records: reconciliation.psgcRecords.length,
    boundary_records: reconciliation.boundaryRecords.length,
    matched_records: reconciliation.matched.length,
    psgc_only_records: reconciliation.psgcOnly.length,
    boundary_only_records: reconciliation.boundaryOnly.length
  };
  await writeFile(options.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
}

function repoRelativePath(filePath) {
  return filePath.replace(`${resolve(".")}\\`, "").replace(`${resolve(".")}/`, "").replace(/\\/g, "/");
}

function buildReport(reconciliation) {
  const byLevel = countByLevel(reconciliation);
  const rows = ["region", "province", "city", "barangay"]
    .map((level) => {
      const item = byLevel[level] || { psgc: 0, boundary: 0, matched: 0, psgcOnly: 0, boundaryOnly: 0 };
      return `| ${level} | ${item.psgc} | ${item.boundary} | ${item.matched} | ${item.psgcOnly} | ${item.boundaryOnly} |`;
    })
    .join("\n");

  return `# PSGC Reconciliation Report

Generated by \`tools/data-pipeline.mjs\` on ${new Date().toISOString()}.

## Summary

- PSGC records: ${reconciliation.psgcRecords.length}
- Boundary records: ${reconciliation.boundaryRecords.length}
- Matched records: ${reconciliation.matched.length}
- PSGC records without matched boundary geometry: ${reconciliation.psgcOnly.length}
- Boundary records missing from PSGC: ${reconciliation.boundaryOnly.length}
- Duplicate PSGC codes: ${reconciliation.duplicatePsgcCodes.length}
- Duplicate boundary codes: ${reconciliation.duplicateBoundaryCodes.length}

## Counts By Level

| Level | PSGC | Boundary | Matched | PSGC only | Boundary only |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows}

## Boundary Records Missing From PSGC

${listRecords(reconciliation.boundaryOnly)}

## PSGC Records Without Boundary Geometry

${listRecords(reconciliation.psgcOnly)}

## Caveat

Sample fixture outputs prove the reconciliation workflow only. Production runs should use current PSA PSGC records and reviewed HDX/OCHA or equivalent boundary geometry before any map is treated as authoritative.
`;
}

function countByLevel(reconciliation) {
  const result = {};
  for (const level of ["region", "province", "city", "barangay"]) {
    result[level] = {
      psgc: reconciliation.psgcRecords.filter((record) => record.level === level).length,
      boundary: reconciliation.boundaryRecords.filter((record) => record.level === level).length,
      matched: reconciliation.matched.filter((item) => item.psgc.level === level).length,
      psgcOnly: reconciliation.psgcOnly.filter((record) => record.level === level).length,
      boundaryOnly: reconciliation.boundaryOnly.filter((record) => record.level === level).length
    };
  }
  return result;
}

function listRecords(records) {
  if (!records.length) return "- None\n";
  return records
    .slice(0, 25)
    .map((record) => `- ${record.psgc_code || "(no code)"} - ${record.name || "(no name)"} (${record.level || "unknown"})`)
    .join("\n") + (records.length > 25 ? `\n- ... ${records.length - 25} more\n` : "\n");
}

async function validateGenerated(boundariesPath, lookupPath) {
  const boundaries = JSON.parse(await readFile(boundariesPath, "utf8"));
  const lookup = JSON.parse(await readFile(lookupPath, "utf8"));
  const errors = [];
  if (boundaries.type !== "FeatureCollection") errors.push("normalized boundaries must be a FeatureCollection");
  for (const feature of boundaries.features || []) {
    for (const field of ["psgc_code", "name", "level", "match_status"]) {
      if (!feature.properties?.[field]) errors.push(`feature missing ${field}`);
    }
    if (!feature.geometry) errors.push(`feature ${feature.properties?.psgc_code || "(unknown)"} missing geometry`);
  }
  for (const item of lookup) {
    if (!item.psgc_code || !item.name || !item.level) errors.push("lookup row missing required fields");
  }
  if (errors.length) throw new Error(errors.join("; "));
  console.log(`Validated ${boundaries.features.length} features and ${lookup.length} lookup rows`);
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const columns = rows.shift()?.map((cell) => cell.trim()) || [];
  return rows.map((cells) => Object.fromEntries(columns.map((column, index) => [column, (cells[index] || "").trim()])));
}

function pick(record, candidates) {
  for (const field of candidates) {
    if (record[field] !== undefined && record[field] !== null && String(record[field]).trim() !== "") {
      return record[field];
    }
  }
  return "";
}

function normalizeCode(value) {
  return String(value || "").trim().replace(/[^0-9A-Za-z-]/g, "");
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeName(value) {
  return cleanName(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeLevel(value, code) {
  const key = String(value || "").toLowerCase().replace(/[_-]+/g, " ").trim();
  if (LEVEL_ALIASES.has(key)) return LEVEL_ALIASES.get(key);
  return inferLevelFromCode(code);
}

function inferLevelFromCode(code) {
  const clean = normalizeCode(code);
  if (!clean) return "";
  const trailingZeroCount = (clean.match(/0+$/) || [""])[0].length;
  if (trailingZeroCount >= 8) return "region";
  if (trailingZeroCount >= 5) return "province";
  if (trailingZeroCount >= 3) return "city";
  return "barangay";
}

function geometryBbox(geometry) {
  const coords = [];
  collectCoordinates(geometry?.coordinates, coords);
  if (!coords.length) return null;
  const xs = coords.map(([x]) => x);
  const ys = coords.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function collectCoordinates(value, output) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push(value);
    return;
  }
  value.forEach((item) => collectCoordinates(item, output));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
