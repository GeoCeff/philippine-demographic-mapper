import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile("index.html", "utf8");
const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTML controls must not duplicate IDs");
assert(html.indexOf('src="src/ui.js"') < html.indexOf('src="src/app.js"'), "workspace UI must load before app integration");

const nodes = [], byId = new Map(), media = { matches: false, addEventListener() {} };
function element(tag, attributes = {}) {
  const listeners = new Map();
  const node = {
    tag, attributes, dataset: {}, listeners, children: [], value: attributes.value || "", innerHTML: "", textContent: "",
    hidden: Object.hasOwn(attributes, "hidden"), disabled: false, open: false, isConnected: true,
    setAttribute(key, value) { this.attributes[key] = String(value); },
    getAttribute(key) { return this.attributes[key] ?? null; },
    removeAttribute(key) { delete this.attributes[key]; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    replaceChildren(...children) {
      this.children.forEach((child) => { child.parentElement = null; });
      this.children = []; this.innerHTML = "";
      children.forEach((child) => this.appendChild(child));
    },
    addEventListener(type, listener, options = {}) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ listener, once: Boolean(options.once) });
    },
    querySelectorAll(selector) { return query(selector).filter((item) => { for (let parent = item.parentElement; parent; parent = parent.parentElement) if (parent === this) return true; return false; }); },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    closest(selector) { for (let item = this; item; item = item.parentElement) if (matches(item, selector)) return item; return null; },
    focus() { document.activeElement = this; },
    showModal() { this.open = true; },
    close(value = "") { this.returnValue = value; this.open = false; return emit(this, "close"); },
    getClientRects() { for (let item = this; item; item = item.parentElement) if (item.hidden) return []; return [{}]; }
  };
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith("data-")) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return node;
}
function matches(node, selector) {
  if (selector.startsWith("#")) return node.attributes.id === selector.slice(1);
  if (selector.startsWith(".")) return (node.attributes.class || "").split(/\s+/).includes(selector.slice(1));
  const attribute = /^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/.exec(selector);
  if (attribute) return (Object.hasOwn(node.attributes, attribute[1]) || (attribute[1] === "inert" && node.inert)) && (attribute[2] === undefined || node.attributes[attribute[1]] === attribute[2]);
  return node.tag === selector;
}
function query(selector) {
  return nodes.filter((node) => selector.split(",").some((part) => {
    const pieces = part.trim().split(/\s+/);
    if (!matches(node, pieces.pop())) return false;
    let parent = node.parentElement;
    while (pieces.length) {
      const ancestor = pieces.pop();
      while (parent && !matches(parent, ancestor)) parent = parent.parentElement;
      if (!parent) return false;
      parent = parent.parentElement;
    }
    return true;
  }));
}
async function emit(node, type, changes = {}) {
  const event = { target: node, preventDefault() {}, ...changes };
  const results = [...(node.listeners.get(type) || [])].map((entry) => {
    if (entry.once) node.listeners.set(type, node.listeners.get(type).filter((item) => item !== entry));
    return entry.listener(event);
  });
  await Promise.all(results);
}
const parents = [], voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
for (const match of html.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
  const tag = match[2].toLowerCase();
  if (match[1]) {
    const index = parents.findLastIndex((node) => node.tag === tag);
    if (index >= 0) parents.length = index;
    continue;
  }
  const attributes = Object.fromEntries([...match[3].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)].map((item) => [item[1], item[2] ?? item[3] ?? ""]));
  const node = element(tag, attributes);
  node.parentElement = parents.at(-1) || null;
  nodes.push(node);
  if (attributes.id) byId.set(attributes.id, node);
  if (!voidTags.has(tag) && !match[3].trim().endsWith("/")) parents.push(node);
}
const document = {
  activeElement: null, documentElement: { dataset: {} }, addEventListener() {},
  getElementById(id) { assert(byId.has(id), "JavaScript references a missing HTML control: " + id); return byId.get(id); },
  querySelectorAll: query, querySelector: (selector) => query(selector)[0] || null,
  createElementNS: (_namespace, tag) => element(tag)
};
const context = vm.createContext({ document, window: { matchMedia: () => media }, console, Intl, Map, Set, Number, String, Math, URL, Blob, Image: function Image() {} });
for (const file of ["data", "state", "utils", "boundary-detail", "boundary-loader", "csv", "matching", "classification", "render-utils", "export", "ui", "app"]) {
  vm.runInContext(await readFile("src/" + file + ".js", "utf8"), context, { filename: "src/" + file + ".js" });
}
const { state, el, workspaceUi } = vm.runInContext("({ state, el, workspaceUi })", context);
context.cacheElements();
context.bindEvents();
context.bindWorkspaceEvents();
let renders = 0, saves = 0;
context.render = () => { renders++; };
context.saveProject = () => { saves++; };

