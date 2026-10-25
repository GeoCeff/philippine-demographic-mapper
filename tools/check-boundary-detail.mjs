import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import { PINNED_DETAIL_SOURCE } from "./fetch-boundary-detail.mjs";
import { sha256, validateCollection } from "./fetch-boundaries.mjs";
import { parseDbf, readShapefileGeometry } from "./read-shapefile.mjs";

export async function verifyDetailedBoundaries({ index, metadata, out = "data/generated", raw = "data/raw/boundaries/detail", source = PINNED_DETAIL_SOURCE }) {
  assert(index.detail_source && metadata?.detail, "Missing detailed boundary package; run npm run boundaries:full");
  assert.deepEqual(index.detail_source, metadata.detail, "detail index and metadata differ");
  const summary = index.detail_source, root = resolve(out), rawRoot = resolve(raw);
  for (const key of ["repository", "commit", "source_version"]) assert.equal(summary[key], source[key], "unexpected detail source " + key);
  assert.equal(summary.tolerance_degrees, 0); assert.equal(summary.fallback_features, 0);
  for (const file of source.components) {
    const saved = summary.components?.find((item) => item.filename === file.filename);
    assert(saved && saved.bytes === file.bytes && saved.sha256 === file.sha256, "detail source provenance differs from pinned component");
    const path = join(rawRoot, file.filename); await noLinks(path);
    assert.equal((await lstat(path)).size, file.bytes, "source component size: " + file.filename);
    const hash = createHash("sha256"); for await (const chunk of createReadStream(path)) hash.update(chunk);
    assert.equal(hash.digest("hex"), file.sha256, "source component checksum: " + file.filename);
  }
  const component = (extension) => join(rawRoot, source.components.find((file) => file.filename.endsWith("." + extension)).filename);
  assert.match(await readFile(component("prj"), "utf8"), /WGS[_ ]?(?:1984|84)/i);
  assert.match((await readFile(component("cpg"), "utf8")).trim(), /^UTF-?8$/i);
  const [shp, shx, dbf] = await Promise.all([readFile(component("shp")), readFile(component("shx")), readFile(component("dbf"))]);
  const records = parseDbf(dbf), sourceByCode = new Map();
  assert.equal(shx.length, 100 + records.length * 8, "original source record counts differ");
  records.forEach((record, position) => {
    if (!record) return;
    assert(record.ADM4_PCODE && !sourceByCode.has(record.ADM4_PCODE), "duplicate/missing original pcode");
    sourceByCode.set(record.ADM4_PCODE, position);
  });
  const byPath = new Map(), provinceCities = new Map(), provinceCounts = new Map();
  let features = 0, compressed = 0, plainBytes = 0;
  for (const entry of index.scopes.city) {
    assert(entry.detail, "missing city detail: " + entry.code);
    const detail = entry.detail, path = scopedPath(root, detail.path, true);
    assert(!byPath.has(detail.path), "duplicate city detail path");
    await noLinks(path);
    const bytes = await readFile(path);
    assert.equal(bytes.length, detail.bytes, "detail bytes: " + entry.code); assert.equal(sha256(bytes), detail.sha256, "detail checksum: " + entry.code);
    const plain = gunzipSync(bytes), collection = JSON.parse(plain);
    validateCollection(collection, entry.features, "detailed city " + entry.code);
    assert.equal(detail.features, entry.features, "detail record count: " + entry.code);
    const coarse = JSON.parse(await readFile(scopedPath(root, entry.path, false), "utf8"));
    validateCollection(coarse, entry.features, "coarse city " + entry.code);
    for (let i = 0; i < collection.features.length; i++) {
      const feature = collection.features[i], originalFeature = coarse.features[i];
      assert.equal(JSON.stringify({ ...feature, geometry: null }), JSON.stringify({ ...originalFeature, geometry: null }), "detail changed curated properties/identity/order: " + entry.code);
      const code = String(feature.properties.source_code).replace(/^NAMRIA_/, ""), position = sourceByCode.get(code);
      assert.notEqual(position, undefined, "detail source pcode missing: " + code);
      const original = readShapefileGeometry(shp, shx, position);
      assert(original, "Null source geometry: " + code); assert.deepEqual(feature.geometry, original, "detail changed original geometry: " + code);
      const province = feature.properties.province_code;
      if (!provinceCities.has(province)) provinceCities.set(province, new Set());
      provinceCities.get(province).add(detail.path); provinceCounts.set(province, (provinceCounts.get(province) || 0) + 1);
    }
    byPath.set(detail.path, detail); features += collection.features.length; compressed += bytes.length; plainBytes += plain.length;
  }
  assert.equal(features, index.national.features, "detail city scopes lose national records");
  assert.equal(provinceCounts.size, index.scopes.province.length, "detail province scopes are incomplete");
  for (const entry of index.scopes.province) {
    assert(entry.detail && Array.isArray(entry.detail.paths), "missing province detail: " + entry.code);
    assert.equal(entry.detail.features, entry.features); assert.equal(provinceCounts.get(entry.code), entry.features);
    const paths = new Set();
    for (const item of entry.detail.paths) {
      const city = byPath.get(item.path); assert(city && !paths.has(item.path), "unknown/duplicate province detail chunk");
      for (const key of ["bytes", "sha256", "features"]) assert.equal(item[key], city[key], "province chunk descriptor differs");
      paths.add(item.path);
    }
    assert.deepEqual(paths, provinceCities.get(entry.code), "province detail has wrong city membership");
  }
  assert.equal(summary.source_records, records.length); assert.equal(summary.features, features);
  assert.equal(summary.city_scopes, index.scopes.city.length); assert.equal(summary.province_scopes, index.scopes.province.length);
  assert.equal(summary.compressed_bytes, compressed); assert.equal(summary.uncompressed_bytes, plainBytes);
  return { features, city_scopes: byPath.size, compressed_bytes: compressed };
}

function scopedPath(root, path, detail) {
  assert(typeof path === "string" && (detail ? /^barangays\/detail\/city\/[\w-]+\.geojson\.gz$/ : /^barangays\/city\/[\w-]+\.geojson$/).test(path), "unsafe detail/coarse scope path");
  const full = resolve(root, path); assert(full.startsWith(root + sep)); return full;
}
async function noLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try { assert(!(await lstat(current)).isSymbolicLink(), "linked boundary data path"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(current) === current) break;
  }
}
