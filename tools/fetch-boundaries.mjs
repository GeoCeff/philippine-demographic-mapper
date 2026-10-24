import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "bendlikeabamboo/barangay-boundaries-repository";
const ADMIN_FILES = ["regions.geojson", "provinces.geojson", "municipalities.geojson", "component_cities.geojson", "highly_urbanized_cities.geojson", "independent_component_cities.geojson"];
const LEVELS = new Map([["region", "region"], ["province", "province"], ["municipality", "city"], ["component_city", "city"], ["highly_urbanized_city", "city"], ["independent_component_city", "city"], ["barangay", "barangay"]]);
const HEADERS = { "User-Agent": "philippine-demographic-mapper" };

export async function buildBoundaries(args = {}) {
  const rawDir = resolve(args.raw || "data/raw/boundaries");
  const outDir = resolve(args.out || "data/generated");
  const metadataPath = resolve(args.metadata || "data/source_metadata.json");
  const releaseTag = args.release === undefined || args.release === "latest"
    ? (await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)).tag_name : args.release;
  if (!/^[\w.-]+$/.test(releaseTag || "")) throw new Error("Invalid release tag");
  const releaseUrl = `https://github.com/${REPO}/releases/tag/${releaseTag}`;
  const assetUrl = (name) => `https://github.com/${REPO}/releases/download/${releaseTag}/${name}`;
  const manifestBytes = await fetchBytes(assetUrl("manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  validateManifest(manifest);
  const previousIndex = await readJsonIfPresent(join(outDir, "barangays/index.json"));
  // ponytail: retain a same-release barangay build when the admin-only command is run later.
  const includeBarangays = Boolean(args["include-barangays"] || previousIndex?.release_tag === releaseTag);
  const wanted = [...ADMIN_FILES, ...(includeBarangays ? ["barangays.geojson"] : [])];
  const files = wanted.map((name) => manifest.files.find((file) => file.path === name));
  if (files.some((file) => !file)) throw new Error("Manifest does not contain every requested boundary file");

  await cacheVerified(join(rawDir, "manifest.json"), manifestBytes, sha256(manifestBytes));
  const evidence = [];
  for (const [name, url] of [
    ["classification_report.json", assetUrl("classification_report.json")],
    ["summary.md", assetUrl("summary.md")],
    ["source_LICENSE.txt", `https://raw.githubusercontent.com/${REPO}/${releaseTag}/LICENSE`]
  ]) {
    const bytes = await fetchBytes(url);
    await cacheVerified(join(rawDir, name), bytes, sha256(bytes));
    evidence.push({ path: repoRelative(join(rawDir, name)), url, bytes: bytes.length, sha256: sha256(bytes), verification: "download digest; not listed in upstream checksum manifest" });
  }
  const sourceReport = JSON.parse(await readFile(join(rawDir, "classification_report.json"), "utf8"));
  if (sourceReport.psgc_version !== manifest.snapshot || sourceReport.namria_version !== manifest.namria_version) throw new Error("Source report and manifest versions differ");
  const rawCollections = new Map();
  for (const file of files) {
    const localPath = join(rawDir, file.path);
    let bytes = await readIfPresent(localPath);
    if (bytes) verifyBytes(file, bytes);
    else {
      bytes = await fetchBytes(assetUrl(file.path));
      verifyBytes(file, bytes);
      await cacheVerified(localPath, bytes, file.sha256);
    }
    const source = JSON.parse(bytes);
    validateCollection(source, file.features, file.path);
    rawCollections.set(file.path, source);
  }
  const parents = buildCityParents(ADMIN_FILES.flatMap((name) => rawCollections.get(name).features));
  const normalized = (name) => rawCollections.get(name).features.map((feature, index) => normalizeFeature(feature, manifest, name, index, parents));
  const adminFeatures = ADMIN_FILES.flatMap(normalized);
  const barangayFeatures = includeBarangays ? normalized("barangays.geojson") : [];
  const artifacts = {};
  artifacts.admin_boundaries = await writeJson(join(outDir, "admin_boundaries.normalized.geojson"), collection(adminFeatures));
  artifacts.admin_lookup = await writeJson(join(outDir, "admin_lookup.json"), adminFeatures.map((feature) => ({ ...feature.properties, bbox: geometryBbox(feature.geometry), has_geometry: true })).sort((a, b) => (a.psgc_code || a.source_code).localeCompare(b.psgc_code || b.source_code)));
  let barangayIndex;
  if (includeBarangays) {
    barangayIndex = { version: 1, release_tag: releaseTag, snapshot: manifest.snapshot, scopes: { region: [], province: [], city: [] } };
    barangayIndex.national = await writeScope(outDir, "barangays/national.geojson", "PH", barangayFeatures);
    for (const [scope, field] of [["region", "region_code"], ["province", "province_code"], ["city", "city_municipality_code"]]) {
      const groups = groupBy(barangayFeatures, (feature) => feature.properties[field]);
      if ([...groups.values()].reduce((sum, group) => sum + group.length, 0) !== barangayFeatures.length) throw new Error(`Barangay ${scope} scopes lose features`);
      for (const [code, features] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
        if (!/^[\w-]+$/.test(code)) throw new Error(`Unsafe scope code: ${code}`);
        barangayIndex.scopes[scope].push(await writeScope(outDir, `barangays/${scope}/${code}.geojson`, code, features));
      }
    }
    artifacts.barangay_index = await writeJson(join(outDir, "barangays/index.json"), barangayIndex);
  }
  const allFeatures = [...adminFeatures, ...barangayFeatures];
  const coverage = {
    release_tag: releaseTag, release_url: releaseUrl, snapshot: manifest.snapshot, namria_version: manifest.namria_version,
    complete: false,
    geometry: { preserved_from_release: true, further_simplification: false, upstream_tolerance: manifest.tolerance_degrees, note: "Historical source polygons, not current official or survey-grade boundaries." },
    levels: Object.fromEntries(["region", "province", "city", "barangay"].map((level) => [level, summarizeFeatures(allFeatures.filter((feature) => feature.properties.level === level))])),
    source_coverage_gaps: sourceReport.coverage_gaps,
    source_limitations: sourceReport.limitations,
    unmatched_features: adminFeatures.filter((feature) => !feature.properties.psgc_code).map((feature) => feature.properties),
    duplicates: duplicateCodes(allFeatures),
    caveat: "Missing source polygons are not synthesized. Fuzzy matches and repeated PSGC assignments are preserved and need review. This release uses the 2023-10-24 PSGC snapshot, not the current administrative hierarchy. HUC/ICC geographic province fields do not imply administrative subordination."
  };
  artifacts.coverage_report = await writeJson(join(outDir, "boundary_coverage_report.json"), coverage);
  const metadata = await readJsonIfPresent(metadataPath) || {};
  metadata.latest_boundary_release = {
    generated_at: new Date().toISOString(), repository: REPO, release_tag: releaseTag, release_url: releaseUrl,
    snapshot: manifest.snapshot, namria_version: manifest.namria_version, tolerance_degrees: manifest.tolerance_degrees,
    attribution: manifest.attribution,
    license: { code: "MIT", code_license: repoRelative(join(rawDir, "source_LICENSE.txt")), data: "PSGC © PSA; administrative boundaries © NAMRIA. Source asks downstream products to credit both agencies; the code MIT license is not a separate blanket data license.", source: `https://github.com/${REPO}/tree/${releaseTag}#license` },
    manifest: { path: repoRelative(join(rawDir, "manifest.json")), url: assetUrl("manifest.json"), bytes: manifestBytes.length, sha256: sha256(manifestBytes) },
    evidence,
    files: files.map((file) => ({ ...file, raw_path: repoRelative(join(rawDir, file.path)), url: assetUrl(file.path) })),
    normalized_boundaries: artifacts.admin_boundaries.path, lookup: artifacts.admin_lookup.path,
    scoped_barangays: includeBarangays ? repoRelative(join(outDir, "barangays")) : "",
    barangay_index: artifacts.barangay_index?.path || "", coverage_report: artifacts.coverage_report.path,
    admin_features: adminFeatures.length, barangay_features: barangayFeatures.length,
    levels: coverage.levels, coverage_complete: false, geometry_preserved: true,
    artifacts, caveat: coverage.caveat
  };
  metadata.boundary_mode = "historical source geometry with explicit coverage report";
  metadata.caveat = coverage.caveat;
  await writeJson(metadataPath, metadata, 2);
  console.log(`Built ${adminFeatures.length} admin polygons and ${barangayFeatures.length} barangay polygons from ${releaseTag} (PSGC ${manifest.snapshot}).`);
  console.log(`Coverage is incomplete: ${sourceReport.coverage_gaps?.summary?.psgc_entities_without_namria_polygon ?? "unknown"} source PSGC entities lack geometry; see ${artifacts.coverage_report.path}.`);
  return { metadata: metadata.latest_boundary_release, coverage, barangayIndex };
}

export function buildCityParents(features) {
  return new Map(features.filter((feature) => LEVELS.get(feature.properties?.psgc_type) === "city").map((feature) => [feature.properties.ADM3_PCODE || feature.properties.ADM2_PCODE, feature.properties.psgc_code || sourceCode(feature.properties, "city")]));
}

export function normalizeFeature(feature, manifest, sourceFile, sourceIndex, cityParents = new Map()) {
  const p = feature.properties || {};
  const level = LEVELS.get(String(p.psgc_type || "").toLowerCase());
  if (!level) throw new Error(`${sourceFile}[${sourceIndex}]: unknown source administrative type`);
  const code = String(p.psgc_code || "");
  if (code && !/^\d{10}$/.test(code)) throw new Error(`${sourceFile}[${sourceIndex}]: invalid PSGC code`);
  const source = sourceCode(p, level);
  if (level === "barangay" && !/^PH\d+$/.test(p.ADM3_PCODE || "")) throw new Error(`${sourceFile}[${sourceIndex}]: missing source city parent`);
  return {
    type: "Feature",
    properties: {
      psgc_code: code, source_code: source,
      name: String(p.psgc_name || p.ADM4_EN || p.ADM3_EN || p.ADM2_EN || p.ADM1_EN || source),
      source_name: String(p.ADM4_EN || p.ADM3_EN || p.ADM2_EN || p.ADM1_EN || ""),
      level, admin_type: p.psgc_type,
      region_code: level === "region" ? code : codeFromPcode(p.ADM1_PCODE),
      province_code: level === "province" ? code : codeFromPcode(p.ADM2_PCODE),
      city_municipality_code: level === "city" ? (code || source) : level === "barangay" ? (cityParents.get(p.ADM3_PCODE) || `NAMRIA_${p.ADM3_PCODE}`) : "",
      barangay_code: level === "barangay" ? code : "",
      region_name: String(p.ADM1_EN || ""), province_name: String(p.ADM2_EN || ""), city_municipality_name: String(p.ADM3_EN || ""),
      source_region_pcode: p.ADM1_PCODE || "", source_province_pcode: p.ADM2_PCODE || "", source_city_pcode: p.ADM3_PCODE || "",
      parent_basis: "geographic",
      source_version: manifest.snapshot, boundary_source_version: manifest.namria_version,
      match_status: code ? (p.psgc_status || "matched") : "unmatched", match_method: p.match_method || "", match_confidence: p.match_confidence ?? null,
      source_file: sourceFile, source_feature_index: sourceIndex
    },
    geometry: feature.geometry
  };
}

function sourceCode(p, level) {
  const pcode = level === "city" ? (p.ADM3_PCODE || p.ADM2_PCODE) : p[level === "barangay" ? "ADM4_PCODE" : level === "province" ? "ADM2_PCODE" : "ADM1_PCODE"];
  if (!/^PH\d+$/.test(pcode || "")) throw new Error("Source feature lacks a usable NAMRIA identifier");
  return `NAMRIA_${pcode}`;
}

export function validateManifest(manifest) {
  if (!manifest?.snapshot || !manifest.namria_version || !Array.isArray(manifest.files)) throw new Error("Invalid boundary manifest");
  const seen = new Set();
  for (const file of manifest.files) {
    if (basename(file.path || "") !== file.path || !/^[\w.-]+$/.test(file.path) || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || "") || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !Number.isSafeInteger(file.features) || file.features < 0) throw new Error(`Invalid manifest file: ${file.path}`);
    seen.add(file.path);
  }
}