el.customThresholdsInput.value = "12,34";
el.selectedPlaceLabel.value = "Unfinished annotation";
el.selectedPlaceValue.value = "0";
for (const panel of ["data", "appearance", "export", "places"]) {
  context.setActivePanel(panel);
  assert.equal(workspaceUi.activePanel, panel);
  assert.equal(byId.get("panel-" + panel).hidden, false);
  assert.equal(el.customThresholdsInput.value, "12,34", "panel navigation must preserve unfinished controls");
  assert.equal(el.selectedPlaceLabel.value, "Unfinished annotation");
  assert.equal(el.selectedPlaceValue.value, "0");
}
assert.equal(renders, 0, "switching task panels must not rerender the map or overwrite input drafts");
media.matches = true;
workspaceUi.isOpen = false;
el.zoomInButton.focus();
context.setActivePanel("data");
assert.equal(el.controlsPanel.dataset.open, "true");
assert.equal(el.controlsPanel.getAttribute("aria-modal"), "true");
const modalBackground = document.querySelectorAll(".appbar, .workspace, .mobile-taskbar");
assert.equal(modalBackground.length, 3);
assert(modalBackground.every((node) => node.inert), "mobile modal must make the header, map and mobile taskbar inert");
assert(el.loadProjectButton.closest("[inert]")); assert(el.saveProjectButton.closest("[inert]")); assert(el.zoomInButton.closest("[inert]"));
assert.equal(el.controlsPanel.closest("[inert]"), null, "the open modal itself must remain interactive");
context.closeWorkspacePanel();
assert.equal(el.controlsPanel.dataset.open, "false");
assert.equal(el.controlsPanel.inert, true);
assert(modalBackground.every((node) => !node.inert), "closing mobile tools must restore background interaction");
assert.equal(document.activeElement, el.zoomInButton, "closing the mobile tools must restore initiating focus");
context.setActivePanel("appearance");
workspaceUi.returnFocus = el.selectedPlaceValue;
context.closeWorkspacePanel();
assert.equal(document.activeElement.dataset.openPanel, "appearance", "hidden editor focus must return to its mobile task button");
assert(document.activeElement.closest(".mobile-taskbar"), "focus fallback must not choose an inline control in a hidden panel");
media.matches = false;
context.setActivePanel("data");
context.showPlaceEditor();
await emit(el.backToControlsButton, "click");
assert.equal(workspaceUi.editorOpen, false);
assert(document.activeElement.closest("#panel-data"), "leaving the place editor must focus the previous task's visible controls");

state.importedRows = [{ psgc_code: "0730600000", value: "8" }];
state.placeOverrides = { "0730600000": { value: "0", label: "Applied edit" } };
workspaceUi.drafts.set("0730600000", { value: "2", label: "Unfinished edit" });
const originalRows = JSON.stringify(state.importedRows), originalOverrides = JSON.stringify(state.placeOverrides);
const canceledSample = emit(el.loadRegionSample, "click");
assert.equal(el.replaceDataDialog.open, true);
await emit(el.cancelReplaceButton, "click");
await canceledSample;
assert.equal(JSON.stringify(state.importedRows), originalRows, "canceling an actual sample-data action must preserve imported rows");
assert.equal(JSON.stringify(state.placeOverrides), originalOverrides, "canceling an actual sample-data action must preserve manual edits");
for (const [button, accepted] of [["cancelReplaceButton", false], ["confirmReplaceButton", true], ["saveBeforeReplaceButton", true]]) {
  const confirmation = context.confirmDataReplacement();
  assert.equal(el.replaceDataDialog.open, true);
  await emit(el[button], "click");
  assert.equal(await confirmation, accepted);
  assert.equal(JSON.stringify(state.importedRows), originalRows, "confirmation must preserve source rows until its caller replaces data");
  assert.equal(JSON.stringify(state.placeOverrides), originalOverrides);
  assert.equal(workspaceUi.drafts.get("0730600000").label, "Unfinished edit");
}
assert.equal(saves, 1, "save before replacement must invoke the existing project-save action");

