"use strict";

const GENERATED_BOUNDARY_URL = "data/generated/admin_boundaries.normalized.geojson";
const GENERATED_METADATA_URL = "data/source_metadata.json";
let generatedAdminFeatures = [];
let generatedScopes = [];
let generatedBarangayPaths = null;
const generatedBarangayDetails = new Map();
const generatedBarangayDetailStatus = new Map();
const generatedBarangayDetailProgress = new Map();
const generatedBarangayFeaturesByScope = new Map();
const loadingBarangayScopes = new Set();
const failedBarangayScopes = new Set();
let boundaryLoadVersion = 0;
let boundaryLoadController = null;
const barangayScopeControllers = new Map();

async function loadGeneratedBoundaryFeatures() {
  const version = ++boundaryLoadVersion;
  boundaryLoadController?.abort();
  for (const controller of barangayScopeControllers.values()) controller.abort();
  barangayScopeControllers.clear();
  const controller = new AbortController();
  boundaryLoadController = controller;
  const { signal } = controller;
  generatedBarangayPaths = null;
  generatedBarangayFeaturesByScope.clear();
  generatedBarangayDetails.clear();
  generatedBarangayDetailStatus.clear();
  generatedBarangayDetailProgress.clear();
  clearViewportBoundaryDetail();
  failedBarangayScopes.clear();
  loadingBarangayScopes.clear();
  state.generatedBoundaryStatus = "loading";
  state.generatedBoundaryMessage = "Loading Philippine boundaries…";
  try {
    const response = await fetch(GENERATED_BOUNDARY_URL, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const collection = await response.json();
    if (version !== boundaryLoadVersion) return;
    generatedAdminFeatures = geoJsonToAdminFeatures(collection);
    if (!generatedAdminFeatures.length) throw new Error("No polygon geometry found");
    generatedScopes = buildBoundaryScopes(generatedAdminFeatures);
    await loadGeneratedBoundaryMetadata(version, signal);
    if (version !== boundaryLoadVersion) return;
    const paths = new Map(), details = new Map();
    try {
      const indexResponse = await fetch("data/generated/barangays/index.json", { signal });
      if (indexResponse.ok) {
        const index = await indexResponse.json();
        if (version !== boundaryLoadVersion) return;
        const entries = [["country:PH", index.national]];
        for (const type of ["region", "province", "city"]) {
          for (const descriptor of index.scopes?.[type] || []) entries.push([`${type}:${descriptor.code}`, descriptor]);
        }
        for (const [key, descriptor] of entries) {
          if (descriptor && /^barangays\/(?:national\.geojson|(?:region|province|city)\/[A-Za-z0-9_-]+\.geojson)$/.test(descriptor.path)) paths.set(key, descriptor.path);
          if (descriptor?.detail) details.set(key, descriptor.detail);
        }
      }
    } catch { /* Admin maps remain usable without the optional full barangay package. */ }
    if (version !== boundaryLoadVersion) return;
    generatedBarangayPaths = paths;
    for (const [key, detail] of details) generatedBarangayDetails.set(key, detail);
    state.generatedBoundaryStatus = "ready";
    state.generatedBoundaryMessage = `${generatedAdminFeatures.length} boundary records loaded.`;
  } catch (error) {
    if (version !== boundaryLoadVersion || signal.aborted) return;
    generatedAdminFeatures = [];
    state.generatedBoundaryStatus = "error";
    state.generatedBoundaryMessage = `Real boundaries unavailable (${error.message}). Run npm run boundaries:barangays, then reload.`;
  }
}

function getAdminFeatures() {
  return state.boundarySource === "generated" ? [...generatedAdminFeatures, ...getLoadedGeneratedBarangays()] : ADMIN_FEATURES;
}

function getScopes() { return state.boundarySource === "generated" && generatedScopes.length ? generatedScopes : SCOPES; }

function buildBoundaryScopes(features) {
  const scopes = [{ id: "PH", name: "Philippines", type: "country", code: null,
    preferredLevel: "province", allowedLevels: ["region", "province", "city", "barangay"] }];
  const seen = new Set();
  const prefixes = { region: "REG", province: "PROV", city: "CITY" };
  for (const feature of features) {
    if (!prefixes[feature.level] || seen.has(`${feature.level}:${feature.code}`)) continue;
    seen.add(`${feature.level}:${feature.code}`);
    const levels = { region: ["region", "province", "city", "barangay"],
      province: ["province", "city", "barangay"], city: ["city", "barangay"] };
    scopes.push({ id: `${prefixes[feature.level]}-${feature.code}`, name: feature.name,
      type: feature.level, code: feature.code, preferredLevel: feature.level === "city" ? "barangay" : "city",
      allowedLevels: levels[feature.level] });
  }
  return scopes;
}

function getBoundarySourceLabel() {
  if (state.boundarySource !== "generated") return "Simplified demonstration shapes";
  if (state.generatedBoundaryStatus !== "ready") return "Real boundaries unavailable";
  return `PSA / NAMRIA · ${state.boundaryMetadata.snapshot || "dated snapshot"}`;
}

function barangayScopeKey(scope = getScope()) { return scope.type === "country" ? "country:PH" : `${scope.type}:${scope.code}`; }

function maybeLoadGeneratedBarangaysForScope() {
  if (state.boundarySource !== "generated" || state.level !== "barangay" || state.generatedBoundaryStatus !== "ready") return;
  const scope = getScope(), key = barangayScopeKey(scope);
  if (generatedBarangayFeaturesByScope.has(key)) {
    const features = generatedBarangayFeaturesByScope.get(key);
    state.generatedBarangayMessage = `${scope.name}: ${new Set(features.map((feature) => feature.code)).size.toLocaleString()} distinct mapped codes (${features.length.toLocaleString()} geometry records).`;
    return;
  }
  if (loadingBarangayScopes.has(key)) { state.generatedBarangayMessage = `Loading ${scope.name} barangays…`; return; }
  if (failedBarangayScopes.has(key)) { state.generatedBarangayMessage = `Barangay geometry unavailable for ${scope.name}. Retry boundary loading to try again.`; return; }
  const path = generatedBarangayPaths ? generatedBarangayPaths.get(key) : `barangays/${scope.type === "country" ? "national.geojson" : `${scope.type}/${encodeURIComponent(scope.code)}.geojson`}`;
  if (!path) {
    failedBarangayScopes.add(key);
    state.generatedBarangayMessage = `No indexed barangay geometry for ${scope.name}. Build the full boundary package to add available scopes.`;
    return;
  }
  loadingBarangayScopes.add(key);
  const version = boundaryLoadVersion;
  const controller = new AbortController(), { signal } = controller;
  barangayScopeControllers.set(key, controller);
  state.generatedBarangayMessage = `Loading ${scope.name} barangays…`;
  const overview = async () => { const response = await fetch(`data/generated/${path}`, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };
  const detail = generatedBarangayDetails.get(key);
  generatedBarangayDetailStatus.set(key, detail ? "loading" : "overview");
  (detail ? loadBoundaryDetail(detail, scope, { signal, onProgress(completed, total) {
    if (version !== boundaryLoadVersion || signal.aborted || generatedBarangayDetailStatus.get(key) !== "loading") return;
    generatedBarangayDetailProgress.set(key, { completed, total });
    if (typeof updateBoundaryDetailStatus === "function") updateBoundaryDetailStatus();
  } }).then((collection) => {
    if (version === boundaryLoadVersion && !signal.aborted) generatedBarangayDetailStatus.set(key, "original");
    return collection;
  }).catch((error) => {
    if (signal.aborted || version !== boundaryLoadVersion) throw error;
    generatedBarangayDetailStatus.set(key, "fallback");
    return overview();
  }) : overview())
    .then((collection) => {
      if (version !== boundaryLoadVersion || signal.aborted) return;
      const features = geoJsonToAdminFeatures(collection);
      generatedBarangayFeaturesByScope.set(key, features);
      // ponytail: retain three chunks; switch to tiles if larger boundary sources outgrow SVG.
      while (generatedBarangayFeaturesByScope.size > 3) {
        const expired = [...generatedBarangayFeaturesByScope.keys()].find((item) => item !== barangayScopeKey());
        generatedBarangayFeaturesByScope.delete(expired);
        generatedBarangayDetailStatus.delete(expired);
      }
      if (key === barangayScopeKey()) state.generatedBarangayMessage = `${new Set(features.map((feature) => feature.code)).size.toLocaleString()} distinct mapped codes (${features.length.toLocaleString()} geometry records).`;
    })
    .catch((error) => {
      if (version !== boundaryLoadVersion || signal.aborted) return;
      failedBarangayScopes.add(key);
      if (key === barangayScopeKey()) state.generatedBarangayMessage = `Barangays unavailable for ${scope.name}: ${error.message}. Rebuild boundaries or retry.`;
    })
    .finally(() => { if (version === boundaryLoadVersion) { loadingBarangayScopes.delete(key); barangayScopeControllers.delete(key); generatedBarangayDetailProgress.delete(key); render(); } });
}

function getLoadedGeneratedBarangays() { return state.level === "barangay" ? applyViewportBoundaryDetail(generatedBarangayFeaturesByScope.get(barangayScopeKey()) || []) : []; }

async function loadGeneratedBoundaryMetadata(version = boundaryLoadVersion, signal) {
  try {
    const response = await fetch(GENERATED_METADATA_URL, { signal });
    if (!response.ok) return;
    const metadata = await response.json(), release = metadata.latest_boundary_release || {};
    if (version !== boundaryLoadVersion || signal?.aborted) return;
    state.boundaryMetadata = { releaseTag: release.release_tag || "", snapshot: release.snapshot || "",
      namriaVersion: release.namria_version || "", adminFeatures: release.admin_features || "",
      barangayFeatures: release.barangay_features || "", detailSource: release.detail?.provenance_url || "", detailVersion: release.detail?.source_version || "", caveat: release.caveat || metadata.caveat || "" };
  } catch { if (version === boundaryLoadVersion && !signal?.aborted) state.boundaryMetadata = {}; }
}

function geoJsonToAdminFeatures(collection) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) throw new Error("Expected a GeoJSON FeatureCollection");
  const recordsByCode = new Map(generatedAdminFeatures.map((feature) => [feature.code, { name: feature.name }]));
  for (const feature of collection.features) {
    const properties = feature.properties || {};
    recordsByCode.set(String(properties.psgc_code || properties.source_code || ""), properties);
  }
  return collection.features.filter((feature) => feature.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type)).map((feature) => {
    const properties = feature.properties || {}, code = String(properties.psgc_code || properties.source_code || "");
    const level = normalizeBoundaryLevel(properties.level), name = String(properties.name || code || "Unnamed geography");
    const regionCode = String(properties.region_code || ""), provinceCode = String(properties.province_code || ""), cityCode = String(properties.city_municipality_code || "");
    const polygonGroups = geometryToPolygonGroups(feature.geometry).map((polygon) => polygon.map((ring) => ring.map(projectBoundaryCoordinate)));
    return { code, sourceCode: String(properties.source_code || code), name, level, regionCode, provinceCode, cityCode,
      regionName: String(properties.region_name || boundaryParentName(recordsByCode, regionCode, level === "region" ? name : "")),
      provinceName: String(properties.province_name || boundaryParentName(recordsByCode, provinceCode, level === "province" ? name : "")),
      cityName: String(properties.city_municipality_name || boundaryParentName(recordsByCode, cityCode, level === "city" ? name : "")),
      barangayCode: String(properties.barangay_code || ""), barangayName: level === "barangay" ? name : "",
      sourceVersion: String(properties.source_version || ""), sourceMode: "generated",
      adminType: String(properties.admin_type || ""), matchStatus: String(properties.match_status || ""),
      polygonGroups, polygons: polygonGroups.flat() };
  }).filter((feature) => feature.code && feature.polygons.length);
}