export function validateCollection(value, expectedCount, label = "boundaries") {
  if (value?.type !== "FeatureCollection" || !Array.isArray(value.features) || value.features.length !== expectedCount) throw new Error(`${label}: source feature count differs from manifest`);
  for (const feature of value.features) {
    const geometry = feature?.geometry;
    if (feature.type !== "Feature" || !["Polygon", "MultiPolygon"].includes(geometry?.type)) throw new Error(`${label}: expected polygon geometry`);
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons) || !polygons.length) throw new Error(`${label}: empty geometry`);
    for (const polygon of polygons) {
      if (!Array.isArray(polygon) || !polygon.length) throw new Error(`${label}: empty polygon`);
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4 || ring.some((point) => !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error(`${label}: invalid polygon ring`);
      }
    }
  }
}

export function summarizeFeatures(features) {
  return { features: features.length, unique_psgc_codes: new Set(features.map((feature) => feature.properties.psgc_code).filter(Boolean)).size, unmatched_features: features.filter((feature) => !feature.properties.psgc_code).length, fuzzy_features: features.filter((feature) => feature.properties.match_status === "fuzzy").length };
}

export function duplicateCodes(features) {
  return [...groupBy(features.filter((feature) => feature.properties.psgc_code), (feature) => feature.properties.psgc_code)].filter(([, group]) => group.length > 1).map(([code, group]) => ({ psgc_code: code, level: group[0].properties.level, features: group.length, source_features: group.map((feature) => ({ source_code: feature.properties.source_code, name: feature.properties.source_name, status: feature.properties.match_status })) }));
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

async function writeScope(outDir, path, code, features) {
  const artifact = await writeJson(join(outDir, path), collection(features));
  return { code, path, ...summarizeFeatures(features), bytes: artifact.bytes, sha256: artifact.sha256 };
}

function collection(features) { return { type: "FeatureCollection", features }; }
function codeFromPcode(value) { return String(value || "").replace(/^PH/i, "").padEnd(10, "0").slice(0, 10).replace(/^0{10}$/, ""); }
export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function repoRelative(path) { return relative(resolve("."), resolve(path)).replace(/\\/g, "/"); }

function geometryBbox(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  function visit(value) {
    if (typeof value[0] === "number") { bounds[0] = Math.min(bounds[0], value[0]); bounds[1] = Math.min(bounds[1], value[1]); bounds[2] = Math.max(bounds[2], value[0]); bounds[3] = Math.max(bounds[3], value[1]); }
    else value.forEach(visit);
  }
  visit(geometry.coordinates);
  return bounds;
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
async function fetchJson(url) { return JSON.parse(await fetchBytes(url)); }
function verifyBytes(file, bytes) { if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error(`${file.path}: cached/downloaded bytes differ from source manifest; preserved existing file. Use a separate --raw directory for a different release.`); }
async function readIfPresent(path) { try { await assertNoLinks(path); return await readFile(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; } }
async function readJsonIfPresent(path) { const bytes = await readIfPresent(path); return bytes ? JSON.parse(bytes) : null; }
export async function cacheVerified(path, bytes, expectedHash) {
  const existing = await readIfPresent(path);
  if (existing) {
    if (sha256(existing) !== expectedHash) throw new Error(`Refusing to overwrite different raw/source evidence: ${path}. Use a separate --raw directory.`);
    return;
  }
  await assertNoLinks(path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}
async function writeJson(path, value, indent = 0) {
  await assertNoLinks(path);
  await mkdir(dirname(path), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, indent)}\n`);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx" });
  await rename(temporary, path);
  return { path: repoRelative(path), bytes: bytes.length, sha256: sha256(bytes) };
}
async function assertNoLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing linked data path: ${current}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(current) === current) break;
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index].replace(/^--/, "");
    if (!["include-barangays", "raw", "out", "metadata", "release"].includes(key)) throw new Error(`Unknown argument: ${argv[index]}`);
    if (key === "include-barangays") args[key] = true;
    else { args[key] = argv[++index]; if (!args[key] || args[key].startsWith("--")) throw new Error(`Missing --${key} value`); }
  }
  return args;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildBoundaries(parseArgs(process.argv.slice(2)));
