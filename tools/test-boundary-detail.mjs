import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, webcrypto } from "node:crypto";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const ring = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const feature = (source, province, city, geometry = { type: "Polygon", coordinates: [ring(0, 0, 1)] }) => ({
  type: "Feature", properties: { source_code: source, psgc_code: "duplicate-code", province_code: province, city_municipality_code: city }, geometry
});
const island = feature("source-a", "P1", "C1", { type: "MultiPolygon", coordinates: [[ring(0, 0, 10), ring(2, 2, 2)], [ring(20, 20, 1)]] });
const second = feature("source-b", "P2", "C1"), third = feature("source-c", "P1", "C2");
const payloads = new Map();
function descriptor(code, features) {
  const bytes = gzipSync(JSON.stringify({ type: "FeatureCollection", features }));
  const path = `barangays/detail/city/${code}.geojson.gz`;
  payloads.set("data/generated/" + path, bytes);
  return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), features: features.length };
}
const cityA = descriptor("C1", [island, second]), cityB = descriptor("C2", [third]);
let fetches = 0, renders = 0;
const context = vm.createContext({
  console, Blob, Response, DecompressionStream, Uint8Array, crypto: webcrypto,
  state: { boundarySource: "generated", level: "barangay" }, scope: { type: "country", code: "PH" },
  generatedBarangayDetails: new Map([["city:C1", cityA], ["city:C2", cityB]]), boundaryLoadVersion: 0,
  mapViewBox: [0, 0, 100, 100], mapFittedViewBox: [0, 0, 100, 100], visibleFeatures: [{ cityCode: "C1" }],
  fetch: async (url) => { fetches++; const bytes = payloads.get(url); return bytes ? new Response(bytes) : new Response(null, { status: 404 }); },
  getScope: () => context.scope,
  geoJsonToAdminFeatures: (collection) => collection.features.map((item) => ({ ...item.properties, sourceCode: item.properties.source_code, geometry: item.geometry })),
  render: () => { renders++; }
});
context.mapSpatialIndex = { query: () => context.visibleFeatures.map((item) => ({ feature: item })) };
vm.runInContext(await readFile("src/boundary-detail.js", "utf8"), context);
const plain = (value) => JSON.parse(JSON.stringify(value));
const turn = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };

const city = await context.loadBoundaryDetail(cityA, { type: "city", code: "C1" });
assert.equal(city.features.length, 2);
assert.deepEqual(plain(city.features[0].geometry), island.geometry, "native gzip decoding must retain exact islands, rings, holes and coordinates");
const province = await context.loadBoundaryDetail({ paths: [cityA, cityB], features: 2 }, { type: "province", code: "P1" });
assert.deepEqual(plain(province.features.map((item) => item.properties.source_code)), ["source-a", "source-c"], "province detail must filter and preserve ordered source records from multiple city archives");
await assert.rejects(context.loadBoundaryDetail({ ...cityA, path: "../private.geojson.gz" }, { type: "city", code: "C1" }), /Invalid detailed boundary index/);
await assert.rejects(context.loadBoundaryDetail({ ...cityA, bytes: cityA.bytes + 1 }, { type: "city", code: "C1" }), /size mismatch/);
await assert.rejects(context.loadBoundaryDetail({ ...cityA, sha256: "f".repeat(64) }, { type: "city", code: "C1" }), /checksum mismatch/);
await assert.rejects(context.loadBoundaryDetail({ ...cityA, features: 3 }, { type: "city", code: "C1" }), /count mismatch/);
await assert.rejects(context.loadBoundaryDetail({ paths: [cityA, cityB], features: 3 }, { type: "province", code: "P1" }), /scope count mismatch/);
await assert.rejects(context.loadBoundaryDetail({ paths: [], features: 1 }, { type: "city", code: "C1" }), /Invalid detailed boundary index/);

context.overview = [
  { sourceCode: "source-a", code: "duplicate-code", name: "First repeated PSGC", marker: 1 },
  { sourceCode: "source-b", code: "duplicate-code", name: "Second repeated PSGC", marker: 2 },
  { sourceCode: "unrelated", code: "other", marker: 3 }
];
assert.equal(context.applyViewportBoundaryDetail(context.overview), context.overview, "an overview must retain its original array when detail is inactive");
context.detailed = context.overview.slice(0, 2).map((item) => ({ ...item, geometry: "original " + item.sourceCode }));
vm.runInContext('viewportDetailCities.set("C1", detailed); viewportDetailActive = new Set(["C1"]); viewportDetailRevision++', context);
const merged = context.applyViewportBoundaryDetail(context.overview);
assert.equal(merged[0], context.detailed[0]); assert.equal(merged[1], context.detailed[1]);
assert.notEqual(merged[0], merged[1], "repeated PSGC codes must keep distinct detailed source geometries");
assert.equal(merged[2], context.overview[2], "unavailable detail must preserve the original record and its metadata");
assert.equal(merged[0].name, context.overview[0].name);
assert.equal(context.applyViewportBoundaryDetail(context.overview), merged, "unchanged detail must reuse its merged array for feature-index caches");
vm.runInContext("viewportDetailRevision++", context);
assert.notEqual(context.applyViewportBoundaryDetail(context.overview), merged, "a detail revision must invalidate the merged-array cache");

