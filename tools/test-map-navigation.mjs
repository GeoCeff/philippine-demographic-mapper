import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const viewport = { left: 100, top: 50, width: 900, height: 500 };
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform(matrix) { return new Point(matrix.a * this.x + matrix.c * this.y + matrix.e, matrix.b * this.x + matrix.d * this.y + matrix.f); }
}
function screenMatrix(box) {
  const [x, y, width, height] = box, scale = Math.min(viewport.width / width, viewport.height / height);
  const matrix = { a: scale, b: 0, c: 0, d: scale,
    e: viewport.left + (viewport.width - width * scale) / 2 - x * scale,
    f: viewport.top + (viewport.height - height * scale) / 2 - y * scale };
  matrix.inverse = () => ({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: -matrix.e / scale, f: -matrix.f / scale });
  return matrix;
}
function node(tag) {
  const result = {
    tag, attributes: {}, dataset: {}, children: [], parent: null, style: {}, listeners: new Map(), captures: new Set(),
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith("data-")) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    },
    getAttribute(key) { return this.attributes[key] ?? null; },
    hasAttribute(key) { return Object.hasOwn(this.attributes, key); },
    removeAttribute(key) {
      delete this.attributes[key];
      if (key.startsWith("data-")) delete this.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    },
    get firstChild() { return this.children[0] || null; },
    get innerHTML() { return this.html || ""; },
    set innerHTML(value) { this.html = String(value); this.children.forEach((child) => { child.parent = null; }); this.children = []; },
    appendChild(child) {
      if (child.tag === "#fragment") { while (child.firstChild) this.appendChild(child.firstChild); return child; }
      child.remove(); child.parent = this; this.children.push(child); return child;
    },
    insertBefore(child, before) { child.remove(); const index = this.children.indexOf(before); child.parent = this; this.children.splice(index < 0 ? this.children.length : index, 0, child); return child; },
    cloneNode(deep = false) {
      const copy = node(this.tag);
      for (const [key, value] of Object.entries(this.attributes)) copy.setAttribute(key, value);
      copy.textContent = this.textContent;
      if (deep) this.children.forEach((child) => copy.appendChild(child.cloneNode(true)));
      return copy;
    },
    replaceChildren(...children) { this.innerHTML = ""; children.forEach((child) => this.appendChild(child)); },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
    querySelectorAll(selector) {
      const matches = [], selectors = selector.split(",").map((value) => value.trim());
      const visit = (item) => { for (const child of item.children) { if (selectors.some((value) => child.matches(value))) matches.push(child); visit(child); } };
      visit(this); return matches;
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    contains(other) { for (let item = other; item; item = item.parent) if (item === this) return true; return false; },
    matches(selector) {
      const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (attribute) return Object.hasOwn(this.attributes, attribute[1]) && (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]);
      return selector.startsWith(".") ? (this.attributes.class || "").split(/\s+/).includes(selector.slice(1)) : this.tag === selector;
    },
    closest(selector) { for (let item = this; item; item = item.parent) if (item.matches(selector)) return item; return null; },
    addEventListener(type, listener, options) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push({ listener, options }); },
    setPointerCapture(id) { this.captures.add(id); },
    releasePointerCapture(id) { this.captures.delete(id); },
    hasPointerCapture(id) { return this.captures.has(id); },
    focus() { document.activeElement = this; },
    getBoundingClientRect() { return { ...viewport, right: viewport.left + viewport.width, bottom: viewport.top + viewport.height }; },
    getScreenCTM() { return screenMatrix(this.attributes.viewBox.split(/\s+/).map(Number)); }
  };
  result.classList = {
    add(value) { result.setAttribute("class", [...new Set((result.attributes.class || "").split(/\s+/).filter(Boolean).concat(value))].join(" ")); },
    remove(value) { result.setAttribute("class", (result.attributes.class || "").split(/\s+/).filter((item) => item !== value).join(" ")); },
    contains(value) { return result.matches("." + value); },
    toggle(value, force) {
      const add = force === undefined ? !this.contains(value) : !!force;
      this[add ? "add" : "remove"](value); return add;
    }
  };
  return result;
}
function emit(target, type, values = {}) {
  const event = { type, target, button: 0, buttons: 1, pointerId: 1, isPrimary: true, clientX: 250, clientY: 250,
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...values };
  for (const { listener } of target.listeners.get(type) || []) listener(event);
  return event;
}
const timers = new Map();
const animationFrames = new Map(), resizeObservers = [];
let nextTimer = 1;
let serializedTree = null;
const document = Object.assign(node("document"), { createElementNS: (_namespace, tag) => node(tag), createDocumentFragment: () => node("#fragment") });
const context = vm.createContext({ document, window: node("window"), DOMPoint: Point, console, Intl, Map, Set, Number, String, Math, URL, Blob, AbortController,
  XMLSerializer: class { serializeToString(tree) { serializedTree = tree; return "<svg/>"; } },
  setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; }, clearTimeout(id) { timers.delete(id); },
  requestAnimationFrame(callback) { const id = nextTimer++; animationFrames.set(id, callback); return id; },
  cancelAnimationFrame(id) { animationFrames.delete(id); },
  ResizeObserver: class { constructor(callback) { this.callback = callback; resizeObservers.push(this); } observe(target) { this.target = target; } }
});
for (const file of ["data", "state", "utils", "boundary-detail", "boundary-loader", "csv", "matching", "classification", "render-utils", "map-performance", "export", "ui", "app"]) {
  vm.runInContext(await readFile("src/" + file + ".js", "utf8"), context, { filename: "src/" + file + ".js" });
}
const { state, el } = vm.runInContext("({ state, el })", context);
el.mapSvg = node("svg"); el.mapTooltip = node("div"); el.mapStage = node("div"); el.labelStatus = node("div");
context.syncLayoutControls = () => {};
context.closeWorkspacePanel = () => {};
const square = (x) => [{ x, y: 0 }, { x: x + 10, y: 0 }, { x: x + 10, y: 10 }, { x, y: 10 }];
const features = [0, 20].map((x, index) => ({ code: String(index + 1), name: "Place " + index, level: "province", polygons: [square(x)], polygonGroups: [[square(x)]] }));
const join = { valueByCode: new Map([["1", 10], ["2", 20]]), importedRowByCode: new Map() };
state.boundarySource = "generated"; state.labelMode = "name"; state.showMapLegend = true; state.transparent = false;
let fullRenders = 0;
context.render = () => { fullRenders++; };
context.renderMap(features, join);
context.bindMapNavigation();
const box = () => Array.from(vm.runInContext("mapViewBox", context));
function setBox(value, fitted = value) {
  context.navigationBox = value; context.navigationFittedBox = fitted;
  vm.runInContext("mapFittedViewBox = [...navigationFittedBox]; updateMapViewport([...navigationBox])", context);
}
function near(actual, expected, message) { assert(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), message + ": " + actual + " vs " + expected); }
function pinned() {
  const current = box();
  for (const selector of [".map-background", ".map-viewport-clip"]) {
    const element = el.mapSvg.querySelector(selector);
    ["x", "y", "width", "height"].forEach((key, index) => near(Number(element.getAttribute(key)), current[index], selector + " " + key));
  }
  const initial = Array.from(vm.runInContext("mapLayoutViewBox", context));
  let point = { x: initial[0], y: initial[1] };
  const transform = el.mapSvg.querySelector(".map-layout").getAttribute("transform") || "";
  for (const match of [...transform.matchAll(/(translate|scale)\(([^)]+)\)/g)].reverse()) {
    const values = match[2].trim().split(/[\s,]+/).map(Number);
    point = match[1] === "translate" ? { x: point.x + values[0], y: point.y + (values[1] || 0) }
      : { x: point.x * values[0], y: point.y * (values[1] ?? values[0]) };
  }
  near(point.x, current[0], "layout horizontal anchoring"); near(point.y, current[1], "layout vertical anchoring");
}