context.workspaceFeatures = [
  { code: "0100000000", name: "Ilocos", level: "region", regionCode: "0100000000" },
  { code: "0700000000", name: "Central Visayas", level: "region", regionCode: "0700000000" },
  { code: "0702200000", name: "Cebu", level: "province", regionCode: "0700000000", provinceCode: "0702200000" },
  { code: "0730600000", name: "City of Cebu", level: "city", regionCode: "0700000000", provinceCode: "0702200000", adminType: "highly_urbanized_city",
    regionName: "Central Visayas", provinceName: "Cebu", cityName: "City of Cebu" },
  { code: "0702201000", name: "Carcar", level: "city", regionCode: "0700000000", provinceCode: "0702200000", adminType: "component_city" },
  { code: "1705109000", name: "Sablayan", level: "city", regionCode: "1700000000", provinceCode: "1705100000", adminType: "municipality" }
];
vm.runInContext("generatedAdminFeatures = workspaceFeatures; generatedScopes = buildBoundaryScopes(generatedAdminFeatures)", context);
state.boundarySource = "generated";
state.generatedBoundaryStatus = "ready";
state.level = "city";
state.scopeId = "PROV-0702200000";
el.areaFilterInput.value = "";
context.filterAreaOptions();
const optionIds = () => [...el.scopeSelect.innerHTML.matchAll(/value="([^"]+)"/g)].map((match) => match[1]);
assert(optionIds().includes("PH") && optionIds().includes("REG-0700000000") && optionIds().includes("CITY-0702201000"));
assert(!optionIds().includes("CITY-0730600000"), "independent cities must not become administrative children of their geographic province");
el.areaFilterInput.value = "City of Cebu";
context.filterAreaOptions();
assert(optionIds().includes("CITY-0730600000"), "filtering must reach a matching independent city");
assert(optionIds().includes(state.scopeId) && optionIds().includes("REG-0700000000"), "filtered options must preserve current area and parent context");
assert.equal(el.scopeSelect.value, state.scopeId);

const beforeAreaScope = state.scopeId;
context.largeAreaFeatures = context.workspaceFeatures.concat(Array.from({ length: 120 }, (_, index) => ({
  code: String(702202000 + index), name: "Test town " + index, level: "city", regionCode: "0700000000", provinceCode: "0702200000", adminType: "municipality"
})));
vm.runInContext("generatedAdminFeatures = largeAreaFeatures; generatedScopes = buildBoundaryScopes(generatedAdminFeatures)", context);
el.areaFilterInput.value = "Test town";
let areaOptionWrites = 0, areaOptionHtml = el.scopeSelect.innerHTML;
Object.defineProperty(el.scopeSelect, "innerHTML", { configurable: true, get: () => areaOptionHtml, set(value) { areaOptionWrites++; areaOptionHtml = value; } });
try {
  context.filterAreaOptions();
  assert.equal((el.scopeSelect.innerHTML.match(/Test town/g) || []).length, 80, "large area searches must bound the suggestion DOM");
  assert.match(el.areaHelp.textContent, /first 80/);
  assert(optionIds().includes(beforeAreaScope) && optionIds().includes("REG-0700000000"), "large searches must retain the current area and parent");
  for (let index = 0; index < 10; index++) context.filterAreaOptions();
  assert.equal(areaOptionWrites, 1, "unrelated redraws must not rebuild unchanged area suggestions");
  el.areaFilterInput.value = "Test town 119";
  context.filterAreaOptions();
  assert.match(el.scopeSelect.innerHTML, /Test town 119/, "the search cap must not prevent reaching later areas with a narrower query");
  vm.runInContext("generatedAdminFeatures = workspaceFeatures; generatedScopes = buildBoundaryScopes(generatedAdminFeatures)", context);
  context.filterAreaOptions();
  assert.doesNotMatch(el.scopeSelect.innerHTML, /Test town/, "reloaded geography must discard stale cached areas");
  assert.match(el.areaHelp.textContent, /No matching areas/);
} finally {
  Object.defineProperty(el.scopeSelect, "innerHTML", { configurable: true, writable: true, value: areaOptionHtml });
  vm.runInContext("generatedAdminFeatures = workspaceFeatures; generatedScopes = buildBoundaryScopes(generatedAdminFeatures)", context);
  state.scopeId = beforeAreaScope;
  el.areaFilterInput.value = "";
  context.filterAreaOptions();
}

