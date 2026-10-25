"use strict";

const workspaceUi = {
  activePanel: "places", editorOpen: false, observedSelection: null,
  drafts: new Map(), isOpen: false, returnFocus: null, focusMap: false, pagePreview: false
};
const workspaceBackgroundInert = new Map();
let customizationScale = null;
let areaOptionsIndex = null;

function bindWorkspaceEvents() {
  for (const id of ["controlsPanel", "panelHeading", "closeControlsButton", "taskTabs", "placeEditor", "panelBackdrop",
    "backToControlsButton", "openExportButton", "projectNameInput", "areaFilterInput", "areaHelp", "searchStatus", "mapStatus",
    "widerAreaButton", "boundaryDetailsButton", "boundaryDialog", "closeBoundaryDialogButton", "dataColumns",
    "dataKindNotice", "importReviewDetails", "palettePreview", "classificationHelp", "thresholdsField", "binsField", "exportFormatSelect",
    "downloadMapButton", "exportSizeSelect", "customExportSize", "replaceDataDialog", "replaceDialogText",
    "cancelReplaceButton", "saveBeforeReplaceButton", "confirmReplaceButton"]) el[id] = document.getElementById(id);
  bindThemePreference();
  if (typeof bindProjectSession === "function") bindProjectSession();

  document.querySelectorAll("[data-panel], [data-open-panel]").forEach((button) => {
    button.addEventListener("click", () => setActivePanel(button.dataset.panel || button.dataset.openPanel, { focus: true }));
  });
  el.taskTabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...el.taskTabs.querySelectorAll("[data-panel]")];
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    setActivePanel(tabs[next].dataset.panel);
    tabs[next].focus();
  });
  el.openExportButton.addEventListener("click", () => setActivePanel("export", { focus: true }));
  el.closeControlsButton.addEventListener("click", closeWorkspacePanel);
  el.panelBackdrop.addEventListener("click", closeWorkspacePanel);
  el.backToControlsButton.addEventListener("click", () => setActivePanel(workspaceUi.activePanel, { focus: true }));
  el.projectNameInput.addEventListener("input", () => {
    state.projectName = el.projectNameInput.value;
    el.mapTitle.textContent = state.projectName || "Untitled map";
  });
  el.areaFilterInput.addEventListener("input", filterAreaOptions);
  el.widerAreaButton.addEventListener("click", () => {
    state.scopeId = scopeParentId(getScope()) || "PH";
    state.selectedCode = null;
    el.areaFilterInput.value = "";
    render();
    el.fitMapButton.focus();
  });
  el.boundaryDetailsButton.addEventListener("click", () => el.boundaryDialog.showModal());
  el.closeBoundaryDialogButton.addEventListener("click", () => el.boundaryDialog.close());
  el.cancelReplaceButton.addEventListener("click", () => el.replaceDataDialog.close("cancel"));
  el.confirmReplaceButton.addEventListener("click", () => el.replaceDataDialog.close("replace"));
  el.saveBeforeReplaceButton.addEventListener("click", () => { saveProject(); el.replaceDataDialog.close("replace"); });
  el.downloadMapButton.addEventListener("click", () => el.exportFormatSelect.value === "svg" ? exportSvg() : exportPng());
  el.exportFormatSelect.addEventListener("change", () => { el.downloadMapButton.textContent = `Download ${el.exportFormatSelect.value.toUpperCase()}`; });
  el.exportSizeSelect.addEventListener("change", () => {
    const sizes = { square: [1600, 1600], portrait: [1600, 2000], report: [2400, 1800] };
    const size = sizes[el.exportSizeSelect.value];
    if (size) [state.exportWidth, state.exportHeight] = size;
    el.customExportSize.hidden = Boolean(size);
    el.exportWidthInput.value = state.exportWidth;
    el.exportHeightInput.value = state.exportHeight;
    if (typeof updatePagePreview === "function") updatePagePreview();
  });
  for (const id of ["selectedPlaceValue", "selectedPlaceLabel"]) el[id].addEventListener("input", () => {
    if (state.selectedCode) workspaceUi.drafts.set(state.selectedCode, { value: el.selectedPlaceValue.value, label: el.selectedPlaceLabel.value });
    el.editStatus.textContent = "Unapplied changes. Choose Apply changes to update the map.";
  });
  document.addEventListener("keydown", (event) => {
    if (el.boundaryDialog.open || el.replaceDataDialog.open || el.recoveryDialog?.open || el.newProjectDialog?.open) return;
    if (event.key === "Escape" && layoutEditor.enabled) { event.preventDefault(); setLayoutEditMode(false); return; }
    if (event.key === "Escape" && workspaceUi.isOpen && window.matchMedia("(max-width: 900px)").matches) {
      event.preventDefault(); closeWorkspacePanel();
    } else if (event.key === "Escape" && workspaceUi.editorOpen) {
      setActivePanel(workspaceUi.activePanel, { focus: true });
    } else if (event.key === "Tab" && workspaceUi.isOpen && window.matchMedia("(max-width: 900px)").matches) {
      const targets = [...el.controlsPanel.querySelectorAll("button, input, select, textarea, summary, [tabindex='0']")]
        .filter((node) => !node.disabled && !node.hidden && node.getClientRects().length);
      if (!targets.length) return;
      if (event.shiftKey && document.activeElement === targets[0]) { event.preventDefault(); targets.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === targets.at(-1)) { event.preventDefault(); targets[0].focus(); }
    }
  });
  window.matchMedia("(max-width: 900px)").addEventListener("change", updateWorkspacePanel);
  bindCustomizationControls();
  updateWorkspacePanel();
}