function fillsCanvas() { near(box()[2] / box()[3], viewport.width / viewport.height, "the camera must fill the canvas aspect without letterboxing"); }
function containsContent() {
  const content = Array.from(vm.runInContext("mapContentViewBox", context)), camera = box();
  assert(camera[0] <= content[0] + 1e-9 && camera[1] <= content[1] + 1e-9 &&
    camera[0] + camera[2] >= content[0] + content[2] - 1e-9 && camera[1] + camera[3] >= content[1] + content[3] - 1e-9,
  "the fitted camera must contain the complete map content");
}
fillsCanvas(); containsContent();
viewport.width = 400; viewport.height = 400;
context.resizeMapViewport();

setBox([10, 20, 200, 100]);
const geographicNode = el.mapSvg.querySelector(".map-feature");
const mapPoint = context.mapPointFromClient(200, 210);
near(mapPoint.x, 60, "letterboxed client X must use the SVG screen matrix");
near(mapPoint.y, 50, "letterboxed client Y must include the unused vertical margin");
const wheel = emit(el.mapSvg, "wheel", { clientX: 200, clientY: 210, deltaY: -100, deltaMode: 0 });
assert(wheel.defaultPrevented, "wheel navigation must suppress page scrolling");
const anchored = context.mapPointFromClient(200, 210);
near(anchored.x, mapPoint.x, "wheel zoom horizontal anchor"); near(anchored.y, mapPoint.y, "wheel zoom vertical anchor");
pinned();
assert.equal(fullRenders, 0, "zoom must not redraw all map geometry");
assert.equal(el.mapSvg.listeners.get("wheel")[0].options.passive, false);
assert.equal(el.mapSvg.querySelector(".map-feature"), geographicNode);
emit(el.mapSvg, "wheel", { deltaY: -1, deltaMode: 1 });
emit(el.mapSvg, "wheel", { deltaY: -0.25, deltaMode: 2 });
assert.equal(timers.size, 1, "successive wheel events must debounce label refresh");
for (const callback of [...timers.values()]) callback();
assert.equal(timers.size, 0);
assert.equal(el.mapSvg.querySelector(".map-feature"), geographicNode, "label refresh must preserve geometry nodes");
assert.equal(fullRenders, 0);

setBox([0, 0, 0.02, 0.01]);
context.zoomMap(0.5);
near(box()[2], 0.01, "small barangay scopes must zoom below the old 0.05 floor");
context.zoomMap(1e-12);
near(box()[2], 0.02 / 4096, "zoom-in limit must be relative to the fitted scope");
context.zoomMap(1e12);
near(box()[2], 0.02 * 8, "zoom-out limit must be relative to the fitted scope");

setBox([10, 20, 200, 100]);
emit(el.mapSvg, "pointerdown", { pointerId: 7, clientX: 200, clientY: 210 });
emit(el.mapSvg, "pointermove", { pointerId: 8, clientX: 260, clientY: 240 });
assert.deepEqual(box(), [10, 20, 200, 100], "another pointer must not move the active drag");
emit(el.mapSvg, "pointermove", { pointerId: 7, clientX: 250, clientY: 230 });
assert.deepEqual(box(), [-15, 10, 200, 100], "panning must use the inverse matrix captured at pointerdown");
assert(el.mapSvg.hasPointerCapture(7));
assert(el.mapSvg.classList.contains("is-panning"));
pinned();
emit(el.mapSvg, "pointerup", { pointerId: 8 });
assert(el.mapSvg.classList.contains("is-panning"), "another pointer cannot end the active drag");
emit(el.mapSvg, "pointercancel", { pointerId: 7 });
assert(!el.mapSvg.classList.contains("is-panning"));
emit(el.mapSvg, "pointerdown", { pointerId: 9 });
emit(el.mapSvg, "pointerup", { pointerId: 9 });
emit(el.mapSvg, "click", { target: geographicNode });
assert.equal(state.selectedCode, geographicNode.dataset.code, "the tap after a cancelled drag must still select a place");
assert.equal(fullRenders, 1);

for (const ending of ["pointerup", "lostpointercapture", "buttons-zero"]) {
  setBox([10, 20, 200, 100]);
  emit(el.mapSvg, "pointerdown", { pointerId: 10, clientX: 200, clientY: 210 });
  emit(el.mapSvg, "pointermove", { pointerId: 10, clientX: 230, clientY: 225 });
  if (ending === "buttons-zero") emit(el.mapSvg, "pointermove", { pointerId: 10, buttons: 0 });
  else emit(el.mapSvg, ending, { pointerId: 10, clientX: 900, clientY: 900 });
  const endedBox = box();
  emit(el.mapSvg, "pointermove", { pointerId: 10, clientX: 800, clientY: 800, buttons: 0 });
  assert.deepEqual(box(), endedBox, "an ended/outside drag must not continue moving on hover");
  assert(!el.mapSvg.classList.contains("is-panning"));
  emit(el.mapSvg, "pointerdown", { pointerId: 11 });
  emit(el.mapSvg, "pointerup", { pointerId: 11 });
  emit(el.mapSvg, "click", { target: geographicNode });
}
assert.equal(fullRenders, 4, "pointer cleanup must preserve every following tap without full geometry redraws");

emit(el.mapSvg, "pointerdown", { pointerId: 12 });
emit(el.mapSvg, "pointercancel", { pointerId: 12 });
emit(el.mapSvg, "click", { target: geographicNode });
assert.equal(fullRenders, 4, "a cancelled press must suppress a trailing ghost click");

setBox([10, 20, 200, 100]);
emit(el.mapSvg, "pointerdown", { pointerId: 20, clientX: 200, clientY: 210 });
emit(el.mapSvg, "pointermove", { pointerId: 20, clientX: 202, clientY: 211 });
emit(el.mapSvg, "pointerleave", { pointerId: 20 });
assert.deepEqual(box(), [10, 20, 200, 100], "leaving below the drag threshold must preserve the viewport");
emit(el.mapSvg, "pointerdown", { pointerId: 21, clientX: 200, clientY: 210 });
emit(el.mapSvg, "pointermove", { pointerId: 21, clientX: 230, clientY: 225 });
assert.deepEqual(box(), [-5, 12.5, 200, 100], "leaving before capture must allow a new pointer to start a drag");
emit(el.mapSvg, "pointerup", { pointerId: 21 });
emit(el.mapSvg, "click", { target: geographicNode });
assert.equal(fullRenders, 4, "the completed replacement drag must suppress its click");
emit(el.mapSvg, "pointerdown", { pointerId: 22 });
emit(el.mapSvg, "pointerup", { pointerId: 22 });
emit(el.mapSvg, "click", { target: geographicNode });
assert.equal(fullRenders, 5, "the next tap after leaving and replacing a pointer must select normally");
assert.equal(el.mapSvg.querySelector(".map-feature"), geographicNode);

