import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { sha256, validateCollection } from "./fetch-boundaries.mjs";
import { parseDbf, readShapefileGeometry } from "./read-shapefile.mjs";
import { writeOutputSet } from "./write-output-set.mjs";

const compress = promisify(gzip);
const REPOSITORY = "altcoder/philippines-psgc-shapefiles";
const COMMIT = "a44a73091f19e4950dbdc0d7cb77a5e17b101a0a";
const STEM = "phl_admbnda_adm4_psa_namria_20231106";
const SOURCE_PATH = "data/2023/BgySubMuns";
export const PINNED_DETAIL_SOURCE = {
  repository: REPOSITORY, commit: COMMIT, source_version: "2023-11-06", snapshot: "2023-11-06",
  provenance_url: `https://github.com/${REPOSITORY}/tree/${COMMIT}/${SOURCE_PATH}`,
  source_tier: "Original NAMRIA/OCHA shapefile mirrored by a community repository; not a new authoritative release",
  attribution: "Administrative boundaries: NAMRIA / PSA, distributed through OCHA HDX. The mirror's code license is not a blanket data license.",
  components: [
    ["shp", 272270908, "a90587b5bf1579e6afb0309282f5e39d33c9c5d3974e32868eb9dfe30ef3b0e6", true],
    ["shx", 336484, "dc402a56a32a4d5420cd733d91fcc2c061bd0398e70d9a8647b6eb38e26b41dd", false],
    ["dbf", 43730498, "ee46053ed430674c6d48cbc86fd5cac37ee0725d09429637acd52f67694dee0c", true],
    ["prj", 146, "4e0fe7f616bb23140c8fc3a9f2154ce5149f4c9cad0d0e65c261558f5cad8e33", false],
    ["cpg", 6, "146d6789ffe033a5297c1ad046e6a62ee35319b86b021444f05b6ea2aa8a1f4a", false]
  ].map(([extension, bytes, digest, lfs]) => ({
    filename: `${STEM}.${extension}`, bytes, sha256: digest, lfs_verified: lfs,
    url: `https://${lfs ? "media.githubusercontent.com/media" : "raw.githubusercontent.com"}/${REPOSITORY}/${COMMIT}/${SOURCE_PATH}/${STEM}.${extension}`,
    metadata_url: `https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${SOURCE_PATH}/${STEM}.${extension}`
  }))
};