function bindThemePreference() {
  const storageKey = "philippine-demographic-mapper.theme", choices = ["system", "light", "dark"];
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  el.themeSelect = document.getElementById("themeSelect");
  let preference = "system";
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (choices.includes(saved)) preference = saved;
  } catch {}
  const apply = () => {
    document.documentElement.dataset.theme = preference === "system" ? system.matches ? "dark" : "light" : preference;
    el.themeSelect.value = preference;
  };
  el.themeSelect.addEventListener("change", () => {
    if (!choices.includes(el.themeSelect.value)) return;
    preference = el.themeSelect.value;
    apply();
    try { window.localStorage.setItem(storageKey, preference); } catch {}
  });
  system.addEventListener("change", () => { if (preference === "system") apply(); });
  apply();
}

function bindCustomizationControls() {
  const fields = [
    ["reverseColorsInput", "reverseColors", "boolean"],
    ["legendTitleInput", "legendTitle", "text"],
    ["legendScaleInput", "legendScale", "number", 0.6, 2],
    ["legendTextColorInput", "legendTextColor", "color"],
    ["legendBackgroundColorInput", "legendBackgroundColor", "color"],
    ["legendBackgroundOpacityInput", "legendBackgroundOpacity", "number", 0, 1],
    ["legendShowMissingInput", "legendShowMissing", "boolean"],
    ["legendMissingLabelInput", "legendMissingLabel", "text"],
    ["layoutTextColorInput", "layoutTextColor", "color"],
    ["layoutTextScaleInput", "layoutTextScale", "number", 0.5, 2]
  ];
  const ids = [...fields.map(([id]) => id), "legendScaleOutput", "legendOpacityOutput", "legendMissingOptions",
    "legendClassControls", "classControlsStatus", "resetClassStylesButton", "layoutTextScaleOutput", "layoutItemSelect",
    "layoutXInput", "layoutYInput", "layoutPresetSelect", "applyLayoutPresetButton", "resetLayoutButton", "layoutPositionHelp",
    "arrangeMapButton", "layoutEditStatus"];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
  fields.forEach(([id, key, type, min, max]) => {
    el[id].addEventListener("change", () => {
      let value = type === "boolean" ? el[id].checked : el[id].value;
      if (type === "number") {
        if (!Number.isFinite(Number(value))) return;
        value = clamp(Number(value), min, max);
      } else if (type === "text") value = value.trim().slice(0, 160);
      else if (type === "color" && !/^#[0-9a-f]{6}$/i.test(value)) return;
      state[key] = value;
      render();
    });
  });
  el.legendClassControls.addEventListener("change", (event) => {
    const colorIndex = event.target.dataset.classColor;
    const labelIndex = event.target.dataset.classLabel;
    const index = Number(colorIndex ?? labelIndex);
    if (!customizationScale || customizationScale.colors.length > 32 || !Number.isInteger(index) || index < 0 || index >= customizationScale.colors.length) return;
    if (colorIndex !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) return;
      const colors = [...customizationScale.colors];
      colors[index] = event.target.value;
      state.customColors = state.reverseColors ? colors.reverse() : colors;
    } else if (labelIndex !== undefined) {
      state.legendLabels = [...(state.legendLabels || [])];
      state.legendLabels[index] = event.target.value.trim().slice(0, 160);
    } else return;
    render();
  });
  el.resetClassStylesButton.addEventListener("click", () => {
    state.customColors = [];
    state.legendLabels = [];
    render();
  });
  el.layoutItemSelect.addEventListener("change", () => {
    selectLayoutItem(el.layoutItemSelect.value);
    syncLayoutControls();
  });
  for (const id of ["layoutXInput", "layoutYInput"]) el[id].addEventListener("change", () => {
    const x = el.layoutXInput.value.trim(), y = el.layoutYInput.value.trim();
    if (!x || !y || !Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) { syncLayoutControls(true); return; }
    moveLayoutItem(layoutEditor.selected, { x: clamp(Number(x), 0, 100) / 100, y: clamp(Number(y), 0, 100) / 100 });
    syncLayoutControls(true);
  });
  el.applyLayoutPresetButton.addEventListener("click", () => {
    setLayoutPreset(layoutEditor.selected, el.layoutPresetSelect.value);
    syncLayoutControls(true);
  });
  el.resetLayoutButton.addEventListener("click", () => { resetLayoutPositions(); syncLayoutControls(true); });
  el.arrangeMapButton.addEventListener("click", () => {
    setLayoutEditMode(!layoutEditor.enabled);
    syncLayoutControls();
  });
}

