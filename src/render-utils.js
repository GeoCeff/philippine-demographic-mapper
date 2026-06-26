"use strict";

function boundsFromFeatures(features) {
  if (!features.length) {
    return { minX: 0, minY: 0, maxX: 900, maxY: 1100, width: 900, height: 1100 };
  }
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  features.forEach((feature) => {
    feature.polygons.flat().forEach((point) => {
      bounds.minX = Math.min(bounds.minX, point.x);
      bounds.maxX = Math.max(bounds.maxX, point.x);
      bounds.minY = Math.min(bounds.minY, point.y);
      bounds.maxY = Math.max(bounds.maxY, point.y);
    });
  });
  const { minX, maxX, minY, maxY } = bounds;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathFromFeature(feature) {
  return feature.polygons.map(pathFromPolygon).join(" ");
}

function pathFromPolygon(polygon) {
  const [first, ...rest] = polygon;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
}

function createSvgElement(tag, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function showTooltip(event, feature, value) {
  const rect = el.mapStage.getBoundingClientRect();
  el.mapTooltip.hidden = false;
  el.mapTooltip.style.left = `${event.clientX - rect.left + 12}px`;
  el.mapTooltip.style.top = `${event.clientY - rect.top + 12}px`;
  el.mapTooltip.innerHTML = `
    <strong>${escapeHtml(feature.name)}</strong><br>
    <code>${escapeHtml(feature.code)}</code><br>
    Value: ${Number.isFinite(value) ? formatNumber(value) : "Missing"}
  `;
}

function hideTooltip() {
  el.mapTooltip.hidden = true;
}