viewport.width = 900; viewport.height = 500;
vm.runInContext("mapViewBox = null", context);
context.renderMap(features, join);
const resizedGeography = el.mapSvg.querySelector(".map-feature"), layout = el.mapSvg.querySelector(".map-layout");
const wideFit = box(), untouchedLayout = layout.firstChild;
for (const [width, height] of [[900, 500], [0, 500], [900, 0]]) {
  viewport.width = width; viewport.height = height;
  context.resizeMapViewport();
  assert.deepEqual(box(), wideFit, "unchanged or hidden canvas dimensions must leave the camera unchanged");
  assert.equal(layout.firstChild, untouchedLayout, "ignored resize must not rebuild the layout");
  assert.equal(vm.runInContext("[mapCanvasSize.width, mapCanvasSize.height]", context).join(","), "900,500");
}
assert.equal(resizeObservers.length, 1);
assert.equal(resizeObservers[0].target, el.mapSvg);
function resizeTo(width, height) {
  viewport.width = width; viewport.height = height;
  resizeObservers[0].callback(); resizeObservers[0].callback();
  assert.equal(animationFrames.size, 1, "resize observations must coalesce into one animation frame");
  for (const [id, callback] of [...animationFrames]) { animationFrames.delete(id); callback(); }
  fillsCanvas(); pinned();
  assert.equal(el.mapSvg.querySelector(".map-feature"), resizedGeography, "canvas resizing must preserve geography nodes");
  assert.equal(layout.getAttribute("transform"), null, "resized layout must be rebuilt rather than stretched");
  const legend = layout.querySelector(".map-export-legend");
  near(Number(legend.getAttribute("font-size")), 12 * box()[2] / viewport.width * state.legendScale, "legend size must remain readable in CSS pixels after resizing");
}
resizeTo(360, 720);
containsContent();
assert.deepEqual(box(), Array.from(vm.runInContext("mapFittedViewBox", context)), "an untouched fitted map must refit the new canvas");
assert.notEqual(layout.firstChild, untouchedLayout, "a valid resize must rebuild layout content");
resizeTo(900, 500);
box().forEach((value, index) => near(value, wideFit[index], "fitted wide/narrow/wide camera must not drift"));

context.zoomMap(0.4);
const zoomed = box();
context.navigationBox = [zoomed[0] + 3, zoomed[1] - 2, zoomed[2], zoomed[3]];
vm.runInContext("updateMapViewport(navigationBox)", context);
const originalCamera = box(), center = [originalCamera[0] + originalCamera[2] / 2, originalCamera[1] + originalCamera[3] / 2];
const unitsPerPixel = originalCamera[2] / viewport.width;
for (const dimensions of [[360, 720], [1200, 450], [900, 500]]) {
  resizeTo(...dimensions);
  const current = box();
  near(current[0] + current[2] / 2, center[0], "resizing a zoomed map must preserve its horizontal world center");
  near(current[1] + current[3] / 2, center[1], "resizing a zoomed map must preserve its vertical world center");
  near(current[2] / viewport.width, unitsPerPixel, "resizing must preserve horizontal world units per CSS pixel");
  near(current[3] / viewport.height, unitsPerPixel, "resizing must preserve vertical world units per CSS pixel");
}
box().forEach((value, index) => near(value, originalCamera[index], "zoomed wide/narrow/wide camera must not drift"));
emit(el.mapSvg, "pointerdown", { pointerId: 30, clientX: 200, clientY: 210 });
emit(el.mapSvg, "pointermove", { pointerId: 30, clientX: 230, clientY: 225 });
assert(el.mapSvg.classList.contains("is-panning"));
resizeTo(1000, 600);
assert(!el.mapSvg.classList.contains("is-panning"), "resize must cancel an active drag");
const cancelledBox = box();
emit(el.mapSvg, "pointermove", { pointerId: 30, clientX: 400, clientY: 300 });
assert.deepEqual(box(), cancelledBox, "a cancelled drag must not reuse its stale screen transform");
emit(el.mapSvg, "pointerup", { pointerId: 30 });
emit(el.mapSvg, "click", { target: resizedGeography });
assert.equal(fullRenders, 5, "resize cancellation must suppress the old drag click");
emit(el.mapSvg, "pointerdown", { pointerId: 31 });
emit(el.mapSvg, "pointerup", { pointerId: 31 });
emit(el.mapSvg, "click", { target: resizedGeography });
assert.equal(fullRenders, 6, "the next tap must work after a resize cancels the drag");

const tinyPannedCamera = Array.from(vm.runInContext(`(() => {
  const previous = { mapViewBox, mapFittedViewBox, mapCanvasSize };
  try {
    mapFittedViewBox = [1000, 1000, 0.001, 0.001];
    mapViewBox = [1000.00005, 1000, 0.001, 0.001];
    mapCanvasSize = { width: 1000, height: 1000 };
    return mapBoxForCanvas(fitExportViewBox(mapFittedViewBox, 500, 1000), { width: 500, height: 1000 });
  } finally {
    mapViewBox = previous.mapViewBox;
    mapFittedViewBox = previous.mapFittedViewBox;
    mapCanvasSize = previous.mapCanvasSize;
  }
})()`, context));
[1000.0003, 1000, 0.0005, 0.001].forEach((expected, index) => {
  assert(Math.abs(tinyPannedCamera[index] - expected) < 1e-10, "a tiny scope at a large origin must preserve its 50-pixel pan during resize");
});
near(tinyPannedCamera[2] / 500, 1e-6, "tiny scope resize must preserve world units per pixel");