state.importedRows = [];
state.placeOverrides = {};
state.selectedCode = "0730600000";
workspaceUi.drafts.clear();
workspaceUi.observedSelection = null;
const features = context.getAdminFeatures();
const join = { valueByCode: new Map([[state.selectedCode, 8]]), importedRowByCode: new Map([[state.selectedCode, { value: "8" }]]) };
context.renderSelection(join, features);
assert(el.selectionDetails.innerHTML.includes(context.placeDetailsMarkup(features.find((item) => item.code === state.selectedCode), 8, join)),
  "the selected-place editor must reuse the same details as hovering");
assert.match(el.selectionDetails.innerHTML, /Highly urbanized city/);
assert.doesNotMatch(el.selectionDetails.innerHTML, /<dt>Province<\/dt>/);
context.renderWorkspace(join, features);
el.selectedPlaceLabel.value = "Unapplied label";
el.selectedPlaceValue.value = "0";
await emit(el.selectedPlaceValue, "input");
context.setActivePanel("appearance");
context.renderSelection(join, features);
context.renderWorkspace(join, features);
assert.equal(el.selectedPlaceLabel.value, "Unapplied label", "generic rendering must retain the selected place's draft label");
assert.equal(el.selectedPlaceValue.value, "0", "generic rendering must retain an explicit zero draft");
assert.equal(workspaceUi.editorOpen, false, "a generic render must not reopen the editor after choosing another task");
for (const mode of ["equal", "quantile", "continuous", "highlight", "custom"]) {
  state.classification = mode;
  context.renderWorkspace(join, features);
  assert.equal(el.thresholdsField.hidden, mode !== "custom");
  assert.equal(el.binsField.hidden, !["equal", "quantile"].includes(mode));
}
state.classification = "equal";
const feature = features.find((item) => item.code === "0730600000");
const scale = context.buildScale(features, join.valueByCode);
state.selectedCode = null;
const originalFill = context.getFeatureFill(feature, 8, scale);
state.selectedCode = feature.code;
assert.equal(context.getFeatureFill(feature, 8, scale), originalFill, "selection must retain the statistic's classified color");
assert.equal(context.getFeatureFill(feature, NaN, scale), state.missingColor, "selection must not turn missing data into a statistic");