function renderCustomizationControls(features, join) {
  customizationScale = buildScale(features, join.valueByCode);
  const values = {
    legendTitleInput: state.legendTitle || "", legendScaleInput: state.legendScale,
    legendTextColorInput: state.legendTextColor, legendBackgroundColorInput: state.legendBackgroundColor,
    legendBackgroundOpacityInput: state.legendBackgroundOpacity, legendMissingLabelInput: state.legendMissingLabel,
    layoutTextColorInput: state.layoutTextColor, layoutTextScaleInput: state.layoutTextScale
  };
  Object.entries(values).forEach(([id, value]) => { if (document.activeElement !== el[id]) el[id].value = value; });
  el.reverseColorsInput.checked = Boolean(state.reverseColors);
  el.legendShowMissingInput.checked = state.legendShowMissing !== false;
  el.legendMissingOptions.hidden = !el.legendShowMissingInput.checked;
  el.legendScaleOutput.textContent = `${Number(state.legendScale).toFixed(1)}×`;
  el.legendOpacityOutput.textContent = `${Math.round(state.legendBackgroundOpacity * 100)}%`;
  el.layoutTextScaleOutput.textContent = `${Number(state.layoutTextScale).toFixed(1)}×`;
  const statisticName = state.statisticLabel.trim();
  el.legendTitleInput.placeholder = `Automatic: ${!statisticName || statisticName.toLowerCase() === "value" ? "Statistic" : statisticName}`;
  el.palettePreview.replaceChildren(...customizationScale.colors.map((color) => {
    const swatch = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    swatch.setAttribute("style", `background-color:${color}`);
    return swatch;
  }));
  // ponytail: edit up to 32 classes here; paginate this form if larger scales need individual controls.
  const editable = customizationScale.colors.length <= 32;
  el.classControlsStatus.textContent = editable
    ? features.some((feature) => Number.isFinite(join.valueByCode.get(feature.code)))
      ? "Group colors also change the map. Empty labels use the calculated ranges."
      : "Choose group colors now. Automatic range labels appear after you add statistics."
    : "Reduce custom break values to 32 color groups or fewer to edit individual entries.";
  if (!document.activeElement?.closest("#legendClassControls")) {
    const entries = legendEntries(customizationScale, features, join).filter((entry) => entry.index >= 0);
    el.legendClassControls.innerHTML = editable ? customizationScale.colors.map((color, index) => {
      const entry = entries.find((item) => item.index === index);
      const automatic = entry?.autoLabel || entry?.label || `Group ${index + 1}`;
      return `<div class="legend-class-row">
        <label class="field color-field"><span>Group ${index + 1} color</span><input type="color" data-class-color="${index}" value="${escapeAttr(color)}"></label>
        <label class="field"><span>Group ${index + 1} label</span><input type="text" data-class-label="${index}" maxlength="160" value="${escapeAttr(state.legendLabels?.[index] || "")}" placeholder="${escapeAttr(automatic)}"></label>
      </div>`;
    }).join("") : "";
  }
  el.resetClassStylesButton.disabled = !(state.customColors?.length || state.legendLabels?.some((label) => typeof label === "string" && label.trim()));
}

