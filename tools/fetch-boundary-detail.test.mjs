import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { buildBoundaryDetail } from "./fetch-boundary-detail.mjs";
import { sha256 } from "./fetch-boundaries.mjs";

const square = (x, y, size) => [[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]];
const rings = [[square(120, 12, 1), square(120.1, 12.1, 0.1).reverse(), square(122, 12, 0.2)], [square(121, 13, 0.1)], [square(123, 14, 0.1)]];
function shape(rings) {
  const points = rings.flat(), buffer = Buffer.alloc(44 + rings.length * 4 + points.length * 16);
  buffer.writeInt32LE(5);
  [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))].forEach((value, i) => buffer.writeDoubleLE(value, 4 + i * 8));
  buffer.writeInt32LE(rings.length, 36); buffer.writeInt32LE(points.length, 40);
  let start = 0;
  rings.forEach((ring, i) => { buffer.writeInt32LE(start, 44 + i * 4); start += ring.length; });
  points.forEach(([x, y], i) => { buffer.writeDoubleLE(x, 44 + rings.length * 4 + i * 16); buffer.writeDoubleLE(y, 52 + rings.length * 4 + i * 16); });
  return buffer;
}
function header(length) {
  const bytes = Buffer.alloc(100);
  bytes.writeInt32BE(9994); bytes.writeInt32BE(length / 2, 24); bytes.writeInt32LE(1000, 28); bytes.writeInt32LE(5, 32);
  [-180, -90, 180, 90].forEach((value, i) => bytes.writeDoubleLE(value, 36 + i * 8));
  return bytes;
}
function sourceBuffers(records = rings.map(shape)) {
  const shp = Buffer.alloc(100 + records.reduce((size, record) => size + 8 + record.length, 0)), shx = Buffer.alloc(100 + records.length * 8);
  header(shp.length).copy(shp); header(shx.length).copy(shx);
  let offset = 100;
  records.forEach((record, i) => {
    shp.writeInt32BE(i + 1, offset); shp.writeInt32BE(record.length / 2, offset + 4); record.copy(shp, offset + 8);
    shx.writeInt32BE(offset / 2, 100 + i * 8); shx.writeInt32BE(record.length / 2, 104 + i * 8); offset += record.length + 8;
  });
  const dbf = Buffer.alloc(65 + 17 * records.length + 1, 0);
  dbf[0] = 3; dbf.writeUInt32LE(records.length, 4); dbf.writeUInt16LE(65, 8); dbf.writeUInt16LE(17, 10);
  dbf.write("ADM4_PCODE", 32, "ascii"); dbf[43] = 67; dbf[48] = 16; dbf[64] = 13; dbf[dbf.length - 1] = 26;
  records.forEach((_, i) => { dbf.fill(32, 65 + i * 17, 65 + (i + 1) * 17); dbf.write("PH000000000" + (i + 1), 66 + i * 17, "ascii"); });
  return { shp, shx, dbf, prj: Buffer.from('GEOGCS["GCS_WGS_1984",UNIT["Degree",0.0174532925199433]]'), cpg: Buffer.from("UTF-8\n") };
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "boundary-detail-")), raw = join(root, "raw"), out = join(root, "out"), metadata = join(root, "metadata.json");
  await mkdir(raw); await mkdir(join(out, "barangays/city"), { recursive: true });
  const buffers = sourceBuffers(), source = { repository: "fixture/source", commit: "a".repeat(40), source_version: "2023-11-06", snapshot: "2023-11-06", source_tier: "Test fixture", provenance_url: "https://example.invalid/source", attribution: "Fixture", components: [] };
  for (const [extension, bytes] of Object.entries(buffers)) {
    const filename = "fixture." + extension;
    source.components.push({ filename, bytes: bytes.length, sha256: sha256(bytes), lfs_verified: false, url: "https://example.invalid/" + filename });
    await writeFile(join(raw, filename), bytes);
  }
  const feature = (n, province, city) => ({ type: "Feature", id: "record-" + n, properties: { source_code: "NAMRIA_PH000000000" + n, psgc_code: n < 3 ? "1705101001" : "1705102001", province_code: province, city_municipality_code: city, extra: { original: n } }, geometry: { type: "Polygon", coordinates: [square(120, 12, 0.01)] } });
  const cities = [{ code: "city1", features: [feature(2, "province2", "city1"), feature(1, "province1", "city1")] }, { code: "city2", features: [feature(3, "province1", "city2")] }];
  const index = { version: 1, snapshot: "2023-10-24", release_tag: "test", national: { path: "barangays/national.geojson", features: 3 }, scopes: { region: [], province: [{ code: "province1", features: 2, path: "unchanged-province-1" }, { code: "province2", features: 1, path: "unchanged-province-2" }], city: [] } };
  for (const city of cities) {
    const path = `barangays/city/${city.code}.geojson`, bytes = Buffer.from(JSON.stringify({ type: "FeatureCollection", name: "Keep this collection property", features: city.features }));
    await writeFile(join(out, path), bytes); index.scopes.city.push({ code: city.code, path, bytes: bytes.length, sha256: sha256(bytes), features: city.features.length });
  }
  await writeFile(join(out, "barangays/index.json"), JSON.stringify(index));
  await writeFile(metadata, JSON.stringify({ unrelated: "preserved", latest_boundary_release: { snapshot: index.snapshot, release_tag: "test", artifacts: { barangay_index: { path: "preserved-index-path", bytes: 0, sha256: "before" } } } }));
  return { root, raw, out, metadata, source, index, cities };
}
async function cleanup(root) {
  assert(root.startsWith(resolve(tmpdir()) + sep) && basename(root).startsWith("boundary-detail-"));
  await rm(root, { recursive: true, force: true });
}
async function changedCity(f, index, mutate) {
  const entry = index.scopes.city[1], path = join(f.out, entry.path), value = JSON.parse(await readFile(path, "utf8"));
  mutate(value.features[0]); const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(path, bytes); Object.assign(entry, { bytes: bytes.length, sha256: sha256(bytes) });
  await writeFile(join(f.out, "barangays/index.json"), JSON.stringify(index));
}