const beforeTooltipState = { statisticLabel: state.statisticLabel, valueColumn: state.valueColumn, labelColumn: state.labelColumn };
const beforeTooltipViewport = { ...viewport };
const previousStageRect = el.mapStage.getBoundingClientRect, previousTooltipRect = el.mapTooltip.getBoundingClientRect;
try {
  Object.assign(state, { statisticLabel: "Value", valueColumn: "value", labelColumn: "label" });
  const desiredTooltip = { width: 320, height: 420 };
  el.mapStage.getBoundingClientRect = () => ({ left: viewport.left - 20, top: viewport.top - 40 });
  el.mapTooltip.getBoundingClientRect = () => {
    assert(Number.isFinite(parseFloat(el.mapTooltip.style.maxHeight)), "tooltip height must be constrained before measuring");
    return { width: Math.min(desiredTooltip.width, viewport.width - 16), height: Math.min(desiredTooltip.height, parseFloat(el.mapTooltip.style.maxHeight)) };
  };
  function tooltipInsideCanvas() {
    const stage = el.mapStage.getBoundingClientRect(), canvas = el.mapSvg.getBoundingClientRect(), tooltip = el.mapTooltip.getBoundingClientRect();
    const left = stage.left + parseFloat(el.mapTooltip.style.left), top = stage.top + parseFloat(el.mapTooltip.style.top);
    assert(left >= canvas.left + 8 && top >= canvas.top + 8, "tooltip must respect the SVG canvas's upper and left edges inside its larger stage");
    assert(left + tooltip.width <= canvas.right - 8 && top + tooltip.height <= canvas.bottom - 8,
      "tooltip must remain inside the SVG canvas's lower and right edges");
  }
  join.importedRowByCode.set(features[0].code, { value: "10", label: "Hover CSV annotation" });
  emit(el.mapSvg, "pointermove", { target: resizedGeography, clientX: viewport.left + viewport.width - 1, clientY: viewport.top + viewport.height - 1 });
  assert.equal(el.mapTooltip.hidden, false);
  assert(el.mapTooltip.innerHTML.includes(context.placeDetailsMarkup(features[0], 10, join)), "actual pointer hover must use the rendered join's shared place details");
  assert.match(el.mapTooltip.innerHTML, /CSV column: value/); assert.match(el.mapTooltip.innerHTML, /Hover CSV annotation/);
  tooltipInsideCanvas();
  assert(el.mapStage.getBoundingClientRect().left + parseFloat(el.mapTooltip.style.left) + desiredTooltip.width < viewport.left + viewport.width - 1,
    "right-edge tooltip must flip to the left of the pointer");
  context.showTooltip({ clientX: viewport.left - 100, clientY: viewport.top - 100 }, features[0], 0, join);
  tooltipInsideCanvas();
  assert.match(el.mapTooltip.innerHTML, /<strong>0<\/strong>/);
  viewport.width = 240; viewport.height = 180; desiredTooltip.height = 2000;
  context.showTooltip({ clientX: viewport.left + 239, clientY: viewport.top + 179 }, features[0], 10, join);
  tooltipInsideCanvas();
  assert.equal(el.mapTooltip.style.maxHeight, "164px", "long details must be height-limited on a short canvas");
  emit(el.mapSvg, "pointerleave", { pointerId: 40 });
  assert.equal(el.mapTooltip.hidden, true);
  context.showTooltip({ clientX: viewport.left + 100, clientY: viewport.top + 80 }, features[0], 10, join);
  context.renderMap(features, join);
  assert.equal(el.mapTooltip.hidden, true, "redrawing a map must hide stale details from the previous render");
} finally {
  Object.assign(state, beforeTooltipState); Object.assign(viewport, beforeTooltipViewport);
  el.mapStage.getBoundingClientRect = previousStageRect; el.mapTooltip.getBoundingClientRect = previousTooltipRect;
  join.importedRowByCode.delete(features[0].code);
}