// The CLI always uses the pinned source; small checksummed source descriptors support isolated fixtures.
export async function buildBoundaryDetail(args = {}, source = PINNED_DETAIL_SOURCE) {
  const started = performance.now();
  const raw = resolve(args.raw || "data/raw/boundaries/detail"), out = resolve(args.out || "data/generated");
  const metadataPath = resolve(args.metadata || "data/source_metadata.json"), indexPath = join(out, "barangays/index.json");
  for (const path of [raw, out, metadataPath, indexPath]) await assertNoLinks(path);
  validateSource(source);
  for (const component of source.components) await cacheComponent(raw, component);
  const componentPath = (extension) => join(raw, source.components.find((file) => file.filename.endsWith("." + extension)).filename);
  const prj = await readFile(componentPath("prj"), "utf8"), encoding = (await readFile(componentPath("cpg"), "utf8")).trim();
  if (!/GCS_WGS_1984|WGS[ _]?(?:1984|84)/i.test(prj) || !/UNIT\s*\[\s*"Degree"/i.test(prj)) throw new Error("Detail source must use WGS84 geographic degrees");
  if (!/^UTF-?8$/i.test(encoding)) throw new Error("Detail DBF must declare UTF-8");
  const existingManifest = await readJsonIfPresent(join(raw, "source-manifest.json"));
  if (existingManifest) {
    if (existingManifest.repository !== source.repository || existingManifest.commit !== source.commit ||
      source.components.some((file) => !existingManifest.components?.some((saved) => saved.filename === file.filename && saved.bytes === file.bytes && saved.sha256 === file.sha256))) {
      throw new Error("Existing detail provenance differs from the pinned source; preserved existing evidence");
    }
  } else await atomicJson(join(raw, "source-manifest.json"), { ...source, crs: { epsg: 4326, prj: prj.trim() } });
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  if (!Array.isArray(index.scopes?.city) || !index.scopes.city.length || !Array.isArray(index.scopes?.province) || !index.scopes.province.length) throw new Error("Build coarse barangay scopes before detailed boundaries");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  if (!metadata.latest_boundary_release) throw new Error("Missing coarse boundary release metadata");
  const [shp, shx, dbf] = await Promise.all([readFile(componentPath("shp")), readFile(componentPath("shx")), readFile(componentPath("dbf"))]);
  const records = parseDbf(dbf), originalByCode = new Map();
  if (shx.length !== 100 + records.length * 8) throw new Error("Detail SHX and DBF record counts differ");
  records.forEach((record, position) => {
    if (!record) return;
    const code = record.ADM4_PCODE?.trim();
    if (!/^PH\d+$/.test(code || "") || originalByCode.has(code)) throw new Error("Invalid or duplicate original ADM4_PCODE: " + code);
    originalByCode.set(code, position);
  });
  const detailRoot = join(out, "barangays/detail"), detailCity = join(detailRoot, "city");
  await assertNoLinks(detailCity); await mkdir(detailRoot, { recursive: true });
  const stage = await mkdtemp(join(detailRoot, ".build-")), staged = [], provinceChunks = new Map(), provinceCounts = new Map(), seenCities = new Set();
  let totalFeatures = 0, compressedBytes = 0, uncompressedBytes = 0;
  try {
    for (const entry of index.scopes.city) {
      if (!/^[\w-]+$/.test(entry.code || "") || seenCities.has(entry.code)) throw new Error("Invalid or duplicate city scope code");
      seenCities.add(entry.code);
      const coarsePath = scopePath(out, entry.path);
      await assertNoLinks(coarsePath);
      const coarse = await readFile(coarsePath);
      if (coarse.length !== entry.bytes || sha256(coarse) !== entry.sha256) throw new Error("Changed coarse city scope: " + entry.code);
      const collection = JSON.parse(coarse);
      validateCollection(collection, entry.features, "coarse city " + entry.code);
      const provinces = new Set();
      const features = collection.features.map((feature) => {
        const code = String(feature.properties?.source_code || "").replace(/^NAMRIA_/, ""), original = originalByCode.get(code);
        if (original === undefined) throw new Error(`Missing original source for ${entry.code}: ${code}`);
        let geometry;
        try { geometry = readShapefileGeometry(shp, shx, original); } catch (error) { throw new Error(`Invalid original ${code}: ${error.message}`, { cause: error }); }
        if (!geometry) throw new Error("Null original geometry for " + code);
        const province = feature.properties.province_code;
        if (!province || feature.properties.city_municipality_code !== entry.code) throw new Error("Coarse feature has inconsistent city/province membership");
        provinces.add(province); provinceCounts.set(province, (provinceCounts.get(province) || 0) + 1);
        return { ...feature, geometry };
      });
      validateCollection({ ...collection, features }, entry.features, "detailed city " + entry.code);
      const plain = Buffer.from(JSON.stringify({ ...collection, features }) + "\n"), bytes = await compress(plain);
      const descriptor = { code: entry.code, path: `barangays/detail/city/${entry.code}.geojson.gz`, bytes: bytes.length, sha256: sha256(bytes), features: features.length };
      const temporary = join(stage, `${entry.code}.geojson.gz`);
      staged.push({ temporary, descriptor }); await writeFile(temporary, bytes, { flag: "wx" });
      entry.detail = descriptor;
      for (const province of provinces) {
        if (!provinceChunks.has(province)) provinceChunks.set(province, []);
        provinceChunks.get(province).push(descriptor);
      }
      totalFeatures += features.length; compressedBytes += bytes.length; uncompressedBytes += plain.length;
      if (seenCities.size % 250 === 0) console.log(`Detailed ${seenCities.size}/${index.scopes.city.length} city scopes (${totalFeatures} polygons).`);
    }
    const seenProvinces = new Set();
    for (const entry of index.scopes.province) {
      if (!/^[\w-]+$/.test(entry.code || "") || seenProvinces.has(entry.code) || provinceCounts.get(entry.code) !== entry.features) throw new Error("Detailed province coverage differs: " + entry.code);
      seenProvinces.add(entry.code);
      entry.detail = { paths: provinceChunks.get(entry.code), features: entry.features };
    }
    if (provinceCounts.size !== seenProvinces.size || totalFeatures !== index.national?.features) throw new Error("Detailed city scopes lose national/province source records");
    const summary = { repository: source.repository, commit: source.commit, source_version: source.source_version, snapshot: source.snapshot,
      source_tier: source.source_tier, provenance_url: source.provenance_url, attribution: source.attribution, tolerance_degrees: 0,
      crs: "EPSG:4326", geometry: "Original unsimplified polygons; existing curated identifiers and hierarchy preserved",
      source_records: records.length, features: totalFeatures, city_scopes: seenCities.size, province_scopes: seenProvinces.size,
      compressed_bytes: compressedBytes, uncompressed_bytes: uncompressedBytes, fallback_features: 0, coverage_complete: false,
      national_geometry: "Original coarse national and region layers retained for performance", components: source.components };
    index.detail_source = summary;
    // Fixed filenames are immutable evidence: preflight every target before promoting any chunk.
    for (const { descriptor } of staged) {
      const target = scopePath(out, descriptor.path);
      await assertNoLinks(target);
      if (await exists(target) && !(await matchesFile(target, descriptor))) throw new Error("Refusing to replace different detailed geometry: " + target + ". Use a fresh --out directory.");
    }
    await mkdir(detailCity, { recursive: true });
    for (const { temporary, descriptor } of staged) {
      const target = scopePath(out, descriptor.path);
      if (!await exists(target)) await rename(temporary, target);
    }
    const indexBytes = Buffer.from(JSON.stringify(index) + "\n");
    metadata.latest_boundary_release.detail = summary;
    if (metadata.latest_boundary_release.artifacts?.barangay_index) metadata.latest_boundary_release.artifacts.barangay_index = {
      ...metadata.latest_boundary_release.artifacts.barangay_index, bytes: indexBytes.length, sha256: sha256(indexBytes)
    };
    await writeOutputSet([{ path: indexPath, bytes: indexBytes }, { path: metadataPath, bytes: Buffer.from(JSON.stringify(metadata, null, 2) + "\n") }]);
    const elapsed_seconds = Math.round((performance.now() - started) / 100) / 10;
    console.log(`Built ${totalFeatures} unsimplified barangay polygons in ${seenCities.size} compressed city scopes (${compressedBytes} bytes; ${elapsed_seconds}s).`);
    return { index, detail: summary, elapsed_seconds };
  } finally {
    for (const { temporary } of staged) await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await rmdir(stage);
  }
}

function validateSource(source) {
  if (!source?.repository || !source.commit || !source.source_version || !Array.isArray(source.components) || source.components.length !== 5) throw new Error("Invalid detail source descriptor");
  const extensions = new Set();
  for (const file of source.components) {
    const match = /^[\w-]+\.(shp|shx|dbf|prj|cpg)$/.exec(file.filename || "");
    if (!match || extensions.has(match[1]) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !/^[a-f0-9]{64}$/.test(file.sha256 || "") || !/^https:\/\//.test(file.url || "")) throw new Error("Invalid detail source component");
    extensions.add(match[1]);
  }
}
async function cacheComponent(raw, component) {
  const target = join(raw, component.filename);
  await assertNoLinks(target);
  if (await exists(target)) {
    if (!await matchesFile(target, component)) throw new Error("Changed cached detail source; preserved existing file: " + target);
    return;
  }
  await mkdir(raw, { recursive: true });
  console.log(`Downloading pinned ${component.filename} (${component.bytes} bytes).`);
  if (component.lfs_verified) {
    const response = await fetch(component.metadata_url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("LFS pointer HTTP " + response.status);
    const pointer = await response.text();
    if (!pointer.includes(`oid sha256:${component.sha256}\n`) || !pointer.includes(`size ${component.bytes}`)) throw new Error("Pinned LFS pointer does not match verified component");
  }
  const temporary = `${target}.${process.pid}.tmp`, digest = createHash("sha256");
  let bytes = 0;
  try {
    const response = await fetch(component.url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw new Error("Detail download HTTP " + response.status);
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, done) {
      bytes += chunk.length;
      if (bytes > component.bytes) return done(new Error("Detail download exceeds expected byte count"));
      digest.update(chunk); done(null, chunk);
    } }), createWriteStream(temporary, { flags: "wx" }));
    if (bytes !== component.bytes || digest.digest("hex") !== component.sha256) throw new Error("Detail download checksum or size differs from pinned source");
    await rename(temporary, target);
  } finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}
