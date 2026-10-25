import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { duplicateCodes, sha256, summarizeFeatures, validateCollection } from "./fetch-boundaries.mjs";
import { verifyDetailedBoundaries } from "./check-boundary-detail.mjs";

const release = JSON.parse(await readFile("data/source_metadata.json", "utf8")).latest_boundary_release;
assert(release?.release_tag && release?.snapshot && release?.namria_version, "missing boundary release metadata");
assert(release.geometry_preserved && release.artifacts && release.coverage_report, "rebuild boundaries with the current fetcher");
assert(release.barangay_index && release.detail, "Missing complete boundary package; run npm run boundaries:full");
const outputDirectory = dirname(resolve(release.normalized_boundaries));
const admin = JSON.parse(await readFile(repoPath(release.normalized_boundaries), "utf8"));
validateCollection(admin, release.admin_features, "generated admin");
assert(admin.features.length >= 1700, "expected countrywide real admin source polygons");
for (const artifact of [release.manifest, ...release.evidence, ...Object.values(release.artifacts)]) await verifyFile(artifact);
const coverage = JSON.parse(await readFile(repoPath(release.coverage_report), "utf8"));
assert.equal(release.coverage_complete, coverage.complete);
assert.equal(coverage.snapshot, release.snapshot);
if (coverage.source_coverage_gaps?.summary?.psgc_entities_without_namria_polygon) assert.equal(coverage.complete, false, "source missing polygons must remain explicit");

let barangays = [];
let scopeCount = 0;
const nationalFeatureHashes = new Map();
if (release.barangay_index) {
  const index = JSON.parse(await readFile(repoPath(release.barangay_index), "utf8"));
  assert.equal(index.release_tag, release.release_tag);
  assert.equal(index.snapshot, release.snapshot);
  const nationalPath = scopePath(index.national.path);
  await verifyFile({ ...index.national, path: nationalPath });
  const national = JSON.parse(await readFile(nationalPath, "utf8"));
  validateCollection(national, release.barangay_features, "national barangays");
  barangays = national.features;
  for (const feature of barangays) nationalFeatureHashes.set(identity(feature), sha256(JSON.stringify(feature)));
  assert.deepEqual(summarizeFeatures(barangays), pickSummary(index.national));
  for (const [scope, field] of [["region", "region_code"], ["province", "province_code"], ["city", "city_municipality_code"]]) {
    assert(Array.isArray(index.scopes[scope]) && index.scopes[scope].length, `missing ${scope} scope index`);
    const expected = new Map();
    for (const feature of barangays) {
      const code = feature.properties[field];
      if (!expected.has(code)) expected.set(code, []);
      expected.get(code).push(identity(feature));
    }
    assert.equal(index.scopes[scope].length, expected.size, `incomplete ${scope} scope index`);
    const visited = new Set();
    for (const entry of index.scopes[scope]) {
      assert(!visited.has(entry.code), `repeated ${scope} scope`);
      visited.add(entry.code);
      const path = scopePath(entry.path);
      await verifyFile({ ...entry, path });
      const scoped = JSON.parse(await readFile(path, "utf8"));
      validateCollection(scoped, entry.features, `${scope}:${entry.code}`);
      assert.deepEqual(scoped.features.map(identity), expected.get(entry.code), `wrong membership in ${scope}:${entry.code}`);
      assert.deepEqual(summarizeFeatures(scoped.features), pickSummary(entry));
      for (const feature of scoped.features) assert.equal(sha256(JSON.stringify(feature)), nationalFeatureHashes.get(identity(feature)), `changed feature in ${scope}:${entry.code}`);
      scopeCount++;
    }
    assert.equal(index.scopes[scope].reduce((sum, entry) => sum + entry.features, 0), barangays.length);
  }
  const detail = await verifyDetailedBoundaries({ index, metadata: release, out: outputDirectory });
  console.log(`Verified ${detail.features} original detailed polygons in ${detail.city_scopes} gzip chunks (${detail.compressed_bytes} bytes), including source component hashes and exact geometry.`);
}
const allFeatures = [...admin.features, ...barangays];
const normalizedBySource = new Map(allFeatures.map((feature) => [identity(feature), feature]));
assert.equal(normalizedBySource.size, allFeatures.length, "source records were duplicated or lost");
for (const file of release.files) {
  await verifyFile({ ...file, path: file.raw_path });
  const raw = JSON.parse(await readFile(repoPath(file.raw_path), "utf8"));
  validateCollection(raw, file.features, file.path);
  raw.features.forEach((source, index) => {
    const normalized = normalizedBySource.get(`${file.path}:${index}`);
    assert(normalized, `source polygon missing: ${file.path}:${index}`);
    assert.equal(JSON.stringify(normalized.geometry), JSON.stringify(source.geometry), `source geometry changed: ${file.path}:${index}`);
    assert.equal(normalized.properties.psgc_code, String(source.properties.psgc_code || ""), "canonical source PSGC was changed");
    assert.equal(normalized.properties.source_version, release.snapshot);
  });
}
for (const level of ["region", "province", "city", "barangay"]) assert.deepEqual(summarizeFeatures(allFeatures.filter((feature) => feature.properties.level === level)), coverage.levels[level]);
assert.deepEqual(duplicateCodes(allFeatures), coverage.duplicates);
assert.equal(coverage.unmatched_features.length, allFeatures.filter((feature) => !feature.properties.psgc_code).length);
console.log(`Verified ${admin.features.length} admin and ${barangays.length} barangay source polygons, exact geometry, hashes and ${scopeCount} complete scoped extracts.`);
console.log(`Source snapshot ${release.snapshot}; complete=${coverage.complete}; ${coverage.source_coverage_gaps?.summary?.psgc_entities_without_namria_polygon ?? "unknown"} source entities lack polygons.`);

function identity(feature) { return `${feature.properties.source_file}:${feature.properties.source_feature_index}`; }
function pickSummary(entry) { return Object.fromEntries(["features", "unique_psgc_codes", "unmatched_features", "fuzzy_features"].map((key) => [key, entry[key]])); }
function repoPath(path) {
  const resolved = resolve(path);
  assert(!relative(resolve("."), resolved).startsWith(".."), "data path leaves project");
  return resolved;
}
function scopePath(path) {
  const resolved = resolve(outputDirectory, path);
  assert(!relative(outputDirectory, resolved).startsWith(".."), "scope path leaves generated directory");
  return resolved;
}
async function verifyFile(artifact) {
  const bytes = await readFile(repoPath(artifact.path));
  assert.equal(bytes.length, artifact.bytes, `size mismatch: ${artifact.path}`);
  assert.equal(sha256(bytes), artifact.sha256, `checksum mismatch: ${artifact.path}`);
}