function syncLayoutControls(forcePosition = false) {
  if (!el.arrangeMapButton) return;
  const enabled = layoutEditor.enabled;
  const id = layoutEditor.selected;
  const names = { legend: "legend", title: "title", subtitle: "subtitle", source: "source note" };
  el.arrangeMapButton.setAttribute("aria-pressed", String(enabled));
  el.arrangeMapButton.textContent = enabled ? "Finish arranging" : "Arrange map";
  el.mapStage.dataset.layoutEdit = String(enabled);
  el.layoutEditStatus.hidden = !enabled;
  el.layoutEditStatus.textContent = enabled ? `Drag legend or text. Arrow keys move the selected ${names[id]}; Shift moves farther. Escape finishes. Map panning is paused.` : "";
  el.layoutItemSelect.value = id;
  const group = el.mapSvg.querySelector(`[data-layout-item="${id}"]`);
  const stored = state.layoutPositions?.[id];
  const x = group ? Number(group.dataset.layoutX) : stored?.x;
  const y = group ? Number(group.dataset.layoutY) : stored?.y;
  if (forcePosition || document.activeElement !== el.layoutXInput) el.layoutXInput.value = Number.isFinite(x) ? String(Math.round(x * 1000) / 10) : "0";
  if (forcePosition || document.activeElement !== el.layoutYInput) el.layoutYInput.value = Number.isFinite(y) ? String(Math.round(y * 1000) / 10) : "0";
  for (const key of ["layoutXInput", "layoutYInput", "layoutPresetSelect", "applyLayoutPresetButton"]) el[key].disabled = !group;
  el.layoutPositionHelp.textContent = group
    ? `Positions use the ${names[id]}'s top-left corner. Choose Arrange map to drag it, or enter percentages.`
    : `Show the ${names[id]} on the map before positioning it. Check the legend toggle or add export text.`;
  el.resetLayoutButton.disabled = !Object.keys(state.layoutPositions || {}).length;
}

function setActivePanel(name, { open = true, focus = false } = {}) {
  if (!["places", "data", "appearance", "export"].includes(name)) return;
  if (!workspaceUi.isOpen) workspaceUi.returnFocus = document.activeElement;
  workspaceUi.activePanel = name;
  workspaceUi.editorOpen = false;
  workspaceUi.isOpen = open;
  updateWorkspacePanel();
  if (focus) el.controlsPanel.querySelector(`#panel-${name} input, #panel-${name} select, #panel-${name} button`)?.focus();
}

function showPlaceEditor() {
  if (workspaceUi.focusMap && !window.matchMedia("(max-width: 900px)").matches && typeof setMapFocus === "function") setMapFocus(false);
  if (!workspaceUi.isOpen) workspaceUi.returnFocus = document.activeElement;
  workspaceUi.editorOpen = true;
  workspaceUi.isOpen = true;
  updateWorkspacePanel();
  // Keep map selection usable by keyboard; move focus out of the SVG before it is redrawn.
  el.selectedPlaceValue.focus();
}

function closeWorkspacePanel() {
  workspaceUi.isOpen = false;
  updateWorkspacePanel();
  const fallback = document.querySelector(`.mobile-taskbar [data-open-panel="${workspaceUi.activePanel}"]`);
  const previous = workspaceUi.returnFocus;
  (previous?.isConnected && previous.getClientRects().length && !previous.closest("[inert]") ? previous : fallback)?.focus();
}