const layoutEditor = vm.runInContext("layoutEditor", context);
const item = (id) => el.mapSvg.querySelector(`[data-layout-item="${id}"]`);
const position = (id) => ({ x: Number(item(id).getAttribute("data-layout-x")), y: Number(item(id).getAttribute("data-layout-y")) });
const savedPositions = () => JSON.parse(JSON.stringify(state.layoutPositions));
function itemInsideCanvas(id) {
  context.measuredLayoutItem = item(id);
  const metrics = vm.runInContext("layoutItemMetrics.get(measuredLayoutItem)", context), actual = position(id);
  assert(actual.x >= 0 && actual.y >= 0 && actual.x + metrics.width / metrics.viewBox[2] <= 1 + 1e-9 && actual.y + metrics.height / metrics.viewBox[3] <= 1 + 1e-9,
    id + " must be clamped by its complete content dimensions inside the canvas");
}
context.setLayoutEditMode(true);
assert(layoutEditor.enabled && el.mapSvg.classList.contains("is-arranging"));
assert(el.mapSvg.querySelectorAll("[data-editor-only]").length > 0, "edit mode must draw visible item boundaries");
assert.equal(item("legend").getAttribute("tabindex"), "0", "layout controls must be keyboard focusable");
assert.equal(document.activeElement, item("legend"), "entering arrangement must focus the selected layout control");
const beforeInvalidMove = savedPositions();
for (const invalid of [null, { x: NaN, y: 0.5 }, { x: 0.5, y: Infinity }]) context.moveLayoutItem("legend", invalid);
assert.deepEqual(savedPositions(), beforeInvalidMove, "invalid editor coordinates must not alter a project");
context.moveLayoutItem("legend", { x: -100, y: 100 });
itemInsideCanvas("legend");
assert(position("legend").x < 0.1 && position("legend").y > 0.1, "large drags must reach the requested edge without losing the item");
for (const preset of ["top-left", "top-right", "bottom-left", "bottom-right", "center"]) {
  context.setLayoutPreset("legend", preset);
  itemInsideCanvas("legend");
}
context.moveLayoutItem("legend", { x: 0.08, y: 0.15 });
const movedLegend = savedPositions(), beforeLayoutZoom = position("legend");
context.zoomMap(0.8);
assert.deepEqual(savedPositions(), movedLegend, "zoom must not rewrite normalized placements");
near(position("legend").x, beforeLayoutZoom.x, "legend horizontal placement must remain relative to the canvas on zoom");
near(position("legend").y, beforeLayoutZoom.y, "legend vertical placement must remain relative to the canvas on zoom");
for (const dimensions of [[360, 720], [900, 500]]) {
  viewport.width = dimensions[0]; viewport.height = dimensions[1]; context.resizeMapViewport();
  assert.deepEqual(savedPositions(), movedLegend, "responsive clamping must not overwrite the user's saved placement");
  near(position("legend").x, movedLegend.legend.x, "legend must retain its horizontal normalized placement after resizing");
  near(position("legend").y, movedLegend.legend.y, "legend must retain its vertical normalized placement after resizing");
  itemInsideCanvas("legend");
}
const cameraBeforeArrangement = box(), selectionBeforeArrangement = state.selectedCode, rendersBeforeArrangement = fullRenders;
for (const [index, id] of ["legend", "title", "subtitle", "source"].entries()) {
  assert(item(id), id + " must expose an independent layout item");
  context.moveLayoutItem(id, { x: 0.025, y: 0.2 });
  const control = item(id), original = position(id), pointerId = 50 + index;
  emit(el.mapSvg, "pointerdown", { target: control.firstChild, pointerId, clientX: 300, clientY: 250 });
  assert.equal(layoutEditor.selected, id, "pressing a layout object must select that object");
  assert.equal(document.activeElement, control, "pressing a layout object must preserve a keyboard target");
  emit(el.mapSvg, "pointermove", { pointerId: pointerId + 100, clientX: 800, clientY: 400 });
  assert.deepEqual(position(id), original, "a second pointer must not move the selected layout object");
  emit(el.mapSvg, "pointermove", { pointerId, clientX: 318, clientY: 265 });
  near(position(id).x, original.x + 18 / viewport.width, id + " drag must use horizontal CSS canvas units");
  near(position(id).y, original.y + 15 / viewport.height, id + " drag must use vertical CSS canvas units");
  assert.equal(document.activeElement, control, "dragging must retain focus on the same layout object");
  assert(el.mapSvg.hasPointerCapture(pointerId), "layout drags must capture their pointer");
  assert(!el.mapSvg.classList.contains("is-panning"), "moving a layout object must not activate map panning");
  emit(el.mapSvg, "pointerup", { pointerId });
  assert(!el.mapSvg.hasPointerCapture(pointerId), "finishing a layout drag must release capture");
  emit(el.mapSvg, "click", { target: control });
  const beforeKeys = position(id);
  const arrow = emit(el.mapSvg, "keydown", { target: control, key: "ArrowDown" });
  assert(arrow.defaultPrevented, "layout arrow keys must suppress page scrolling");
  near(position(id).y, beforeKeys.y + 0.01, "an arrow key must move the chosen object by one percent");
  emit(el.mapSvg, "keydown", { target: control, key: "ArrowDown", shiftKey: true });
  near(position(id).y, beforeKeys.y + 0.06, "Shift+arrow must add a five percent step");
  itemInsideCanvas(id);
}
assert.deepEqual(box(), cameraBeforeArrangement, "dragging or nudging layout objects must never move the map camera");
assert.equal(state.selectedCode, selectionBeforeArrangement, "layout editing must not change the selected place");
assert.equal(fullRenders, rendersBeforeArrangement, "layout editing must retain all geographic geometry nodes");
emit(el.mapSvg, "click", { target: item("title") });
assert.equal(layoutEditor.selected, "title", "a simple click must select the layout item for editing");
emit(el.mapSvg, "pointerdown", { target: resizedGeography, pointerId: 59, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointermove", { target: resizedGeography, pointerId: 59, clientX: 400, clientY: 300 });
emit(el.mapSvg, "pointerup", { pointerId: 59 });
emit(el.mapSvg, "click", { target: resizedGeography });
assert.deepEqual(box(), cameraBeforeArrangement, "the map itself must stay still while arranging layout objects");
assert.equal(state.selectedCode, selectionBeforeArrangement, "clicking through arrangement mode must not open a place editor");

for (const [index, ending] of ["pointercancel", "lostpointercapture", "buttons-zero"].entries()) {
  context.moveLayoutItem("legend", { x: 0.1, y: 0.15 });
  const original = savedPositions(), pointerId = 60 + index;
  emit(el.mapSvg, "pointerdown", { target: item("legend"), pointerId, clientX: 300, clientY: 250 });
  emit(el.mapSvg, "pointermove", { pointerId, clientX: 340, clientY: 280 });
  const dragged = savedPositions();
  assert.notDeepEqual(dragged, original, "a real layout drag must change placement before it ends");
  if (ending === "buttons-zero") emit(el.mapSvg, "pointermove", { pointerId, buttons: 0 });
  else emit(el.mapSvg, ending, { pointerId });
  assert(!el.mapSvg.hasPointerCapture(pointerId), "every layout pointer ending must clear capture");
  assert.deepEqual(savedPositions(), ending === "pointercancel" ? original : dragged,
    "pointer cancellation must roll back; completed or lost-button drags must retain their final placement");
  assert.equal(document.activeElement, item("legend"), "pointer cleanup must preserve focus on the current layout item, including any rebuilt node");
  const ended = savedPositions();
  emit(el.mapSvg, "pointermove", { pointerId, clientX: 700, clientY: 400 });
  assert.deepEqual(savedPositions(), ended, "ended layout drags must not move on later pointer hover");
}
delete state.layoutPositions.legend;
context.renderNavigationLayout();
emit(el.mapSvg, "pointerdown", { target: item("legend"), pointerId: 63, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointermove", { pointerId: 63, clientX: 340, clientY: 280 });
emit(el.mapSvg, "pointercancel", { pointerId: 63 });
assert(!Object.hasOwn(state.layoutPositions, "legend"), "cancelling the first drag must restore automatic placement rather than create a saved position");

context.moveLayoutItem("legend", { x: 0.08, y: 0.15 });
const beforeResizeCancel = savedPositions();
emit(el.mapSvg, "pointerdown", { target: item("legend"), pointerId: 64, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointermove", { pointerId: 64, clientX: 340, clientY: 280 });
viewport.width = 1000; viewport.height = 600; context.resizeMapViewport();
assert.deepEqual(savedPositions(), beforeResizeCancel, "a responsive resize must roll back an unfinished layout drag");
assert.equal(document.activeElement, item("legend"), "responsive layout rebuilding must restore the focused editing object");
emit(el.mapSvg, "pointermove", { pointerId: 64, clientX: 700, clientY: 400 });
assert.deepEqual(savedPositions(), beforeResizeCancel, "resizing must discard the previous drag's CSS coordinate basis");

emit(el.mapSvg, "pointerdown", { target: item("legend"), pointerId: 65, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointermove", { pointerId: 65, clientX: 340, clientY: 280 });
const escape = emit(el.mapSvg, "keydown", { target: item("legend"), key: "Escape" });
assert(escape.defaultPrevented && escape.propagationStopped, "Escape must close layout editing without also opening another keyboard action");
assert(!layoutEditor.enabled);
assert.deepEqual(savedPositions(), beforeResizeCancel, "leaving arrangement must roll back an unfinished drag");
emit(el.mapSvg, "pointermove", { pointerId: 65, clientX: 700, clientY: 400 });
assert.deepEqual(savedPositions(), beforeResizeCancel);
context.setLayoutEditMode(true);
context.moveLayoutItem("legend", { x: 0.08, y: 0.15 });
const beforeRenderCancel = savedPositions();
emit(el.mapSvg, "pointerdown", { target: item("legend"), pointerId: 66, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointermove", { pointerId: 66, clientX: 340, clientY: 280 });
context.renderMap(features, join);
assert.deepEqual(savedPositions(), beforeRenderCancel, "redrawing geography must cancel and roll back a layout drag before replacing its nodes");
emit(el.mapSvg, "pointermove", { pointerId: 66, clientX: 700, clientY: 400 });
assert.deepEqual(savedPositions(), beforeRenderCancel, "a map redraw must leave no stale layout pointer gesture");
assert(layoutEditor.enabled, "ordinary map redraws must preserve the user's explicit arrangement mode");
assert.equal(document.activeElement, item("legend"), "a full redraw must restore layout keyboard focus on the new SVG node");

const measuredItem = node("g"), measuredTarget = node("g"), fittedCamera = box();
measuredItem.getBBox = () => ({ x: -12, y: -8, width: fittedCamera[2] * 4, height: fittedCamera[3] * 4 });
context.measuredItem = measuredItem; context.measuredTarget = measuredTarget; context.testCamera = fittedCamera;
vm.runInContext('addLayoutItem("source", measuredItem, testCamera, measuredTarget, { width: 1, height: 1 }, { x: 0.9, y: 0.9 })', context);
const measuredMetrics = vm.runInContext("layoutItemMetrics.get(measuredItem)", context);
assert(measuredMetrics.fit < 1 && measuredMetrics.width < fittedCamera[2] && measuredMetrics.height < fittedCamera[3],
  "native measured oversized content must scale down to fit both canvas dimensions");
assert.match(measuredItem.getAttribute("transform"), /translate\(12 8\)/, "negative native text bounds must be offset before applying the user's position");

context.resetLayoutPositions();
assert.deepEqual(savedPositions(), {}, "resetting arrangement must remove custom positions");
assert.equal(document.activeElement, item("legend"), "resetting positions must retain the user's keyboard editing target");
context.setLayoutEditMode(false);
assert(!layoutEditor.enabled && !el.mapSvg.classList.contains("is-arranging"));
assert.equal(el.mapSvg.querySelectorAll("[data-editor-only]").length, 0, "leaving edit mode must remove every editor decoration");
assert.equal(item("legend").getAttribute("tabindex"), null, "normal viewing must not expose editing handles to keyboard navigation");

const nativeGestureFeature = el.mapSvg.querySelector(".map-feature");
const mapPress = emit(el.mapSvg, "pointerdown", { target: nativeGestureFeature.firstChild, pointerId: 70 });
assert(mapPress.defaultPrevented, "pressing the map must cancel native text selection, image dragging, and mouse focus outlines before a pan starts");
assert(emit(el.mapSvg, "dragstart", { target: nativeGestureFeature.firstChild }).defaultPrevented,
  "a browser-native drag must never produce a drag image over the map");
emit(el.mapSvg, "pointercancel", { pointerId: 70 });
const alternatePress = emit(el.mapSvg, "pointerdown", { target: nativeGestureFeature, pointerId: 71, button: 2 });
assert(!alternatePress.defaultPrevented, "the map must leave non-primary mouse actions alone");

context.setLayoutEditMode(true);
const nativeLayoutControl = item("legend");
const layoutPress = emit(el.mapSvg, "pointerdown", { target: nativeLayoutControl.firstChild, pointerId: 72 });
assert(layoutPress.defaultPrevented, "arranging a layout object must cancel native browser dragging and mouse focus outlines");
assert.equal(document.activeElement, nativeLayoutControl, "cancelled pointer defaults must still leave an explicit keyboard editing target");
assert(emit(el.mapSvg, "dragstart", { target: nativeLayoutControl }).defaultPrevented);
emit(el.mapSvg, "pointerup", { pointerId: 72 });
context.setLayoutEditMode(false);
for (const key of ["Enter", " "]) {
  state.selectedCode = null;
  const beforeKeyboardRender = fullRenders;
  const keyboardSelection = emit(el.mapSvg, "keydown", { target: nativeGestureFeature, key });
  assert(keyboardSelection.defaultPrevented, "keyboard activation must prevent page scrolling");
  assert.equal(state.selectedCode, nativeGestureFeature.dataset.code, "native pointer suppression must preserve keyboard place activation");
  assert.equal(fullRenders, beforeKeyboardRender + 1, "keyboard activation must still open the selected place");
}

const beforeEmptyLayout = { showMapLegend: state.showMapLegend, showLayoutText: state.showLayoutText,
  layoutTitle: state.layoutTitle, layoutSubtitle: state.layoutSubtitle, sourceNote: state.sourceNote };
try {
  state.showMapLegend = false;
  layoutEditor.selected = "legend";
  context.setLayoutEditMode(true);
  assert(layoutEditor.enabled, "hiding the legend must still allow visible text to be arranged");
  assert.equal(layoutEditor.selected, "title", "an unavailable selected legend must fall back to the first visible layout object");
  assert.equal(document.activeElement, item("title"), "the fallback title must receive keyboard focus immediately");
  assert(item("title").classList.contains("is-layout-selected"), "fallback editing selection must match the highlighted object");
  context.setLayoutEditMode(false);
  state.showLayoutText = false;
  context.setLayoutEditMode(true);
  assert.equal(el.mapSvg.querySelectorAll("[data-layout-item]").length, 0);
  assert(!layoutEditor.enabled && !el.mapSvg.classList.contains("is-arranging"),
    "arrangement must stay off when every layout object is hidden, so normal map navigation cannot become stuck");

  state.showLayoutText = true;
  state.layoutTitle = ""; state.layoutSubtitle = ""; state.sourceNote = "";
  context.setLayoutEditMode(true);
  assert(!layoutEditor.enabled, "visible-text settings with empty text must also leave arrangement disabled");

  state.showMapLegend = true;
  layoutEditor.selected = "title";
  context.setLayoutEditMode(true);
  assert(layoutEditor.enabled && layoutEditor.selected === "legend", "an unavailable selected title must fall back to a visible legend");
  assert.equal(document.activeElement, item("legend"), "the fallback legend must receive keyboard focus");
} finally {
  context.setLayoutEditMode(false);
  Object.assign(state, beforeEmptyLayout);
  context.renderNavigationLayout();
}

setBox([0, 0, 200, 100]);
const pinchTarget = el.mapSvg.querySelector(".map-feature"), touchCenter = { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
const pinchAnchor = context.mapPointFromClient(touchCenter.x, touchCenter.y), rendersBeforePinch = fullRenders;
state.selectedCode = null;
emit(el.mapSvg, "pointerdown", { target: pinchTarget, pointerType: "touch", pointerId: 100, clientX: touchCenter.x - 40, clientY: touchCenter.y });
emit(el.mapSvg, "pointerdown", { pointerType: "touch", pointerId: 101, isPrimary: false, clientX: touchCenter.x + 40, clientY: touchCenter.y });
assert(el.mapSvg.hasPointerCapture(100) && el.mapSvg.hasPointerCapture(101), "pinching must capture both touch pointers");
emit(el.mapSvg, "lostpointercapture", { target: pinchTarget, pointerId: 100 });
assert(el.mapSvg.hasPointerCapture(100), "transferring native implicit capture from a feature to the SVG must not cancel the pinch");
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 100, clientX: touchCenter.x - 80, clientY: touchCenter.y });
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 101, isPrimary: false, clientX: touchCenter.x + 80, clientY: touchCenter.y });
near(box()[2], 100, "doubling two-finger distance must halve the map width");
near(context.mapPointFromClient(touchCenter.x, touchCenter.y).x, pinchAnchor.x, "pinch zoom must preserve its midpoint horizontal anchor");
near(context.mapPointFromClient(touchCenter.x, touchCenter.y).y, pinchAnchor.y, "pinch zoom must preserve its midpoint vertical anchor");
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 100, clientX: touchCenter.x - 60, clientY: touchCenter.y + 10 });
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 101, isPrimary: false, clientX: touchCenter.x + 100, clientY: touchCenter.y + 10 });
near(box()[2], 100, "moving both fingers together must pan without changing zoom");
near(context.mapPointFromClient(touchCenter.x + 20, touchCenter.y + 10).x, pinchAnchor.x, "the geographic pinch anchor must follow a moving midpoint");
near(context.mapPointFromClient(touchCenter.x + 20, touchCenter.y + 10).y, pinchAnchor.y, "midpoint movement must preserve vertical anchoring");
const beforeThirdTouch = box();
emit(el.mapSvg, "pointerdown", { pointerType: "touch", pointerId: 102, isPrimary: false });
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 102, isPrimary: false, clientX: 900, clientY: 900 });
assert.deepEqual(box(), beforeThirdTouch, "an extra touch must not replace either active pinch pointer");
emit(el.mapSvg, "pointerup", { pointerType: "touch", pointerId: 101, isPrimary: false });
const beforeRemainingPan = box();
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 100, clientX: touchCenter.x - 45, clientY: touchCenter.y + 15 });
assert.notDeepEqual(box(), beforeRemainingPan, "lifting one pinch finger must allow the remaining finger to continue panning");
emit(el.mapSvg, "pointerup", { pointerType: "touch", pointerId: 100 });
assert(!el.mapSvg.hasPointerCapture(100) && !el.mapSvg.hasPointerCapture(101), "finishing the pinch must release both captures");
emit(el.mapSvg, "click", { target: pinchTarget });
assert.equal(fullRenders, rendersBeforePinch, "pinch frames must use the viewport update path and must not accidentally select a place");

