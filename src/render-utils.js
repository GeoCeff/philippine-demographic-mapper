"use strict";

function boundsFromFeatures(features) {
  if (!features.length) {
    return { minX: 0, minY: 0, maxX: 900, maxY: 1100, width: 900, height: 1100 };
  }
  const points = features.flatMap((feature) => feature.polygons.flat());
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
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