function projectBoundaryCoordinate([lon, lat]) {
  // A shared spherical Mercator frame keeps independently loaded scopes aligned.
  const radians = Math.PI / 180, north = Math.log(Math.tan(Math.PI / 4 + 22 * radians / 2));
  const latitude = Math.max(-85, Math.min(85, lat));
  return { x: 80 + (lon - 116) * 80,
    y: 80 + (north - Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2))) / radians * 80 };
}

function geoJsonBounds(features) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  features.forEach((feature) => collectGeoJsonCoordinates(feature.geometry.coordinates, bounds));
  return bounds;
}

function geometryToPolygonGroups(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  return polygons.map((polygon) => polygon.map(stripDuplicateClosingCoordinate).filter((ring) => ring.length >= 3)).filter((polygon) => polygon.length);
}
function geometryToPolygons(geometry) { return geometryToPolygonGroups(geometry).flat(); }
function collectGeoJsonCoordinates(value, bounds) {
  if (!Array.isArray(value)) return;
  if (Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    bounds.minLon = Math.min(bounds.minLon, value[0]); bounds.maxLon = Math.max(bounds.maxLon, value[0]);
    bounds.minLat = Math.min(bounds.minLat, value[1]); bounds.maxLat = Math.max(bounds.maxLat, value[1]);
  } else value.forEach((item) => collectGeoJsonCoordinates(item, bounds));
}
function stripDuplicateClosingCoordinate(ring) {
  if (ring.length < 2) return ring;
  const first = ring[0], last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}
function normalizeBoundaryLevel(level) { return level === "city/municipality" ? "city" : String(level || "").trim().toLowerCase(); }
function boundaryParentName(recordsByCode, code, fallback) { return code ? String(recordsByCode.get(code)?.name || fallback || code) : ""; }