test("detailed city chunks preserve curated order/properties/IDs and original holes/islands; builds are deterministic", async () => {
  const f = await fixture();
  try {
    const result = await buildBoundaryDetail(f, f.source), indexPath = join(f.out, "barangays/index.json");
    assert.equal(result.detail.features, 3); assert.equal(result.detail.fallback_features, 0); assert.equal(result.detail.tolerance_degrees, 0);
    const entries = result.index.scopes.city;
    for (const [i, entry] of entries.entries()) {
      const compressed = await readFile(join(f.out, entry.detail.path));
      assert.equal(compressed.length, entry.detail.bytes); assert.equal(sha256(compressed), entry.detail.sha256);
      const collection = JSON.parse(gunzipSync(compressed));
      assert.equal(collection.name, "Keep this collection property");
      assert.deepEqual(collection.features.map(({ geometry, ...rest }) => rest), f.cities[i].features.map(({ geometry, ...rest }) => rest));
      if (i === 0) assert.deepEqual(collection.features[1].geometry, { type: "MultiPolygon", coordinates: [[rings[0][0], rings[0][1]], [rings[0][2]]] });
      assert.equal(entry.path, f.index.scopes.city[i].path); assert.equal(entry.sha256, f.index.scopes.city[i].sha256);
    }
    assert.deepEqual(result.index.scopes.province[0].detail.paths.map((entry) => entry.code), ["city1", "city2"]);
    assert.equal(result.index.scopes.province[0].detail.features, 2, "a province descriptor must count only its own records, even when a city chunk contains another province");
    const savedMetadata = JSON.parse(await readFile(f.metadata, "utf8")), originalIndex = await readFile(indexPath);
    assert.equal(savedMetadata.unrelated, "preserved");
    assert.equal(savedMetadata.latest_boundary_release.artifacts.barangay_index.sha256, sha256(originalIndex));
    assert.equal(savedMetadata.latest_boundary_release.artifacts.barangay_index.path, "preserved-index-path");
    await buildBoundaryDetail(f, f.source);
    assert.deepEqual(await readFile(indexPath), originalIndex);
  } finally { await cleanup(f.root); }
});

