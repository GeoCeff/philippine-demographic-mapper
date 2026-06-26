import { readFile } from "node:fs/promises";

const boundaries = JSON.parse(await readFile("data/generated/admin_boundaries.normalized.geojson", "utf8"));
const metadata = JSON.parse(await readFile("data/source_metadata.json", "utf8")).latest_boundary_release;

assert(boundaries.type === "FeatureCollection", "expected generated FeatureCollection");
assert(boundaries.features.length >= 1700, `expected real admin boundaries, got ${boundaries.features.length}`);
assert(metadata?.release_tag && metadata?.snapshot && metadata?.namria_version, "missing boundary release metadata");

console.log(`Checked ${boundaries.features.length} generated admin boundaries from ${metadata.release_tag}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