function updateWorkspacePanel() {
  const mobile = window.matchMedia("(max-width: 900px)").matches;
  const modal = mobile && workspaceUi.isOpen;
  el.controlsPanel.dataset.open = String(workspaceUi.isOpen);
  el.controlsPanel.setAttribute("role", modal ? "dialog" : "complementary");
  el.controlsPanel.setAttribute("aria-labelledby", "panelHeading");
  if (modal) el.controlsPanel.setAttribute("aria-modal", "true"); else el.controlsPanel.removeAttribute("aria-modal");
  el.controlsPanel.inert = (mobile && !workspaceUi.isOpen) || (!mobile && workspaceUi.focusMap);
  for (const node of document.querySelectorAll(".appbar, .workspace, .mobile-taskbar")) {
    if (modal) {
      if (!workspaceBackgroundInert.has(node)) workspaceBackgroundInert.set(node, Boolean(node.inert));
      node.inert = true;
    } else if (workspaceBackgroundInert.has(node)) {
      node.inert = workspaceBackgroundInert.get(node);
      workspaceBackgroundInert.delete(node);
    }
  }
  el.panelBackdrop.hidden = !modal;
  el.placeEditor.hidden = !workspaceUi.editorOpen;
  el.panelHeading.textContent = workspaceUi.editorOpen ? "Edit place" : ({ places: "Places", data: "Data", appearance: "Appearance", export: "Export" })[workspaceUi.activePanel];
  document.querySelectorAll("[data-panel]").forEach((tab) => {
    const active = !workspaceUi.editorOpen && tab.dataset.panel === workspaceUi.activePanel;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = tab.dataset.panel === workspaceUi.activePanel ? 0 : -1;
    document.getElementById(`panel-${tab.dataset.panel}`).hidden = !active;
  });
  document.querySelectorAll("[data-open-panel]").forEach((button) => {
    button.setAttribute("aria-expanded", String(modal && button.dataset.openPanel === workspaceUi.activePanel));
  });
}

function resetWorkspaceEdits() {
  workspaceUi.drafts.clear();
  workspaceUi.observedSelection = null;
  workspaceUi.editorOpen = false;
}

function joinHasCsvValue(code) { return code && state.importedRows.some((row) => normalizeCode(row[state.keyColumn]) === code); }

function confirmDataReplacement() {
  if (!state.importedRows.length && !Object.keys(state.placeOverrides).length && !workspaceUi.drafts.size) return Promise.resolve(true);
  el.replaceDialogText.textContent = "This replaces your current imported data and place edits. Save your project first to keep applied edits; unfinished fields are not saved.";
  return new Promise((resolve) => {
    el.replaceDataDialog.addEventListener("close", () => resolve(el.replaceDataDialog.returnValue === "replace"), { once: true });
    el.replaceDataDialog.returnValue = "cancel";
    el.replaceDataDialog.showModal();
  });
}

function getAreaOptionsIndex() {
  const scopes = getScopes(), features = state.boundarySource === "generated" ? generatedAdminFeatures : ADMIN_FEATURES;
  if (areaOptionsIndex?.scopes === scopes && areaOptionsIndex.features === features) return areaOptionsIndex;
  const byCode = new Map(), scopeByCode = new Map(scopes.map((scope) => [`${scope.type}:${scope.code}`, scope]));
  for (const feature of features) if (!byCode.has(feature.code)) byCode.set(feature.code, feature);
  const parents = new Map();
  for (const scope of scopes) {
    const feature = byCode.get(scope.code);
    const province = scope.type === "city" && feature?.provinceCode && !["highly_urbanized_city", "independent_component_city"].includes(feature.adminType)
      ? scopeByCode.get(`province:${feature.provinceCode}`) : null;
    parents.set(scope.id, scope.type === "country" ? null : scope.type === "region" ? "PH"
      : province?.id || scopeByCode.get(`region:${feature?.regionCode}`)?.id || "PH");
  }
  areaOptionsIndex = { scopes, features, parents, entries: scopes.map((scope) => ({ scope, query: `${scope.name} ${scope.code || ""}`.toLowerCase() })) };
  return areaOptionsIndex;
}

function scopeParentId(scope) { return getAreaOptionsIndex().parents.get(scope.id) ?? null; }