const beforeReviewState = { importedRows: state.importedRows, placeOverrides: state.placeOverrides, scopeId: state.scopeId };
try {
  state.scopeId = "PH"; state.placeOverrides = {};
  state.importedRows = [
    { psgc_code: "1705109000", name: "Sablayan", value: "0" },
    { psgc_code: "0702201000", name: "Carcar", value: "not-a-number<invalid-statistic>" },
    { psgc_code: "0730600000", name: "City of Cebu", value: "   " }
  ];
  const reviewJoin = context.buildJoin();
  assert.equal(reviewJoin.issueRows.length, 2);
  context.renderReviewTable(reviewJoin);
  assert.match(el.reviewTable.innerHTML, /<th>Data row<\/th>/);
  assert.match(el.reviewTable.innerHTML, /Statistic entry/);
  assert.match(el.reviewTable.innerHTML, /not-a-number&lt;invalid-statistic&gt;/, "CSV review must show an escaped invalid raw entry");
  assert.match(el.reviewTable.innerHTML, /<td>0<\/td>/, "CSV review must distinguish zero from blank statistics");
  assert.match(el.reviewTable.innerHTML, /<td>Blank<\/td>/);
  assert.equal((el.reviewTable.innerHTML.match(/<tr class="review-row /g) || []).length, 3, "each CSV data row must appear once, including invalid and blank entries");
  assert.equal((el.reviewTable.innerHTML.match(/status-ok">Mapped<\/span>/g) || []).length, 1);
  assert.doesNotMatch(el.reviewTable.innerHTML, />Matched<\/span>/, "invalid and blank entries must not repeat as matched rows");
  assert(!el.reviewTable.innerHTML.includes("<invalid-statistic>"));
  el.geographySearchInput.value = "City of Cebu";
  context.updateGeographySuggestions();
  assert.match(el.geographyOptions.innerHTML, /Highly urbanized city.*Central Visayas/);
  assert.equal((el.geographyOptions.innerHTML.match(/City of Cebu/g) || []).length, 1, "search suggestions must not repeat a place in its parent path");
} finally { Object.assign(state, beforeReviewState); }

state.projectName = "Editable project";
state.layoutTitle = "Original export title";
el.layoutTitleInput.value = "Presentation title";
await emit(el.layoutTitleInput, "input");
assert.equal(state.layoutTitle, "Presentation title");
assert.equal(state.projectName, "Editable project", "editing an export title must not rename the editable project");
el.projectNameInput.value = "Renamed project";
await emit(el.projectNameInput, "input");
assert.equal(state.projectName, "Renamed project");
assert.equal(state.layoutTitle, "Presentation title", "project naming must not overwrite export typography");
const alerts = [], beforeInvalidProject = JSON.stringify(state);
context.alert = (message) => alerts.push(message);
await context.loadProject({ target: { files: [{ text: async () => "null" }] } });
assert.equal(alerts.length, 1);
assert(alerts[0].includes("required map settings"), "JSON null must produce a clear invalid-project message");
assert.equal(JSON.stringify(state), beforeInvalidProject, "invalid project files must preserve current work");
assert.equal(el.replaceDataDialog.open, false);

const customizationFeatures = [{ code: "A" }, { code: "B" }, { code: "C" }];
const customizationJoin = { valueByCode: new Map([["A", 0], ["B", 10], ["C", 20]]) };
Object.assign(state, { classification: "equal", bins: 3, customThresholds: "", customColors: [], reverseColors: false,
  legendLabels: [], statisticLabel: "Population" });
context.renderCustomizationControls(customizationFeatures, customizationJoin);
const baseColors = Array.from(context.buildScale(customizationFeatures, customizationJoin.valueByCode).colors);
el.reverseColorsInput.checked = true;
await emit(el.reverseColorsInput, "change");
assert.equal(state.reverseColors, true);
context.renderCustomizationControls(customizationFeatures, customizationJoin);
assert.equal(el.palettePreview.children[0].getAttribute("style"), `background-color:${baseColors.at(-1)}`, "palette preview must use the actual reversed scale");
const beforePreviewProbe = { ...state };
try {
  const unsafeColor = 'red"><img src="data:," onerror="document.documentElement.dataset.auditPoc=1">';
  Object.assign(state, context.validateProjectState({ scopeId: "PH", level: "region", classification: "highlight", highlightColor: unsafeColor }));
  context.renderCustomizationControls(customizationFeatures, customizationJoin);
  assert.equal(el.palettePreview.children.length, 1);
  assert.match(el.palettePreview.children[0].getAttribute("style"), /^background-color:#[0-9a-f]{6}$/);
  state.highlightColor = unsafeColor;
  context.renderCustomizationControls(customizationFeatures, customizationJoin);
  assert.equal(el.palettePreview.children.length, 1);
  assert.equal(el.palettePreview.children[0].tag, "span");
  assert.equal(el.palettePreview.children[0].children.length, 0, "unsafe-looking color text must never be parsed as HTML");
  assert.equal(el.palettePreview.innerHTML, "");
  assert.equal(document.documentElement.dataset.auditPoc, undefined);
} finally { Object.assign(state, beforePreviewProbe); }
context.renderCustomizationControls(customizationFeatures, customizationJoin);

const colorInput = element("input", { "data-class-color": "0" });
colorInput.value = "#123456";
colorInput.parentElement = el.legendClassControls;
await emit(el.legendClassControls, "change", { target: colorInput });
assert.equal(context.buildScale(customizationFeatures, customizationJoin.valueByCode).colors[0], "#123456",
  "editing a displayed color while reversed must change that class rather than its opposite");
assert.equal(state.reverseColors, true, "editing a color must preserve the reverse setting");

const labelInput = element("input", { "data-class-label": "1" });
labelInput.value = '  High <value> "label"  ';
labelInput.parentElement = el.legendClassControls;
await emit(el.legendClassControls, "change", { target: labelInput });
assert.equal(state.legendLabels[1], 'High <value> "label"');
context.renderCustomizationControls(customizationFeatures, customizationJoin);
assert.match(el.legendClassControls.innerHTML, /High &lt;value&gt; &quot;label&quot;/, "custom class labels must be escaped in generated controls");
assert.doesNotMatch(el.legendClassControls.innerHTML, /High <value>/);
document.activeElement = labelInput;
const focusedRows = el.legendClassControls.innerHTML;
context.renderCustomizationControls(customizationFeatures, customizationJoin);
assert.equal(el.legendClassControls.innerHTML, focusedRows, "generic rendering must not rebuild focused class inputs");
document.activeElement = null;
labelInput.value = "   ";
await emit(el.legendClassControls, "change", { target: labelInput });
assert.equal(state.legendLabels[1], "", "blank labels must request the automatic range text");

el.legendTitleInput.value = "My legend";
await emit(el.legendTitleInput, "change");
assert.equal(state.legendTitle, "My legend");
el.legendBackgroundOpacityInput.value = "0";
await emit(el.legendBackgroundOpacityInput, "change");
assert.equal(state.legendBackgroundOpacity, 0, "a fully transparent legend card must remain zero");
el.legendShowMissingInput.checked = false;
await emit(el.legendShowMissingInput, "change");
context.renderCustomizationControls(customizationFeatures, customizationJoin);
assert.equal(el.legendMissingOptions.hidden, true);

const originalHighlight = state.highlightColor;
Object.assign(state, { classification: "highlight", customColors: [], reverseColors: false });
context.renderCustomizationControls(customizationFeatures, customizationJoin);
colorInput.value = "#abcdef";
await emit(el.legendClassControls, "change", { target: colorInput });
assert.equal(context.buildScale(customizationFeatures, customizationJoin.valueByCode).colors[0], "#abcdef");
assert.equal(state.highlightColor, originalHighlight, "custom highlight colors must not overwrite the saved selection-outline color");
await emit(el.resetClassStylesButton, "click");
assert.equal(state.customColors.length, 0);
assert.equal(state.legendLabels.length, 0);
assert.equal(context.buildScale(customizationFeatures, customizationJoin.valueByCode).colors[0], originalHighlight,
  "resetting custom colors must restore the previous highlight color");

Object.assign(state, { classification: "custom", customThresholds: Array.from({ length: 32 }, (_, index) => index).join(",") });
context.renderCustomizationControls(customizationFeatures, customizationJoin);
assert.equal(el.legendClassControls.innerHTML, "", "more than 32 classes must not offer edits that cannot be preserved");
assert.match(el.classControlsStatus.textContent, /32 color groups or fewer/);
Object.assign(state, { classification: "equal", customThresholds: "" });
context.renderCustomizationControls(customizationFeatures, { valueByCode: new Map() });
assert.match(el.classControlsStatus.textContent, /after you add statistics/);
assert.match(el.legendClassControls.innerHTML, /Group 1/, "colors must remain editable before statistics are added");

const layoutState = vm.runInContext("layoutEditor", context);
const layoutGroup = element("g", { "data-layout-item": "legend", "data-layout-x": "0.2", "data-layout-y": "0.1" });
layoutGroup.parentElement = el.mapSvg;
nodes.push(layoutGroup);
const layoutMoves = [], layoutPresets = [];
context.selectLayoutItem = (id) => { layoutState.selected = id; };
context.moveLayoutItem = (id, position) => {
  layoutMoves.push({ id, ...position });
  state.layoutPositions[id] = { ...position };
  layoutGroup.dataset.layoutX = String(position.x); layoutGroup.dataset.layoutY = String(position.y);
};
context.setLayoutPreset = (id, preset) => { layoutPresets.push({ id, preset }); };
context.resetLayoutPositions = () => { state.layoutPositions = {}; };
context.setLayoutEditMode = (enabled) => { layoutState.enabled = enabled; if (enabled) context.closeWorkspacePanel(); };
layoutState.selected = "legend";
context.syncLayoutControls();
assert.equal(el.layoutXInput.value, "20");
assert.equal(el.layoutYInput.value, "10");
assert.equal(el.layoutXInput.disabled, false);
const rendersBeforePosition = renders;
el.layoutXInput.value = "50.5"; el.layoutYInput.value = "0";
await emit(el.layoutXInput, "change");
assert.deepEqual(layoutMoves.at(-1), { id: "legend", x: 0.505, y: 0 }, "percentage fields must pass normalized positions, including zero");
assert.equal(renders, rendersBeforePosition, "position controls must use the focused layout update instead of rebuilding map geometry");
el.layoutPresetSelect.value = "bottom-right";
await emit(el.applyLayoutPresetButton, "click");
assert.deepEqual(layoutPresets.at(-1), { id: "legend", preset: "bottom-right" });
await emit(el.resetLayoutButton, "click");
assert.equal(Object.keys(state.layoutPositions).length, 0);
el.layoutItemSelect.value = "title";
await emit(el.layoutItemSelect, "change");
assert.equal(layoutState.selected, "title");
assert.equal(el.layoutXInput.disabled, true, "absent text items must not offer misleading position controls");
assert.match(el.layoutPositionHelp.textContent, /Show the title/);
context.setActivePanel("appearance");
await emit(el.arrangeMapButton, "click");
assert.equal(layoutState.enabled, true);
assert.equal(workspaceUi.isOpen, false, "arrangement must delegate to the helper that returns users to the canvas");
assert.equal(el.arrangeMapButton.getAttribute("aria-pressed"), "true");
assert.equal(el.layoutEditStatus.hidden, false);
assert.match(el.layoutEditStatus.textContent, /Escape finishes/);
await emit(el.arrangeMapButton, "click");
assert.equal(layoutState.enabled, false);
assert.equal(el.arrangeMapButton.getAttribute("aria-pressed"), "false");
assert.equal(el.layoutEditStatus.hidden, true);

console.log("Workspace UI passed: DOM contracts, drafts/focus, replacement, geography, map styles, class controls, and layout controls");

const themeSource = await readFile("src/ui.js", "utf8"), themeKey = "philippine-demographic-mapper.theme";
function themeFixture({ stored = null, dark = false, unavailable = false, failWrite = false } = {}) {
  const root = { dataset: {} }, listeners = [], changes = [];
  const select = { value: "", addEventListener(type, callback) { assert.equal(type, "change"); changes.push(callback); } };
  const system = { matches: dark, addEventListener(type, callback) { assert.equal(type, "change"); listeners.push(callback); } };
  let saved = stored;
  const storage = { getItem(key) { assert.equal(key, themeKey); return saved; }, setItem(key, value) { assert.equal(key, themeKey); if (failWrite) throw new Error("Storage is full"); saved = value; } };
  const themeWindow = { matchMedia(query) { assert.equal(query, "(prefers-color-scheme: dark)"); return system; } };
  Object.defineProperty(themeWindow, "localStorage", { get() { if (unavailable) throw new Error("Storage is blocked"); return storage; } });
  const themeContext = vm.createContext({ window: themeWindow, el: {}, document: { documentElement: root,
    getElementById(id) { assert.equal(id, "themeSelect"); return select; } } });
  vm.runInContext(themeSource, themeContext, { filename: "src/ui.js" });
  themeContext.bindThemePreference();
  return { root, select, saved: () => saved,
    choose(value) { select.value = value; changes.forEach((callback) => callback()); },
    os(value) { system.matches = value; listeners.forEach((callback) => callback({ matches: value })); } };
}
const theme = themeFixture({ dark: true });
assert.equal(theme.select.value, "system"); assert.equal(theme.root.dataset.theme, "dark");
theme.os(false); assert.equal(theme.root.dataset.theme, "light", "System must react to OS color changes");
theme.choose("dark"); assert.equal(theme.saved(), "dark"); assert.equal(theme.root.dataset.theme, "dark");
theme.os(true); theme.os(false); assert.equal(theme.root.dataset.theme, "dark", "an explicit theme must ignore OS changes");
const reloadedTheme = themeFixture({ stored: theme.saved(), dark: false });
assert.equal(reloadedTheme.select.value, "dark"); assert.equal(reloadedTheme.root.dataset.theme, "dark", "the saved choice must survive reloading");
theme.choose("light"); theme.os(true); assert.equal(theme.root.dataset.theme, "light");
theme.choose("system"); assert.equal(theme.saved(), "system"); assert.equal(theme.root.dataset.theme, "dark");
theme.os(false); assert.equal(theme.root.dataset.theme, "light");
const invalidTheme = themeFixture({ stored: "unexpected", dark: true });
assert.equal(invalidTheme.select.value, "system"); assert.equal(invalidTheme.root.dataset.theme, "dark", "unknown stored values must use the system preference");
for (const failure of [{ unavailable: true }, { failWrite: true }]) {
  const blocked = themeFixture(failure);
  assert.equal(blocked.root.dataset.theme, "light");
  blocked.choose("dark"); assert.equal(blocked.root.dataset.theme, "dark", "theme switching must work even when persistence fails");
  blocked.choose("system"); blocked.os(true); assert.equal(blocked.root.dataset.theme, "dark");
}
console.log("Theme preference passed: system/light/dark, persistence, OS changes, invalid storage, and unavailable storage");