for (const ending of ["pointercancel", "lostpointercapture"]) {
  emit(el.mapSvg, "pointerdown", { pointerType: "touch", pointerId: 110, clientX: touchCenter.x - 40, clientY: touchCenter.y });
  emit(el.mapSvg, "pointerdown", { pointerType: "touch", pointerId: 111, isPrimary: false, clientX: touchCenter.x + 40, clientY: touchCenter.y });
  emit(el.mapSvg, ending, { pointerId: 110 });
  const cancelledPinch = box();
  emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 111, clientX: 800, clientY: 800 });
  assert.deepEqual(box(), cancelledPinch, "a cancelled pinch must discard every old touch position");
  assert(!el.mapSvg.hasPointerCapture(110) && !el.mapSvg.hasPointerCapture(111), "pinch cancellation must release every capture");
  assert(!el.mapSvg.classList.contains("is-panning"));
  emit(el.mapSvg, "click", { target: pinchTarget });
  assert.equal(fullRenders, rendersBeforePinch, "a cancelled pinch must not select a place");
}
emit(el.mapSvg, "pointerdown", { target: pinchTarget, pointerType: "touch", pointerId: 112 });
emit(el.mapSvg, "pointerup", { pointerType: "touch", pointerId: 112 });
emit(el.mapSvg, "click", { target: pinchTarget });
assert.equal(fullRenders, rendersBeforePinch + 1, "a new single-finger tap must still select normally after pinch cancellation");

