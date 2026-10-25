"use strict";

const viewportDetailCities = new Map(), viewportDetailFailed = new Set();
let viewportDetailActive = new Set(), viewportDetailRevision = 0, viewportDetailMerged = null, viewportDetailLoading = false;
let viewportDetailController = null;

function clearViewportBoundaryDetail(clearCache = true) {
  viewportDetailController?.abort(); viewportDetailController = null;
  if (clearCache) { viewportDetailCities.clear(); viewportDetailFailed.clear(); }
  viewportDetailActive.clear();
  viewportDetailRevision++; viewportDetailMerged = null; viewportDetailLoading = false;
}

function viewportBoundaryDetailStatus() {
  const codes = [...viewportDetailActive];
  return { total: codes.length, loaded: codes.filter((code) => viewportDetailCities.has(code)).length,
    failed: codes.filter((code) => viewportDetailFailed.has(code)).length, loading: viewportDetailLoading };
}

function applyViewportBoundaryDetail(base) {
  if (!viewportDetailActive.size) return base;
  if (viewportDetailMerged?.base === base && viewportDetailMerged.revision === viewportDetailRevision) return viewportDetailMerged.features;
  const originals = new Map();
  for (const code of viewportDetailActive) for (const feature of viewportDetailCities.get(code) || []) originals.set(feature.sourceCode, feature);
  const features = originals.size ? base.map((feature) => originals.get(feature.sourceCode) || feature) : base;
  viewportDetailMerged = { base, revision: viewportDetailRevision, features };
  return features;
}

function maybeLoadViewportBoundaryDetail() {
  if (typeof DecompressionStream !== "function" || state.boundarySource !== "generated" || state.level !== "barangay" || !mapViewBox || !mapFittedViewBox) return;
  const [x, y, width, height] = mapViewBox;
  let codes = [];
  if (["country", "region"].includes(getScope().type) && width < mapFittedViewBox[2] * 0.3) {
    const candidates = mapSpatialIndex ? mapSpatialIndex.query({ minX: x, minY: y, maxX: x + width, maxY: y + height }).map(({ feature }) => feature)
      : renderedFeatures.filter((feature) => {
        const bounds = cachedFeatureGeometry(feature).bounds;
        return bounds.minX <= x + width && bounds.maxX >= x && bounds.minY <= y + height && bounds.maxY >= y;
      });
    codes = [...new Set(candidates.map((feature) => feature.cityCode))].filter((code) => generatedBarangayDetails.has(`city:${code}`));
    if (codes.length > 24 || codes.reduce((n, code) => n + generatedBarangayDetails.get(`city:${code}`).features, 0) > 5000 || codes.reduce((n, code) => n + generatedBarangayDetails.get(`city:${code}`).bytes, 0) > 8_000_000) codes = [];
  }
  const changed = codes.length !== viewportDetailActive.size || codes.some((code) => !viewportDetailActive.has(code));
  if (changed) {
    viewportDetailController?.abort(); viewportDetailController = null; viewportDetailLoading = false;
    viewportDetailActive = new Set(codes); viewportDetailRevision++;
  }
  const missing = codes.filter((code) => !viewportDetailCities.has(code) && !viewportDetailFailed.has(code));
  if (missing.length && !viewportDetailLoading) {
    viewportDetailLoading = true;
    const version = boundaryLoadVersion;
    const controller = new AbortController(), { signal } = controller;
    viewportDetailController = controller;
    Promise.all(missing.map(async (code) => {
      try {
        const collection = await loadBoundaryDetail(generatedBarangayDetails.get(`city:${code}`), { type: "city", code }, { signal });
        if (version === boundaryLoadVersion && !signal.aborted) viewportDetailCities.set(code, geoJsonToAdminFeatures(collection));
      } catch { if (version === boundaryLoadVersion && !signal.aborted) viewportDetailFailed.add(code); }
    })).then(() => {
      if (version !== boundaryLoadVersion || viewportDetailController !== controller) return;
      viewportDetailController = null; viewportDetailLoading = false; viewportDetailRevision++;
      for (const code of viewportDetailCities.keys()) {
        if (viewportDetailCities.size <= 24) break;
        if (!viewportDetailActive.has(code)) viewportDetailCities.delete(code);
      }
      render();
      maybeLoadViewportBoundaryDetail();
    });
  }
  if (typeof updateBoundaryDetailStatus === "function") updateBoundaryDetailStatus();
  if (changed && !missing.length) render();
}

function validBoundaryDetail(descriptor) {
  return descriptor && /^barangays\/detail\/city\/[\w-]+\.geojson\.gz$/.test(descriptor.path)
    && /^[a-f0-9]{64}$/.test(descriptor.sha256) && Number.isSafeInteger(descriptor.bytes) && descriptor.bytes > 0 && descriptor.bytes <= 50_000_000
    && Number.isSafeInteger(descriptor.features) && descriptor.features > 0 && descriptor.features <= 5000;
}

async function loadBoundaryDetail(descriptor, scope, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  const paths = descriptor.paths || [descriptor];
  if (!paths.length || paths.length > 200 || !paths.every(validBoundaryDetail)) throw new Error("Invalid detailed boundary index");
  const results = new Array(paths.length);
  let next = 0, completed = 0;
  onProgress?.(completed, paths.length);
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, async () => {
    while (next < paths.length) {
      signal?.throwIfAborted();
      const index = next++, item = paths[index], response = await fetch(`data/generated/${item.path}`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== item.bytes) throw new Error("Detailed boundary size mismatch");
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
      signal?.throwIfAborted();
      if (digest !== item.sha256) throw new Error("Detailed boundary checksum mismatch");
      const collection = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"), { signal })).json();
      signal?.throwIfAborted();
      if (collection.type !== "FeatureCollection" || collection.features?.length !== item.features) throw new Error("Detailed boundary count mismatch");
      results[index] = collection.features;
      onProgress?.(++completed, paths.length);
    }
  }));
  const features = results.flat().filter((feature) => scope.type !== "province" || feature.properties?.province_code === scope.code);
  if (features.length !== descriptor.features) throw new Error("Detailed scope count mismatch");
  return { type: "FeatureCollection", features };
}