context.clearViewportBoundaryDetail();
const nativeLoad = context.loadBoundaryDetail;
let pendingLoads = [];
context.loadBoundaryDetail = (...args) => { const task = nativeLoad(...args); pendingLoads.push(task); return task; };
const finishLoads = async () => { const current = pendingLoads; pendingLoads = []; await Promise.all(current); await turn(); };
fetches = 0; renders = 0;
context.maybeLoadViewportBoundaryDetail(); await turn();
assert.equal(fetches, 0, "the country overview must not fetch original detailed cities");
context.mapViewBox = [0, 0, 20, 20];
context.maybeLoadViewportBoundaryDetail();
await finishLoads();
assert.equal(fetches, 1, "a zoomed viewport must fetch only visible indexed cities");
assert.equal(renders, 1, "one completed detail batch must trigger one redraw");
assert.equal(vm.runInContext('viewportDetailCities.has("C1") && !viewportDetailCities.has("C2")', context), true);
assert.equal(context.applyViewportBoundaryDetail(context.overview)[0].geometry.type, "MultiPolygon");
context.maybeLoadViewportBoundaryDetail(); await turn();
assert.equal(fetches, 1, "an unchanged viewport must reuse decoded detail");
assert.equal(renders, 1);
context.mapViewBox = [0, 0, 100, 100];
context.maybeLoadViewportBoundaryDetail();
assert.equal(context.applyViewportBoundaryDetail(context.overview), context.overview, "zooming back out must restore lightweight overview geometry");
assert.equal(renders, 2);

context.clearViewportBoundaryDetail();
context.mapViewBox = [0, 0, 20, 20];
context.visibleFeatures = Array.from({ length: 25 }, (_, index) => ({ cityCode: "X" + index }));
for (let index = 0; index < 25; index++) context.generatedBarangayDetails.set("city:X" + index, cityA);
fetches = 0;
context.maybeLoadViewportBoundaryDetail(); await turn();
assert.equal(fetches, 0, "viewports spanning more than 24 indexed cities must keep overview geometry");

context.visibleFeatures = [{ cityCode: "C1" }, { cityCode: "C2" }];
for (const [label, first, secondDescriptor] of [
  ["geometry-record", { ...cityA, features: 2501 }, { ...cityB, features: 2500 }],
  ["compressed-byte", { ...cityA, bytes: 4_000_001 }, { ...cityB, bytes: 4_000_000 }]
]) {
  context.clearViewportBoundaryDetail();
  context.generatedBarangayDetails.set("city:C1", first);
  context.generatedBarangayDetails.set("city:C2", secondDescriptor);
  context.maybeLoadViewportBoundaryDetail(); await turn();
  assert.equal(fetches, 0, `the ${label} budget must prevent detail downloads even with only two visible cities`);
  assert.equal(vm.runInContext("viewportDetailActive.size", context), 0, "over-budget viewports must keep overview geometry active");
}
context.generatedBarangayDetails.set("city:C1", cityA);
context.generatedBarangayDetails.set("city:C2", cityB);

context.clearViewportBoundaryDetail();
context.visibleFeatures = [{ cityCode: "C1" }];
vm.runInContext('for (let index = 0; index < 25; index++) viewportDetailCities.set("inactive" + index, [])', context);
context.maybeLoadViewportBoundaryDetail();
await finishLoads();
assert.equal(vm.runInContext("viewportDetailCities.size", context), 24, "completed loads must evict inactive decoded cities beyond the 24-city memory limit");
assert.equal(vm.runInContext('viewportDetailCities.has("C1")', context), true, "cache eviction must preserve a currently active detailed city");

context.clearViewportBoundaryDetail();
const requests = [], releases = new Map();
context.fetch = (url) => { requests.push(url); return new Promise((resolve) => releases.set(url, resolve)); };
renders = 0;
context.visibleFeatures = [{ cityCode: "C1" }];
context.maybeLoadViewportBoundaryDetail();
context.visibleFeatures = [{ cityCode: "C2" }];
context.maybeLoadViewportBoundaryDetail();
assert.equal(requests.length, 1, "a camera change during a download must wait for the current detail batch");
const cityAUrl = "data/generated/" + cityA.path, cityBUrl = "data/generated/" + cityB.path;
releases.get(cityAUrl)(new Response(payloads.get(cityAUrl)));
await finishLoads();
assert.deepEqual(requests, [cityAUrl, cityBUrl], "finishing the first city's download must automatically request the city now under the camera");
releases.get(cityBUrl)(new Response(payloads.get(cityBUrl)));
await finishLoads();
assert.equal(vm.runInContext('viewportDetailActive.size === 1 && viewportDetailActive.has("C2") && viewportDetailCities.has("C2")', context), true,
  "the newly visible city must receive original geometry without another pan or zoom event");
assert.equal(renders, 2, "each completed visible-detail batch must redraw once");

context.clearViewportBoundaryDetail();
let releaseFetch;
context.visibleFeatures = [{ cityCode: "C1" }];
context.fetch = () => new Promise((resolve) => { releaseFetch = resolve; });
renders = 0;
context.maybeLoadViewportBoundaryDetail();
context.boundaryLoadVersion++;
context.clearViewportBoundaryDetail();
releaseFetch(new Response(payloads.get("data/generated/" + cityA.path)));
await finishLoads();
assert.equal(vm.runInContext("viewportDetailCities.size", context), 0, "a stale boundary generation must not publish decoded city geometry");
assert.equal(renders, 0, "a stale boundary generation must not redraw the current project");
console.log("Boundary detail passed: native gzip, SHA-256/size/path/count validation, exact holes/islands, source-record merging, resource budgets, cache reuse, camera changes during downloads, zoom-out and stale-load rejection");