context.setLayoutEditMode(true);
const beforeTouchArrange = box(), touchLayoutItem = item("legend");
emit(el.mapSvg, "pointerdown", { target: touchLayoutItem, pointerType: "touch", pointerId: 120, clientX: 300, clientY: 250 });
emit(el.mapSvg, "pointerdown", { pointerType: "touch", pointerId: 121, isPrimary: false, clientX: 500, clientY: 250 });
emit(el.mapSvg, "pointermove", { pointerType: "touch", pointerId: 120, clientX: 320, clientY: 260 });
assert.deepEqual(box(), beforeTouchArrange, "two fingers in Arrange mode must not zoom or pan the map");
emit(el.mapSvg, "pointercancel", { pointerId: 120 });
assert(!el.mapSvg.hasPointerCapture(120) && !el.mapSvg.hasPointerCapture(121));
context.setLayoutEditMode(false);
console.log("Map navigation passed: anchored mouse/touch zoom, pinch cancellation and single-touch continuation, resize, layout arrangement, tooltips and keyboard activation");

const largeFeatures = Array.from({ length: 4200 }, (_, index) => {
  const x = index % 70 * 12, y = Math.floor(index / 70) * 12;
  const outer = [{ x, y }, { x: x + 8, y }, { x: x + 8, y: y + 8 }, { x, y: y + 8 }];
  const hole = [{ x: x + 2, y: y + 2 }, { x: x + 6, y: y + 2 }, { x: x + 6, y: y + 6 }, { x: x + 2, y: y + 6 }];
  const rings = index === 0 ? [outer, hole] : [outer];
  return { code: "N" + index, name: "National place " + index, level: "barangay", polygonGroups: [rings], polygons: rings };
});
const largeJoin = { valueByCode: new Map(largeFeatures.filter((_, index) => index % 11).map((feature) => [feature.code, Number(feature.code.slice(1)) % 3 * 10])), importedRowByCode: new Map() };
Object.assign(state, { scopeId: "PH", level: "barangay", boundarySource: "generated", labelMode: "none", classification: "equal", bins: 3,
  palette: "density", customColors: [], reverseColors: false, selectedCode: null, showMapLegend: true, showLayoutText: true, transparent: false });
context.renderMap(largeFeatures, largeJoin);
const batches = () => el.mapSvg.querySelectorAll(".map-batch");
const batchCount = (target = el.mapSvg) => target.querySelectorAll(".map-batch").reduce((sum, path) => sum + Number(path.dataset.featureCount), 0);
const fullBatchColors = new Set(largeFeatures.map((feature) => context.getFeatureFill(feature, largeJoin.valueByCode.get(feature.code), vm.runInContext("renderedScale", context))));
assert.equal(el.mapSvg.querySelectorAll(".map-feature").length, 0, "large maps must avoid a separate SVG group for every place");
assert.equal(batches().length, fullBatchColors.size, "national geometry must batch by the existing classified fill colors");
assert.equal(batchCount(), largeFeatures.length, "the country overview must retain every geometry record inside its color batches");
for (const path of batches()) {
  assert.equal(path.getAttribute("fill-rule"), "nonzero", "batched fill winding must preserve holes and same-color overlaps");
  assert.equal(path.getAttribute("stroke-linejoin"), "round");
  assert.equal(path.getAttribute("vector-effect"), "non-scaling-stroke");
}
context.serializeMapSvg();
assert.equal(batchCount(serializedTree), largeFeatures.length, "SVG export must retain every overview geometry record");
assert.deepEqual(serializedTree.querySelectorAll(".map-batch").map((path) => [path.getAttribute("d"), path.getAttribute("fill"), path.getAttribute("fill-rule")]),
  batches().map((path) => [path.getAttribute("d"), path.getAttribute("fill"), path.getAttribute("fill-rule")]), "export must preserve the batched paths, statistical colors, and nonzero winding");
