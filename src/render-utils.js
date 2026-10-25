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

function labelPointForFeature(feature) {
  const groups = feature.polygonGroups || (feature.polygons || []).map((ring) => [ring]);
  let polygon = null;
  let area = 0;
  for (const group of groups) {
    if (!group.length || group.some((ring) => ring.length < 3 || ring.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) continue;
    const netArea = Math.abs(labelRingArea(group[0])) - group.slice(1).reduce((sum, ring) => sum + Math.abs(labelRingArea(ring)), 0);
    if (netArea > area) {
      polygon = group;
      area = netArea;
    }
  }
  if (!polygon) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  polygon[0].forEach((point) => {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });
  const height = maxY - minY;
  let best = null;
  let bestDistance = -1;
  // ponytail: sixteen scanlines bound coastline work; use polylabel if finer placement is needed.
  for (let scan = 0; scan < 16; scan += 1) {
    const y = minY + height * (scan + 0.5) / 16;
    const intersections = [];
    for (const ring of polygon) {
      ring.forEach((point, index) => {
        const next = ring[(index + 1) % ring.length];
        if ((point.y > y) !== (next.y > y)) {
          intersections.push(point.x + (y - point.y) * (next.x - point.x) / (next.y - point.y));
        }
      });
    }
    intersections.sort((a, b) => a - b);
    let candidate = null;
    let width = 0;
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const span = intersections[index + 1] - intersections[index];
      if (span > width) {
        width = span;
        candidate = { x: intersections[index] + span / 2, y };
      }
    }
    if (!candidate) continue;
    const distance = labelDistanceToEdges(candidate, polygon);
    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best ? { ...best, area } : null;
}

function labelRingArea(ring) {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function labelDistanceToEdges(point, polygon) {
  let distance = Infinity;
  for (const ring of polygon) {
    ring.forEach((start, index) => {
      const end = ring[(index + 1) % ring.length];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
      distance = Math.min(distance, (point.x - start.x - t * dx) ** 2 + (point.y - start.y - t * dy) ** 2);
    });
  }
  return distance;
}

function formatFeatureLabel(feature, value, options = {}) {
  const lines = [];
  const name = String(feature.name || "").trim();
  const customLabel = String(options.customLabel ?? "").trim();
  if (options.showName !== false && name) lines.push(name);
  if (options.showValue !== false && Number.isFinite(value)) lines.push(formatNumber(value));
  if (customLabel) lines.push(customLabel);
  return lines;
}

function createFeatureLabel(feature, value, options = {}) {
  const point = options.point || labelPointForFeature(feature);
  const lines = formatFeatureLabel(feature, value, options);
  if (!point || !lines.length) return null;
  const fontSize = Number.isFinite(options.fontSize) && options.fontSize > 0 ? options.fontSize : 12;
  const text = createSvgElement("text", {
    class: "map-label",
    x: point.x,
    y: point.y,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    "font-family": "Inter, Segoe UI, Arial, sans-serif",
    "font-size": fontSize,
    "font-weight": 700,
    fill: "#17211b",
    stroke: "#ffffff",
    "stroke-width": fontSize * 0.22,
    "stroke-linejoin": "round",
    "paint-order": "stroke fill",
    "pointer-events": "none",
    "aria-label": lines.join(", ")
  });
  lines.forEach((line, index) => {
    const span = createSvgElement("tspan", {
      x: point.x,
      dy: index === 0 ? `${-(lines.length - 1) * 0.6}em` : "1.2em"
    });
    span.textContent = line;
    text.appendChild(span);
  });
  return text;
}

function createSvgElement(tag, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function statisticHeading() {
  const name = state.statisticLabel.trim();
  return `${!name || name.toLowerCase() === "value" ? "Statistic" : name}${state.metricUnit ? ` (${state.metricUnit})` : ""}`;
}

function placeDetailsMarkup(feature, value, join) {
  const hasPsgc = /^\d{10}$/.test(feature.code) && feature.matchStatus !== "unmatched";
  const parents = placeParents(feature);
  const manual = Object.hasOwn(state.placeOverrides[feature.code] || {}, "value");
  const row = join?.importedRowByCode?.get(feature.code);
  const rawValue = String(row?.[state.valueColumn] ?? "").trim();
  const statistic = statisticHeading();
  const hasValue = Number.isFinite(value);
  const source = manual ? "Manual entry" : row ? `CSV column: ${state.valueColumn}` : hasValue ? "Mapped statistic" : "No statistic has been added. Missing does not mean zero.";
  const reason = hasValue ? "" : manual
    ? String(state.placeOverrides[feature.code].value).trim() ? "The manual statistic is not a valid number." : "Cleared manually. Any CSV value is overridden."
    : row ? rawValue ? `The CSV entry “${rawValue}” is not a valid number.` : "The statistic cell in the CSV is blank."
      : "";
  const customLabel = join ? customLabelForFeature(feature, join) : "";
  return `
    <p class="selection-name">${escapeHtml(feature.name)}</p>
    <p class="place-kind">${escapeHtml(placeTypeLabel(feature))}</p>
    <dl class="place-facts">
      ${parents.map(([label, parent]) => `<div><dt>${label}</dt><dd>${escapeHtml(parent)}</dd></div>`).join("")}
      <div><dt>${hasPsgc ? "PSGC code" : "Source identifier"}</dt><dd><code>${escapeHtml(feature.code)}</code></dd></div>
    </dl>
    <p class="place-code-help">${hasPsgc ? "Philippine Standard Geographic Code. Used to match CSV rows to this place." : "Unmatched boundary record. This identifier is not an official PSGC code."}</p>
    ${feature.matchStatus === "fuzzy" ? '<p class="note">The source matched this boundary by a similar name. Review the boundary details before publishing.</p>' : ""}
    <dl class="place-facts place-statistic"><div><dt>${escapeHtml(statistic)}</dt><dd><strong>${hasValue ? formatNumber(value) : "No statistic available"}</strong></dd></div></dl>
    <p class="place-data-source">${escapeHtml(source)}</p>
    ${reason ? `<p class="place-value-help">${escapeHtml(reason)}</p>` : ""}
    ${row && !manual && /illustrative|sample values|sample statistics/i.test(state.sourceNote) ? '<p class="place-value-help">Illustrative sample statistic, not a demographic observation.</p>' : ""}
    ${customLabel ? `<p class="place-annotation"><strong>Custom label:</strong> ${escapeHtml(customLabel)}</p>` : ""}
  `;
}

let tooltipContent = null;
function showTooltip(event, feature, value, join) {
  const stage = el.mapStage.getBoundingClientRect(), canvas = el.mapSvg.getBoundingClientRect();
  if (el.mapTooltip.hidden || tooltipContent?.feature !== feature || tooltipContent.join !== join || !Object.is(tooltipContent.value, value)) {
    el.mapTooltip.innerHTML = `${placeDetailsMarkup(feature, value, join)}<p class="place-tooltip-hint">Click or tap to edit the statistic and custom label.</p>`;
    tooltipContent = { feature, value, join };
  }
  el.mapTooltip.hidden = false;
  el.mapTooltip.style.maxHeight = `${Math.max(0, canvas.height - 16)}px`;
  const tooltip = el.mapTooltip.getBoundingClientRect();
  const minLeft = canvas.left - stage.left + 8, minTop = canvas.top - stage.top + 8;
  const maxLeft = Math.max(minLeft, canvas.right - stage.left - tooltip.width - 8);
  const maxTop = Math.max(minTop, canvas.bottom - stage.top - tooltip.height - 8);
  const left = event.clientX + 12 + tooltip.width > canvas.right - 8 ? event.clientX - stage.left - tooltip.width - 12 : event.clientX - stage.left + 12;
  const top = event.clientY + 12 + tooltip.height > canvas.bottom - 8 ? event.clientY - stage.top - tooltip.height - 12 : event.clientY - stage.top + 12;
  el.mapTooltip.style.left = `${clamp(left, minLeft, maxLeft)}px`;
  el.mapTooltip.style.top = `${clamp(top, minTop, maxTop)}px`;
}

function hideTooltip() {
  el.mapTooltip.hidden = true;
  tooltipContent = null;
}
