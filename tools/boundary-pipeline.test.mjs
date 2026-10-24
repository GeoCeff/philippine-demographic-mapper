import assert from "node:assert/strict";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildCityParents, cacheVerified, duplicateCodes, normalizeFeature, sha256, summarizeFeatures, validateCollection, validateManifest } from "./fetch-boundaries.mjs";

const manifest = { snapshot: "2023-10-24", namria_version: "2023-11-06" };
const geometry = { type: "Polygon", coordinates: [[[120, 12], [121, 12], [121, 13], [120, 12]], [[120.2, 12.2], [120.3, 12.2], [120.3, 12.3], [120.2, 12.2]]] };
function feature(properties) { return { type: "Feature", properties, geometry }; }
const city = feature({ psgc_type: "highly_urbanized_city", psgc_code: "0730600000", psgc_name: "City of Cebu", ADM1_PCODE: "PH07", ADM2_PCODE: "PH07022", ADM3_PCODE: "PH0702217", ADM3_EN: "Cebu City" });
const barangay = feature({ psgc_type: "barangay", psgc_code: "0730600001", psgc_name: "Adlaon", ADM1_PCODE: "PH07", ADM2_PCODE: "PH07022", ADM3_PCODE: "PH0702217", ADM4_PCODE: "PH0702217001", ADM4_EN: "Adlaon", psgc_status: "fuzzy", match_confidence: 0.9 });

test("canonical HUC scope fixes geographic source IDs without changing rings or holes", () => {
  const normalized = normalizeFeature(barangay, manifest, "barangays.geojson", 4, buildCityParents([city]));
  assert.equal(normalized.properties.city_municipality_code, "0730600000");
  assert.equal(normalized.properties.province_code, "0702200000");
  assert.equal(normalized.properties.source_city_pcode, "PH0702217");
  assert.equal(normalized.properties.match_status, "fuzzy");
  assert.equal(normalized.geometry, geometry);
  assert.deepEqual(normalized.geometry.coordinates, geometry.coordinates);
  assert.equal(normalized.properties.source_feature_index, 4);
});

test("unmatched city keeps its geometry and transparent source ID, never an invented PSGC", () => {
  const unknownCity = feature({ ...city.properties, psgc_code: null, psgc_name: null, ADM3_PCODE: "PH0909701", ADM3_EN: "City of Isabela", psgc_status: "mapped-no-psgc" });
  const normalized = normalizeFeature(unknownCity, manifest, "highly_urbanized_cities.geojson", 0);
  assert.equal(normalized.properties.psgc_code, "");
  assert.equal(normalized.properties.source_code, "NAMRIA_PH0909701");
  assert.equal(normalized.properties.city_municipality_code, "NAMRIA_PH0909701");
  assert.equal(normalized.properties.match_status, "unmatched");
  assert.equal(normalized.geometry, geometry);
  assert.equal(buildCityParents([unknownCity]).get("PH0909701"), "NAMRIA_PH0909701");
});

test("duplicate PSGC assignments remain separate polygon records and are reported", () => {
  const records = [0, 1].map((index) => normalizeFeature(barangay, manifest, "barangays.geojson", index));
  assert.deepEqual(summarizeFeatures(records), { features: 2, unique_psgc_codes: 1, unmatched_features: 0, fuzzy_features: 2 });
  assert.equal(duplicateCodes(records)[0].features, 2);
  assert.equal(records.length, 2);
});

test("province-equivalent ICC records without ADM3 fields retain their canonical identity", () => {
  const independentCity = feature({ psgc_type: "independent_component_city", psgc_code: "0990100000", psgc_name: "City of Isabela", ADM1_PCODE: "PH09", ADM2_PCODE: "PH09097", ADM2_EN: "City of Isabela" });
  const normalized = normalizeFeature(independentCity, manifest, "independent_component_cities.geojson", 0);
  assert.equal(normalized.properties.source_code, "NAMRIA_PH09097");
  assert.equal(normalized.properties.city_municipality_code, "0990100000");
  assert.equal(normalized.properties.admin_type, "independent_component_city");
});

test("source boundary count, polygon rings and canonical code validation fail closed", () => {
  validateCollection({ type: "FeatureCollection", features: [barangay] }, 1);
  assert.throws(() => validateCollection({ type: "FeatureCollection", features: [barangay] }, 2), /count/);
  assert.throws(() => validateCollection({ type: "FeatureCollection", features: [{ ...barangay, geometry: { type: "Polygon", coordinates: [[[120, 12], [121, 12], [121, 13]]] } }] }, 1), /ring/);
  assert.throws(() => normalizeFeature(feature({ ...barangay.properties, psgc_code: "PH123" }), manifest, "barangays.geojson", 0), /invalid PSGC/);
  assert.throws(() => normalizeFeature(feature({ ...barangay.properties, ADM3_PCODE: null }), manifest, "barangays.geojson", 0), /source city parent/);
});

test("manifest rejects path traversal, duplicates and missing checksums", () => {
  const file = { path: "barangays.geojson", bytes: 100, features: 1, sha256: "a".repeat(64) };
  validateManifest({ ...manifest, files: [file] });
  for (const files of [[{ ...file, path: "../private.json" }], [file, file], [{ ...file, sha256: "" }]]) assert.throws(() => validateManifest({ ...manifest, files }), /Invalid manifest file/);
});

test("different existing raw files are preserved rather than silently replaced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "demographic-boundaries-"));
  const path = join(directory, "source.json");
  try {
    await writeFile(path, "user-owned-original");
    const replacement = Buffer.from("different-source");
    await assert.rejects(cacheVerified(path, replacement, sha256(replacement)), /Refusing to overwrite/);
    assert.equal(await readFile(path, "utf8"), "user-owned-original");
  } finally {
    await unlink(path);
    await rmdir(directory);
  }
});