const legendText = () => el.mapSvg.querySelector('[data-layout-item="legend"]').querySelectorAll("text").map((text) => text.textContent);
const countryLegend = legendText();
const clientAt = (x, y) => { const point = new Point(x, y).matrixTransform(el.mapSvg.getScreenCTM()); return { clientX: point.x, clientY: point.y }; };
const batchEventAt = (x, y) => ({ target: batches()[0], ...clientAt(x, y) });
assert.equal(context.mapFeatureFromEvent(batchEventAt(4, 4)) ?? null, null, "a hole must remain an empty area when hit testing color batches");
assert.equal(context.mapFeatureFromEvent(batchEventAt(1, 1)), largeFeatures[0], "the same polygon's solid outer area must remain selectable");
assert.equal(context.mapFeatureFromEvent(batchEventAt(10, 10)) ?? null, null, "blank space between polygons must not select a neighbouring record");
const nationalTarget = largeFeatures[71], nationalEvent = batchEventAt(16, 16);
assert.equal(context.mapFeatureFromEvent(nationalEvent), nationalTarget, "a color batch must resolve the exact place through the geographic hit index");
emit(el.mapSvg, "pointermove", { ...nationalEvent, buttons: 0 });
assert.equal(el.mapTooltip.hidden, false, "batched geometry must still show hover details");
assert.match(el.mapTooltip.innerHTML, /National place 71/);
assert.match(el.mapTooltip.innerHTML, /20/);
const rendersBeforeNationalTap = fullRenders;
emit(el.mapSvg, "pointerdown", { ...nationalEvent, pointerId: 80 });
emit(el.mapSvg, "pointerup", { ...nationalEvent, pointerId: 80 });
emit(el.mapSvg, "click", nationalEvent);
assert.equal(state.selectedCode, nationalTarget.code, "a click on a shared batch path must select the place under the pointer");
assert.equal(fullRenders, rendersBeforeNationalTap + 1);
context.renderMap(largeFeatures, largeJoin);
const largeScale = vm.runInContext("renderedScale", context);
const selectedNational = el.mapSvg.querySelector(".is-selected");
assert.equal(selectedNational?.dataset.code, nationalTarget.code, "a selected national place must retain its individual editing overlay");
assert.equal(selectedNational.getAttribute("tabindex"), "0", "the selected overlay must stay keyboard reachable");
assert.equal(batchCount() + el.mapSvg.querySelectorAll(".map-feature").length, largeFeatures.length, "the selected overlay must replace its batch record without losing or duplicating geometry");

context.updateMapViewport([120, 120, 24, 14.4]);
const firstZoomPaths = batches().map((path) => path.getAttribute("d")).join(" ");
assert(batchCount() > 0 && batchCount() < 100, "zooming into a few barangays must cull distant national geometry");
const firstOverscanPaths = batches();
context.updateMapViewport([121, 121, 24, 14.4]);
assert.deepEqual(batches(), firstOverscanPaths, "small pans within the overscan area must retain the batch DOM nodes");
context.updateMapViewport([601, 601, 24, 14.4]);
assert(batchCount() > 0 && batchCount() < 100, "panning to a distant area must keep the rendered geometry bounded");
assert.notEqual(batches().map((path) => path.getAttribute("d")).join(" "), firstZoomPaths, "panning beyond the overscan area must load the newly visible geometry");
assert.equal(context.mapFeatureFromEvent(batchEventAt(604, 604)), largeFeatures[3550], "spatial selection must follow the new camera after panning");
assert.equal(context.mapFeatureFromEvent({ target: batches()[0], clientX: viewport.left - 1, clientY: viewport.top + 1 }) ?? null, null,
  "points outside the actual SVG canvas must never resolve an offscreen polygon");
assert.equal(vm.runInContext("renderedScale", context), largeScale, "viewport culling must retain the country classification scale");
assert.deepEqual(legendText(), countryLegend, "zooming and culling must not recalculate the legend from only visible values");
for (const path of batches()) assert(fullBatchColors.has(path.getAttribute("fill")), "culled batches must keep the country map's statistical colors");
context.serializeMapSvg();
assert.equal(batchCount(serializedTree), batchCount(), "zoomed export must preserve the currently previewed geometry batches");
assert(serializedTree.querySelectorAll(".map-batch").every((path) => path.getAttribute("fill-rule") === "nonzero"), "zoomed export must retain nonzero winding for every batch");
console.log("Large-map integration passed: bounded color batches, geometry counts, holes, indexed hover/click, selected overlays, overscan culling, stable legends, and SVG export winding");

context.DecompressionStream = DecompressionStream;
context.getScope = () => ({ type: "region", code: "1300000000" });
Object.assign(state, { scopeId: "REG-1300000000", selectedCode: null, showMapLegend: false, showLayoutText: false });
const regionalFeatures = largeFeatures.slice(0, 1710).map((feature) => ({ ...feature, cityCode: "C1" }));
context.renderMap(regionalFeatures, { valueByCode: new Map(), importedRowByCode: new Map() });
assert.equal(vm.runInContext("mapSpatialIndex", context), null, "small regions must keep the existing per-feature rendering path");
vm.runInContext('generatedBarangayDetails.set("city:C1", { features: 1710, bytes: 100 })', context);
let regionalDetailLoads = 0;
context.loadBoundaryDetail = async () => { regionalDetailLoads++; return { type: "FeatureCollection", features: [] }; };
context.zoomMap(0.1);
context.refreshNavigationLabels();
assert.equal(regionalDetailLoads, 1, "zoomed regions below the batching threshold must still request indexed original borders");
assert.equal(context.viewportBoundaryDetailStatus().loading, true);
await new Promise(setImmediate); await new Promise(setImmediate);
assert.equal(context.viewportBoundaryDetailStatus().loaded, 1);
assert.equal(context.viewportBoundaryDetailStatus().loading, false);
console.log("Small-region integration passed: original border eligibility is independent of the SVG batching threshold");

context.clearViewportBoundaryDetail();
Object.assign(state, { generatedBoundaryStatus: "loading", boundaryMetadata: {}, camera: {
  scopeId: state.scopeId, level: state.level, boundarySource: "generated", snapshot: "2023", viewBox: [120, 120, 10.8, 6]
} });
context.renderMap(regionalFeatures, { valueByCode: new Map(), importedRowByCode: new Map() });
assert(state.camera, "a saved camera must wait for generated metadata instead of being discarded during loading");
Object.assign(state, { generatedBoundaryStatus: "ready", boundaryMetadata: { snapshot: "2023" } });
const loadsBeforeRestore = regionalDetailLoads;
context.renderMap(regionalFeatures, { valueByCode: new Map(), importedRowByCode: new Map() });
assert.equal(state.camera, null);
near(box()[2], 10.8, "camera restoration must preserve the saved geographic width at matching aspect");
await new Promise(setImmediate); await new Promise(setImmediate);
assert.equal(regionalDetailLoads, loadsBeforeRestore + 1, "restoring a close camera must automatically request detail without another gesture");
state.boundarySource = "fixture";
state.camera = { scopeId: state.scopeId, level: state.level, boundarySource: "fixture", snapshot: "different source", viewBox: [100, 200, 18, 10] };
context.renderMap(regionalFeatures, { valueByCode: new Map(), importedRowByCode: new Map() });
assert.equal(state.camera, null, "fixture cameras must not depend on generated metadata");
near(box()[0], 100, "fixture camera must restore independently");
console.log("Camera restoration passed: metadata readiness, deferred detailed borders, and independent fixture cameras");