function filterAreaOptions() {
  const index = getAreaOptionsIndex(), scope = getScope(), query = el.areaFilterInput.value.trim().toLowerCase();
  if (index.lastScope === scope && index.lastQuery === query) return;
  const parent = index.parents.get(scope.id);
  const options = index.entries.filter(({ scope: item, query: text }) => item.id === "PH" || item.id === scope.id || item.id === parent ||
    (query ? text.includes(query) : index.parents.get(item.id) === scope.id)).map(({ scope: item }) => item);
  // ponytail: cap search suggestions at 80; place search and parent navigation reach the remaining areas.
  const matches = options.filter((item) => item.id !== "PH" && item.id !== scope.id && item.id !== parent).slice(0, 80);
  const shown = options.filter((item) => item.id === "PH" || item.id === scope.id || item.id === parent).concat(matches);
  if (el.areaHelp) el.areaHelp.textContent = query && !index.entries.some((item) => item.query.includes(query))
    ? "No matching areas. Try another name or use Search places."
    : options.length > shown.length ? "Showing the first 80 matching areas. Narrow the search to find more."
      : "Area limits which places appear. Map level chooses the boundaries shown.";
  el.scopeSelect.innerHTML = shown.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.type === "country" ? item.name : `${levelLabel(item.type)} · ${item.name}`)}</option>`).join("");
  el.scopeSelect.value = state.scopeId;
  index.lastScope = scope;
  index.lastQuery = query;
}

function renderWorkspace(join, features) {
  if (document.activeElement !== el.projectNameInput) el.projectNameInput.value = state.projectName;
  updateBoundaryDetailStatus();
  if (typeof syncProjectWorkspace === "function") syncProjectWorkspace();
  el.dataColumns.hidden = !state.columns.length;
  el.importReviewDetails.hidden = !state.columns.length;
  el.dataKindNotice.textContent = /illustrative|sample values/i.test(state.sourceNote)
    ? "Illustrative sample numbers, not population observations. Applied place edits take priority."
    : state.columns.length ? "Statistics and optional annotations from your CSV. Applied place edits take priority; missing is not zero."
      : "Add your statistics from a CSV or by editing a place. Boundaries do not include population figures; missing is not zero.";
  el.thresholdsField.hidden = state.classification !== "custom";
  el.binsField.hidden = !["equal", "quantile"].includes(state.classification);
  el.classificationHelp.textContent = ({ equal: "Split the value range into equally sized intervals.", quantile: "Put a similar number of places in each color group.",
    continuous: "Blend colors gradually from low to high values.", highlight: "Highlight places that have a statistic.", custom: "Enter the values where one color group ends and the next begins." })[state.classification];
  renderCustomizationControls(features, join);
  const sizes = { "1600x1600": "square", "1600x2000": "portrait", "2400x1800": "report" };
  const size = sizes[`${state.exportWidth}x${state.exportHeight}`] || "custom";
  if (el.exportSizeSelect.value !== "custom" || size === "custom") el.exportSizeSelect.value = size;
  el.customExportSize.hidden = el.exportSizeSelect.value !== "custom";
  el.widerAreaButton.hidden = state.scopeId === "PH";
  el.clearSelectionButton.hidden = !state.selectedCode;
  const unavailable = state.boundarySource === "generated" && (state.generatedBoundaryStatus === "error" || (state.level === "barangay" && failedBarangayScopes.has(barangayScopeKey())));
  const loading = state.boundarySource === "generated" && (state.generatedBoundaryStatus === "loading" || (state.level === "barangay" && loadingBarangayScopes.has(barangayScopeKey())));
  el.mapStage.setAttribute("aria-busy", String(loading));
  el.mapStatus.textContent = loading ? "Loading boundaries…" : unavailable ? "Boundaries unavailable. Open boundary details to retry."
    : !features.length ? "No mapped places in this area. Choose a wider area or check boundary details."
    : `${new Set(features.map((feature) => feature.code)).size.toLocaleString()} places · ${join.valueByCode.size ? `${join.valueByCode.size.toLocaleString()} with statistics` : "No statistics shown. Import a CSV or edit a place."}`;
  if (workspaceUi.observedSelection !== state.selectedCode) {
    workspaceUi.observedSelection = state.selectedCode;
    if (state.selectedCode) showPlaceEditor(); else workspaceUi.editorOpen = false;
  }
  updateWorkspacePanel();
  syncLayoutControls();
}

function updateBoundaryDetailStatus() {
  if (!el.sourceStatus) return;
  el.sourceStatus.textContent = state.boundarySource === "generated"
    ? `Historical boundaries: ${state.boundaryMetadata.snapshot?.slice(0, 4) || "dated source"} · Incomplete coverage` : "Demonstration shapes · Not real boundaries";
  if (state.boundarySource !== "generated" || state.level !== "barangay") return;
  const key = barangayScopeKey(), detail = generatedBarangayDetailStatus.get(key);
  const progress = generatedBarangayDetailProgress.get(key), viewport = viewportBoundaryDetailStatus();
  el.sourceStatus.textContent += detail === "loading" ? ` · Loading detail${progress ? ` ${progress.completed}/${progress.total}` : ""}…`
    : detail === "original" ? " · Detailed borders"
    : detail === "fallback" ? " · Detail unavailable; overview shown"
    : viewport.total ? ` · ${viewport.loaded === viewport.total ? "Detailed borders" : `Partial detail ${viewport.loaded}/${viewport.total}`}${viewport.loading ? " · Loading…" : viewport.failed ? " · Some detail unavailable" : ""}`
    : " · Overview borders";
}
