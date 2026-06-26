import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const REPO = "bendlikeabamboo/barangay-boundaries-repository";
const DEFAULT_RAW = "data/raw/boundaries";
const DEFAULT_OUT = "data/generated";
const DEFAULT_METADATA = "data/source_metadata.json";
const ADMIN_FILES = [
  "regions.geojson",
  "provinces.geojson",
  "municipalities.geojson",
  "component_cities.geojson",
  "highly_urbanized_cities.geojson",
  "independent_component_cities.geojson"
];
const BARANGAY_FILE = "barangays.geojson";
const TYPE_LEVELS = new Map([
  ["region", "region"],
  ["province", "province"],
  ["municipality", "city"],
  ["component_city", "city"],
  ["highly_urbanized_city", "city"],
  ["independent_component_city", "city"],
  ["barangay", "barangay"]
]);

const args = parseArgs(process.argv.slice(2));
const includeBarangays = Boolean(args["include-barangays"]);
const rawDir = args.raw || DEFAULT_RAW;
const outDir = args.out || DEFAULT_OUT;
const metadataPath = args.metadata || DEFAULT_METADATA;
const manifest = await getManifest(args.release || "latest");
const wanted = [...ADMIN_FILES, ...(includeBarangays ? [BARANGAY_FILE] : [])];
const files = manifest.files.filter((file) => wanted.includes(file.path));

await mkdir(rawDir, { recursive: true });
await mkdir(outDir, { recursive: true });

const adminFeatures = [];
const barangayFeatures = [];
for (const file of files) {
  const bytes = await downloadVerified(file, join(rawDir, file.path));
  const collection = JSON.parse(bytes.toString("utf8"));
  const normalized = (collection.features || []).map(normalizeFeature).filter(Boolean);
  if (file.path === BARANGAY_FILE) barangayFeatures.push(...normalized);
  else adminFeatures.push(...normalized);
}

await writeCollection(join(outDir, "admin_boundaries.normalized.geojson"), adminFeatures);
await writeLookup(join(outDir, "admin_lookup.json"), adminFeatures);
if (includeBarangays) await writeScopedBarangays(barangayFeatures);
await updateMetadata(manifest, files, adminFeatures.length, barangayFeatures.length);

console.log(`Built ${adminFeatures.length} real admin boundary features.`);
if (includeBarangays) console.log(`Built ${barangayFeatures.length} scoped barangay features.`);

async function getManifest(release) {
  const tag = release === "latest" ? (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name : release;
  return {
    ...(await fetchJson(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`)),
    release_tag: tag,
    release_url: `https://github.com/${REPO}/releases/tag/${tag}`
  };
}

async function downloadVerified(file, localPath) {
  let bytes;
  try {
    bytes = await readFile(localPath);
    if (sha256(bytes) === file.sha256) return bytes;
  } catch {
    // Download below.
  }

  const response = await fetch(`https://github.com/${REPO}/releases/download/${manifest.release_tag}/${basename(file.path)}`, {
    headers: { "User-Agent": "codex" }
  });
  if (!response.ok) throw new Error(`${file.path} failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== file.sha256) throw new Error(`${file.path}: SHA-256 mismatch ${actual}`);
  await writeFile(localPath, bytes);
  return bytes;
}

function normalizeFeature(feature) {
  const properties = feature.properties || {};
  const code = cleanCode(properties.psgc_code);
  const level = TYPE_LEVELS.get(String(properties.psgc_type || "").toLowerCase());
  if (!code || !level || !feature.geometry) return null;
  return {
    type: "Feature",
    properties: {
      psgc_code: code,
      name: String(properties.psgc_name || properties.ADM4_EN || properties.ADM3_EN || properties.ADM2_EN || properties.ADM1_EN || code),
      level,
      region_code: codeFromPcode(properties.ADM1_PCODE),
      province_code: level === "province" ? code : codeFromPcode(properties.ADM2_PCODE),
      city_municipality_code: level === "city" ? code : codeFromPcode(properties.ADM3_PCODE),
      barangay_code: level === "barangay" ? code : "",
      source_version: manifest.snapshot,
      boundary_source_version: manifest.namria_version,
      match_status: properties.psgc_status || "matched",
      match_method: properties.match_method || "",
      match_confidence: properties.match_confidence ?? ""
    },
    geometry: feature.geometry
  };
}

async function writeScopedBarangays(features) {
  for (const [scope, field] of [["city", "city_municipality_code"], ["province", "province_code"]]) {
    const groups = groupBy(features, (feature) => feature.properties[field]);
    await mkdir(join(outDir, "barangays", scope), { recursive: true });
    for (const [code, scoped] of groups) await writeCollection(join(outDir, "barangays", scope, `${code}.geojson`), scoped);
  }
}

function groupBy(items, keyFor) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

async function writeCollection(filePath, features) {
  await mkdir(resolve(filePath, ".."), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`);
}

async function writeLookup(filePath, features) {
  const lookup = features
    .map((feature) => ({ ...feature.properties, bbox: geometryBbox(feature.geometry), has_geometry: true }))
    .sort((a, b) => a.psgc_code.localeCompare(b.psgc_code));
  await writeFile(filePath, `${JSON.stringify(lookup, null, 2)}\n`);
}

function codeFromPcode(value) {
  const digits = cleanCode(value);
  if (!digits) return "";
  if (digits.length === 2) return `${digits}00000000`;
  if (digits.length === 5) return `${digits}00000`;
  if (digits.length === 7) return `${digits}000`;
  return digits.padEnd(10, "0").slice(0, 10);
}

function cleanCode(value) {
  return String(value || "").replace(/^PH/i, "").replace(/\D/g, "");
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "codex" } });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  return response.json();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function geometryBbox(geometry) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  collectCoordinates(geometry?.coordinates, bounds);
  return Number.isFinite(bounds.minX) ? [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY] : null;
}

function collectCoordinates(value, bounds) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    bounds.minX = Math.min(bounds.minX, value[0]);
    bounds.minY = Math.min(bounds.minY, value[1]);
    bounds.maxX = Math.max(bounds.maxX, value[0]);
    bounds.maxY = Math.max(bounds.maxY, value[1]);
    return;
  }
  value.forEach((item) => collectCoordinates(item, bounds));
}

async function updateMetadata(sourceManifest, sourceFiles, adminFeatureCount, barangayFeatureCount) {
  let metadata = {};
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    metadata = {};
  }
  metadata.latest_boundary_release = {
    generated_at: new Date().toISOString(),
    repository: REPO,
    release_tag: sourceManifest.release_tag,
    release_url: sourceManifest.release_url,
    snapshot: sourceManifest.snapshot,
    namria_version: sourceManifest.namria_version,
    attribution: sourceManifest.attribution,
    files: sourceFiles.map((file) => ({ path: file.path, bytes: file.bytes, features: file.features, sha256: file.sha256 })),
    normalized_boundaries: repoRelative(join(outDir, "admin_boundaries.normalized.geojson")),
    scoped_barangays: includeBarangays ? repoRelative(join(outDir, "barangays")) : "",
    lookup: repoRelative(join(outDir, "admin_lookup.json")),
    admin_features: adminFeatureCount,
    barangay_features: barangayFeatureCount,
    caveat: "Open PSGC-coded geometry from PSA PSGC snapshots and NAMRIA shapefiles; verify unresolved coverage before authoritative use."
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function repoRelative(filePath) {
  return resolve(filePath).replace(`${resolve(".")}\\`, "").replace(`${resolve(".")}/`, "").replace(/\\/g, "/");
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}
