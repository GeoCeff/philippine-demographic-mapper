"use strict";

// A fixed grid bounds hit testing without adding a dependency or scanning every barangay.
function createMapSpatialIndex(features, geometry) {
  const bounds = boundsFromFeatures(features), cells = new Map(), broad = [];
  const size = Math.max(bounds.width, bounds.height, 0.001) / 64;
  const cell = (value, origin) => Math.max(0, Math.min(63, Math.floor((value - origin) / size)));
  const range = (box) => [cell(box.minX, bounds.minX), cell(box.minY, bounds.minY), cell(box.maxX, bounds.minX), cell(box.maxY, bounds.minY)];
  const items = features.map((feature, record) => ({ feature, record, bounds: geometry(feature).bounds }));
  for (const item of items) {
    const [x0, y0, x1, y1] = range(item.bounds);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 256) { broad.push(item); continue; }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const key = y * 64 + x;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(item);
    }
  }
  const query = (box) => {
    const found = new Set(broad), [x0, y0, x1, y1] = range(box);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const item of cells.get(y * 64 + x) || []) found.add(item);
    }
    return [...found].filter(({ bounds: b }) => b.minX <= box.maxX && b.maxX >= box.minX && b.minY <= box.maxY && b.maxY >= box.minY);
  };
  return { query, hit(point, priority = (item) => item.record) {
    const candidates = query({ minX: point.x, maxX: point.x, minY: point.y, maxY: point.y }).sort((a, b) => priority(b) - priority(a) || b.record - a.record);
    return candidates.find(({ feature }) => mapFeatureContains(feature, point)) || null;
  } };
}

function mapFeatureContains(feature, point) {
  return (feature.polygonGroups || feature.polygons.map((ring) => [ring])).some((polygon) => {
    let inside = false;
    for (const ring of polygon) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  });
}

// Nonzero winding preserves holes without cancelling overlapping same-color neighbours.
function batchPathFromFeature(feature) {
  return (feature.polygonGroups || feature.polygons.map((ring) => [ring])).map((polygon) => polygon.map((ring, index) =>
    pathFromPolygon((labelRingArea(ring) > 0) === (index === 0) ? ring : [...ring].reverse())
  ).join(" ")).join(" ");
}