async function matchesFile(path, file) {
  if ((await lstat(path)).size !== file.bytes) return false;
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex") === file.sha256;
}
function scopePath(out, path) {
  if (typeof path !== "string" || !/^barangays\/(?:city|detail\/city)\/[\w-]+\.geojson(?:\.gz)?$/.test(path)) throw new Error("Unsafe barangay scope path");
  const target = resolve(out, path);
  if (!target.startsWith(out + sep)) throw new Error("Scope path escapes output directory");
  return target;
}
async function exists(path) { try { await lstat(path); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function readJsonIfPresent(path) { await assertNoLinks(path); return await exists(path) ? JSON.parse(await readFile(path, "utf8")) : null; }
async function assertNoLinks(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("Refusing linked data path: " + current); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (dirname(current) === current) break;
  }
}
async function atomicWrite(path, bytes) {
  await assertNoLinks(path); await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { await writeFile(temporary, bytes, { flag: "wx" }); await rename(temporary, path); }
  finally { await unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
}
async function atomicJson(path, value, indent = 0) { await atomicWrite(path, Buffer.from(JSON.stringify(value, null, indent) + "\n")); }
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (!["raw", "out", "metadata"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error("Expected --raw, --out or --metadata followed by a path");
    args[key] = argv[++i];
  }
  return args;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildBoundaryDetail(parseArgs(process.argv.slice(2)));