test("missing original geometry leaves index/metadata untouched and never promotes partial chunks", async () => {
  const f = await fixture();
  try {
    await changedCity(f, f.index, (feature) => { feature.properties.source_code = "NAMRIA_PH9999999999"; });
    const indexPath = join(f.out, "barangays/index.json"), beforeIndex = await readFile(indexPath), beforeMetadata = await readFile(f.metadata);
    await assert.rejects(buildBoundaryDetail(f, f.source), /Missing original/);
    assert.deepEqual(await readFile(indexPath), beforeIndex); assert.deepEqual(await readFile(f.metadata), beforeMetadata);
    assert.deepEqual(await readdir(join(f.out, "barangays/detail")), []);
  } finally { await cleanup(f.root); }
});

test("changed cached source and unsafe coarse paths fail without overwriting evidence", async () => {
  const f = await fixture();
  try {
    const path = join(f.raw, "fixture.shp"), original = await readFile(path), changed = Buffer.from(original); changed[50] ^= 1;
    await writeFile(path, changed);
    await assert.rejects(buildBoundaryDetail(f, f.source), /Changed cached detail source/);
    assert.deepEqual(await readFile(path), changed);
    await writeFile(path, original); f.index.scopes.city[0].path = "../outside.json";
    await writeFile(join(f.out, "barangays/index.json"), JSON.stringify(f.index));
    await assert.rejects(buildBoundaryDetail(f, f.source), /Unsafe barangay scope path/);
  } finally { await cleanup(f.root); }
});

test("duplicate original pcodes and Null shapes fail without silently retaining coarse geometry", async () => {
  for (const problem of ["duplicate", "null"]) {
    const f = await fixture();
    try {
      const buffers = sourceBuffers(problem === "null" ? [Buffer.alloc(4), shape(rings[1]), shape(rings[2])] : undefined);
      if (problem === "duplicate") buffers.dbf.write("PH0000000001", 66 + 17, "ascii");
      for (const [extension, bytes] of Object.entries(buffers)) {
        const descriptor = f.source.components.find((file) => file.filename.endsWith("." + extension));
        await writeFile(join(f.raw, descriptor.filename), bytes);
        Object.assign(descriptor, { bytes: bytes.length, sha256: sha256(bytes) });
      }
      const beforeIndex = await readFile(join(f.out, "barangays/index.json")), beforeMetadata = await readFile(f.metadata);
      await assert.rejects(buildBoundaryDetail(f, f.source), problem === "duplicate" ? /duplicate original ADM4_PCODE/ : /Null original geometry/);
      assert.deepEqual(await readFile(join(f.out, "barangays/index.json")), beforeIndex);
      assert.deepEqual(await readFile(f.metadata), beforeMetadata);
    } finally { await cleanup(f.root); }
  }
});

test("a failed rebuild preserves all published detail chunks and the existing index", async () => {
  const f = await fixture();
  try {
    const result = await buildBoundaryDetail(f, f.source), paths = result.index.scopes.city.map((entry) => join(f.out, entry.detail.path));
    const originals = await Promise.all(paths.map((path) => readFile(path)));
    await changedCity(f, result.index, (feature) => { feature.properties.extra.changed = true; });
    const before = await readFile(join(f.out, "barangays/index.json"));
    await assert.rejects(buildBoundaryDetail(f, f.source), /Refusing to replace different detailed geometry/);
    assert.deepEqual(await readFile(join(f.out, "barangays/index.json")), before);
    for (let i = 0; i < paths.length; i++) assert.deepEqual(await readFile(paths[i]), originals[i]);
  } finally { await cleanup(f.root); }
});

test("bad downloads are checksum rejected before becoming cached source files", async () => {
  const f = await fixture(), originalFetch = globalThis.fetch;
  try {
    const path = join(f.raw, "fixture.cpg"); await unlink(path);
    globalThis.fetch = async () => new Response("UTF-X\n");
    await assert.rejects(buildBoundaryDetail(f, f.source), /checksum or size/);
    assert(!(await readdir(f.raw)).includes("fixture.cpg"));
    assert(!(await readdir(f.raw)).some((file) => file.endsWith(".tmp")));
  } finally { globalThis.fetch = originalFetch; await cleanup(f.root); }
});
