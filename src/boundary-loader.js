"use strict";

const GENERATED_BOUNDARY_URL = "data/generated/admin_boundaries.normalized.geojson";
let generatedAdminFeatures = [];

async function loadGeneratedBoundaryFeatures() {
  state.generatedBoundaryStatus = "loading";
  state.generatedBoundaryMessage = "Loading generated normalized GeoJSON...";

  try {
    const response = await fetch(GENERATED_BOUNDARY_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const collection = await response.json();
    generatedAdminFeatures = geoJsonToAdminFeatures(collection);
    state.generatedBoundaryStatus = generatedAdminFeatures.length ? "ready" : "empty";
    state.generatedBoundaryMessage = generatedAdminFeatures.length
      ? `${generatedAdminFeatures.length} generated boundary feature${generatedAdminFeatures.length === 1 ? "" : "s"} loaded.`
      : "Generated boundary file did not contain renderable polygon features.";
  } catch (error) {
    generatedAdminFeatures = [];
    state.generatedBoundaryStatus = "error";
    state.generatedBoundaryMessage = `Generated boundary source unavailable: ${error.message}.`;
    if (state.boundarySource === "generated") {
      state.boundarySource = "fixture";
    }
  }
}

function getAdminFeatures() {
  if (state.boundarySource === "generated" && generatedAdminFeatures.length) {
    return generatedAdminFeatures;
  }
  return ADMIN_FEATURES;
}

function getBoundarySourceLabel() {
  if (state.boundarySource === "generated" && generatedAdminFeatures.length) {
    return "Generated normalized GeoJSON";
  }
  return "Built-in sample fixtures";
}

function geoJsonToAdminFeatures(collection) {
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error("Expected a GeoJSON FeatureCollection");
  }

  const featuresWithGeometry = collection.features.filter((feature) => feature.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type));
  if (!featuresWithGeometry.length) return [];

  const bounds = geoJsonBounds(featuresWithGeometry);
  const width = Math.max(1, bounds.maxLon - bounds.minLon);
  const height = Math.max(1, bounds.maxLat - bounds.minLat);
  const scale = Math.min(900 / width, 1050 / height);
  const padding = 80;
  const recordsByCode = new Map(
    featuresWithGeometry.map((feature) => [String(feature.properties?.psgc_code || ""), feature.properties || {}])
  );

  return featuresWithGeometry.map((feature) => {
    const properties = feature.properties || {};
    const code = String(properties.psgc_code || "");
    const level = normalizeBoundaryLevel(properties.level);
    const regionCode = String(properties.region_code || "");
    const provinceCode = String(properties.province_code || "");
    const cityCode = String(properties.city_municipality_code || "");
    const barangayCode = String(properties.barangay_code || "");
    const name = String(properties.name || code || "Unnamed geography");

    return {
      code,
      name,
      level,
      regionCode,
      regionName: boundaryParentName(recordsByCode, regionCode, level === "region" ? name : ""),
      provinceCode,
      provinceName: boundaryParentName(recordsByCode, provinceCode, level === "province" ? name : ""),
      cityCode,
      cityName: boundaryParentName(recordsByCode, cityCode, level === "city" ? name : ""),
      barangayCode,
      barangayName: level === "barangay" ? name : "",
      sourceVersion: String(properties.source_version || properties.boundary_source_version || ""),
      sourceMode: "generated",
      polygons: geometryToPolygons(feature.geometry).map((ring) =>
        ring.map(([lon, lat]) => ({
          x: padding + (lon - bounds.minLon) * scale,
          y: padding + (bounds.maxLat - lat) * scale
        }))
      )
    };
  });
}

function geoJsonBounds(features) {
  const coords = [];
  features.forEach((feature) => collectGeoJsonCoordinates(feature.geometry.coordinates, coords));
  const lonValues = coords.map(([lon]) => lon);
  const latValues = coords.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lonValues),
    maxLon: Math.max(...lonValues),
    minLat: Math.min(...latValues),
    maxLat: Math.max(...latValues)
  };
}

function geometryToPolygons(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(stripDuplicateClosingCoordinate).filter((ring) => ring.length >= 3);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .flatMap((polygon) => polygon.map(stripDuplicateClosingCoordinate))
      .filter((ring) => ring.length >= 3);
  }
  return [];
}

function collectGeoJsonCoordinates(value, output) {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    output.push(value);
    return;
  }
  value.forEach((item) => collectGeoJsonCoordinates(item, output));
}

function stripDuplicateClosingCoordinate(ring) {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

function normalizeBoundaryLevel(level) {
  if (level === "city/municipality") return "city";
  return String(level || "").trim().toLowerCase();
}

function boundaryParentName(recordsByCode, code, fallback) {
  if (!code) return "";
  return String(recordsByCode.get(code)?.name || fallback || code);
}
