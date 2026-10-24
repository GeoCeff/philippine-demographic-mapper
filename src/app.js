"use strict";

document.addEventListener("DOMContentLoaded", init);
let mapViewBox = null;
let mapFittedViewBox = null;
let mapLayoutViewBox = null;
let mapContentViewBox = null;
let mapCanvasSize = null;
let cancelMapGesture = null;
let mapLabelTimer = null;
let mapViewKey = "";
const featureRenderCache = new WeakMap();
const layoutItemMetrics = new WeakMap();
let renderedFeatures = [];
let renderedValues = new Map();
let renderedJoin = null;
let renderedScale = null, mapSpatialIndex = null, batchedViewport = null;
let renderedBatchOrder = new Map();

async function init() {
  cacheElements();
  populateStaticControls();
  bindEvents();
  bindWorkspaceEvents();
  const boundaries = loadGeneratedBoundaryFeatures();
  render();
  await boundaries;
  render();
}

function cacheElements() {
  [
    "scopeSelect",
    "levelSelect",
    "boundarySourceSelect",
    "geographySearchInput",
    "geographyOptions",
    "fitMapButton",
    "clearSelectionButton",
    "densityNote",
    "csvInput",
    "loadRegionSample",
    "loadProvinceSample",
    "loadBarangaySample",
    "keyColumnSelect",
    "valueColumnSelect",
    "matchSummary",
    "exportIssuesButton",
    "paletteSelect",
    "contrastNote",
    "classificationSelect",
    "customThresholdsInput",
    "binsInput",
    "binsOutput",
    "borderColorInput",
    "borderWidthInput",
    "missingColorInput",
    "highlightColorInput",
    "backgroundColorInput",
    "transparentInput",
    "layoutTitleInput",
    "layoutSubtitleInput",
    "sourceNoteInput",
    "showLayoutTextInput",
    "exportWidthInput",
    "exportHeightInput",
    "saveProjectButton",
    "loadProjectButton",
    "projectInput",
    "activePath",
    "mapTitle",
    "sourceStatus",
    "mapStage",
    "mapSvg",
    "mapTooltip",
    "selectionDetails",
    "reviewTable", "loadExampleValues", "downloadTemplateButton", "labelColumnSelect", "labelModeSelect", "labelSizeInput",
    "showMapLegendInput", "statisticLabelInput", "zoomInButton", "zoomOutButton", "retryBoundariesButton",
    "selectedPlaceLabel", "selectedPlaceValue", "applyPlaceButton", "resetPlaceButton", "drilldownButton", "editStatus", "labelStatus"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function populateStaticControls() {
  el.paletteSelect.innerHTML = Object.entries(PALETTES)
    .map(([id, palette]) => `<option value="${id}">${escapeHtml(palette.label)}</option>`)
    .join("");
}

function bindEvents() {
  el.scopeSelect.addEventListener("change", () => {
    state.scopeId = el.scopeSelect.value;
    el.areaFilterInput.value = "";
    const scope = getScope();
    if (!scope.allowedLevels.includes(state.level)) {
      state.level = scope.preferredLevel;
    }
    state.selectedCode = null;
    render();
  });

  el.levelSelect.addEventListener("change", () => {
    state.level = el.levelSelect.value;
    state.selectedCode = null;
    render();
  });

  el.boundarySourceSelect.addEventListener("change", () => {
    state.boundarySource = el.boundarySourceSelect.value;
    state.scopeId = "PH";
    state.selectedCode = null;
    render();
  });

  el.geographySearchInput.addEventListener("change", selectSearchedGeography);
  el.geographySearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); selectSearchedGeography(); }
  });
  el.geographySearchInput.addEventListener("input", updateGeographySuggestions);

  el.fitMapButton.addEventListener("click", () => {
    mapViewBox = null;
    state.selectedCode = null;
    render();
  });

  el.clearSelectionButton.addEventListener("click", () => {
    state.selectedCode = null;
    render();
    el.fitMapButton.focus();
  });

  el.csvInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!parseCsv(text).rows.length) { el.dataKindNotice.textContent = "This CSV has no data rows. Choose a file with place codes and statistics."; return; }
      if (!await confirmDataReplacement()) return;
      parseImportedCsv(text, { projectName: file.name.replace(/\.csv$/i, ""), sourceNote: "Statistics from your imported CSV. Boundaries: PSA / NAMRIA, 2023 snapshot; incomplete coverage." });
      render();
    } catch { el.dataKindNotice.textContent = "Could not read this CSV. Choose a readable CSV file and try again."; }
    finally { el.csvInput.value = ""; }
  });

  el.loadRegionSample.addEventListener("click", async () => {
    if (!await confirmDataReplacement()) return;
    parseImportedCsv(SAMPLE_REGION_CSV, { boundarySource: "fixture", scopeId: "PH", level: "region", projectName: "Regional sample map", sourceNote: "Illustrative statistics and demonstration shapes. Not population observations or real boundaries." });
    render();
  });

  el.loadProvinceSample.addEventListener("click", async () => {
    if (!await confirmDataReplacement()) return;
    parseImportedCsv(SAMPLE_PROVINCE_CSV, { boundarySource: "fixture", scopeId: "PH", level: "province", projectName: "Province sample map", sourceNote: "Illustrative statistics and demonstration shapes. Not population observations or real boundaries." });
    render();
  });

  el.loadBarangaySample.addEventListener("click", async () => {
    if (!await confirmDataReplacement()) return;
    parseImportedCsv(SAMPLE_BARANGAY_CSV, {
      boundarySource: "fixture",
      scopeId: "CITY-137404",
      level: "barangay",
      projectName: "Quezon City barangay sample",
      sourceNote: "Illustrative statistics and demonstration shapes. Not population observations or real boundaries."
    });
    render();
  });

  el.keyColumnSelect.addEventListener("change", () => {
    state.keyColumn = el.keyColumnSelect.value;
    render();
  });

  el.valueColumnSelect.addEventListener("change", () => {
    state.valueColumn = el.valueColumnSelect.value;
    render();
  });

  el.loadExampleValues.addEventListener("click", async () => {
    const features = [...new Map(getVisibleFeatures().map((feature) => [feature.code, feature])).values()];
    if (!features.length) return;
    if (!await confirmDataReplacement()) return;
    const rows = features.map((feature, index) => ({ psgc_code: feature.code, name: feature.name,
      value: 20 + (index * 137) % 1000, label: "" }));
    parseImportedCsv(rowsToCsv(["psgc_code", "name", "value", "label"], rows), { projectName: `${getScope().name}: illustrative statistics` });
    state.sourceNote = `Illustrative values, not demographic observations. PSA / NAMRIA boundaries: ${state.boundaryMetadata.snapshot || "sample"}.`;
    render();
  });
  el.downloadTemplateButton.addEventListener("click", () => {
    const features = [...new Map(getVisibleFeatures().map((feature) => [feature.code, feature])).values()];
    const rows = features.map((feature) => ({ psgc_code: feature.code, name: feature.name, value: "", label: "" }));
    downloadBlob(new Blob([rowsToCsv(["psgc_code", "name", "value", "label"], rows)], { type: "text/csv;charset=utf-8" }), `${slugify(getScope().name)}-${state.level}-template.csv`);
  });
  for (const [id, key] of [["labelModeSelect", "labelMode"], ["labelColumnSelect", "labelColumn"], ["statisticLabelInput", "statisticLabel"]]) {
    el[id].addEventListener(id === "statisticLabelInput" ? "input" : "change", () => { state[key] = el[id].value; render(); });
  }
  el.labelSizeInput.addEventListener("input", () => { state.labelSize = clamp(Number(el.labelSizeInput.value), 6, 24); render(); });
  el.showMapLegendInput.addEventListener("change", () => { state.showMapLegend = el.showMapLegendInput.checked; render(); });
  el.zoomInButton.addEventListener("click", () => zoomMap(0.65));
  el.zoomOutButton.addEventListener("click", () => zoomMap(1 / 0.65));
  el.retryBoundariesButton.addEventListener("click", async () => {
    const boundaries = loadGeneratedBoundaryFeatures();
    render();
    await boundaries;
    mapViewBox = null;
    render();
  });
  el.applyPlaceButton.addEventListener("click", () => {
    const feature = state.selectedCode ? featureByCode(state.selectedCode) : getVisibleFeatures()[0];
    if (!feature) return;
    const value = el.selectedPlaceValue.value.trim();
    if (value && !Number.isFinite(parseValue(value))) { el.editStatus.textContent = "Enter a number, or leave the statistic blank."; return; }
    state.placeOverrides[feature.code] = { label: el.selectedPlaceLabel.value.trim(), value };
    workspaceUi.drafts.delete(feature.code);
    if (state.labelMode === "none") state.labelMode = "both";
    state.selectedCode = feature.code;
    render();
    el.editStatus.textContent = "Changes applied. Save your project to keep them.";
  });
  el.resetPlaceButton.addEventListener("click", () => {
    const feature = state.selectedCode ? featureByCode(state.selectedCode) : getVisibleFeatures()[0];
    if (feature) delete state.placeOverrides[feature.code];
    if (feature) workspaceUi.drafts.delete(feature.code);
    render();
    el.editStatus.textContent = joinHasCsvValue(feature?.code) ? "Using the imported CSV again." : "Place edit cleared.";
  });
  el.drilldownButton.addEventListener("click", () => {
    const feature = state.selectedCode ? featureByCode(state.selectedCode) : getVisibleFeatures()[0];
    if (!feature || feature.level === "barangay") return;
    const scope = getScopes().find((item) => item.type === feature.level && item.code === feature.code);
    if (!scope) return;
    state.scopeId = scope.id;
    state.level = feature.level === "region" ? "province" : feature.level === "province" ? "city" : "barangay";
    state.selectedCode = null;
    render();
    setActivePanel("places", { focus: true });
  });
  bindMapNavigation();

  el.paletteSelect.addEventListener("change", () => {
    state.palette = el.paletteSelect.value;
    state.customColors = [];
    render();
  });

  el.classificationSelect.addEventListener("change", () => {
    state.classification = el.classificationSelect.value;
    render();
  });

  el.customThresholdsInput.addEventListener("input", () => {
    state.customThresholds = el.customThresholdsInput.value;
    render();
  });

  el.binsInput.addEventListener("input", () => {
    state.bins = Number(el.binsInput.value);
    render();
  });

  [
    ["borderColorInput", "borderColor"],
    ["missingColorInput", "missingColor"],
    ["highlightColorInput", "highlightColor"],
    ["backgroundColorInput", "backgroundColor"]
  ].forEach(([inputId, key]) => {
    el[inputId].addEventListener("input", () => {
      state[key] = el[inputId].value;
      render();
    });
  });

  el.borderWidthInput.addEventListener("input", () => {
    state.borderWidth = clamp(Number(el.borderWidthInput.value), 0, 8);
    render();
  });

  el.transparentInput.addEventListener("change", () => {
    state.transparent = el.transparentInput.checked;
    render();
  });

  [
    ["layoutTitleInput", "layoutTitle"],
    ["layoutSubtitleInput", "layoutSubtitle"],
    ["sourceNoteInput", "sourceNote"]
  ].forEach(([inputId, key]) => {
    el[inputId].addEventListener("input", () => {
      state[key] = el[inputId].value;
      render();
    });
  });

  el.showLayoutTextInput.addEventListener("change", () => {
    state.showLayoutText = el.showLayoutTextInput.checked;
    render();
  });

  el.exportWidthInput.addEventListener("input", () => {
    state.exportWidth = clamp(Number(el.exportWidthInput.value), 640, 5000);
  });

  el.exportHeightInput.addEventListener("input", () => {
    state.exportHeight = clamp(Number(el.exportHeightInput.value), 640, 5000);
  });

  el.exportIssuesButton.addEventListener("click", exportImportIssues);
  el.saveProjectButton.addEventListener("click", saveProject);
  el.loadProjectButton.addEventListener("click", () => el.projectInput.click());
  el.projectInput.addEventListener("change", loadProject);
}

function parseImportedCsv(text, overrides = {}) {
  const parsed = parseCsv(text);
  Object.assign(state, overrides);
  if (overrides.projectName) {
    state.layoutTitle = overrides.projectName;
  }
  state.importedRows = parsed.rows;
  state.columns = parsed.columns;
  state.keyColumn = chooseColumn(parsed.columns, ["psgc_code", "psgc", "code"], parsed.columns[0] || "psgc_code");
  state.valueColumn = chooseNumericColumn(parsed.rows, parsed.columns) || chooseColumn(parsed.columns, ["value", "count", "rate"], parsed.columns[1] || parsed.columns[0] || "value");
  state.labelColumn = chooseColumn(parsed.columns, ["label", "annotation", "note"], "");
  state.placeOverrides = {};
  state.selectedCode = null;
  resetWorkspaceEdits();
  if (el.areaFilterInput) el.areaFilterInput.value = "";
}

function render() {
  const scope = getScope();
  if (!scope.allowedLevels.includes(state.level)) {
    state.level = scope.preferredLevel;
  }
  maybeLoadGeneratedBarangaysForScope();
  const features = getVisibleFeatures(), join = buildJoin();
  syncControls(join, features);
  renderMap(features, join);
  renderSelection(join, features);
  renderMatchSummary(join);
  renderReviewTable(join);
  renderHeader(features);
  renderWorkspace(join, features);
}

function syncControls(join = buildJoin(), visibleFeatures = getVisibleFeatures()) {
  const scope = getScope();
  filterAreaOptions();
  el.levelSelect.innerHTML = LEVELS.map((level) => {
    const disabled = scope.allowedLevels.includes(level.id) ? "" : " disabled";
    return `<option value="${level.id}"${disabled}>${escapeHtml(level.label)}</option>`;
  }).join("");
  el.levelSelect.value = state.level;
  el.boundarySourceSelect.value = state.boundarySource;
  updateGeographySuggestions();

  syncColumnSelect(el.keyColumnSelect, state.keyColumn);
  syncColumnSelect(el.valueColumnSelect, state.valueColumn);
  el.labelColumnSelect.innerHTML = `<option value="">No CSV label</option>` + state.columns.map((column) => `<option value="${escapeAttr(column)}">${escapeHtml(column)}</option>`).join("");
  el.labelColumnSelect.value = state.labelColumn;
  el.labelModeSelect.value = state.labelMode;
  el.labelSizeInput.value = state.labelSize;
  el.showMapLegendInput.checked = state.showMapLegend;
  el.retryBoundariesButton.hidden = state.generatedBoundaryStatus === "ready" && !failedBarangayScopes.size;
  el.statisticLabelInput.value = state.statisticLabel;
  el.downloadTemplateButton.disabled = !visibleFeatures.length;
  el.loadExampleValues.disabled = !visibleFeatures.length;

  el.paletteSelect.value = state.palette;
  el.classificationSelect.value = state.classification;
  el.customThresholdsInput.value = state.customThresholds;
  el.binsInput.value = state.bins;
  el.binsOutput.value = String(state.bins);
  el.borderColorInput.value = state.borderColor;
  el.borderWidthInput.value = state.borderWidth;
  el.missingColorInput.value = state.missingColor;
  el.highlightColorInput.value = state.highlightColor;
  el.backgroundColorInput.value = state.backgroundColor;
  el.transparentInput.checked = state.transparent;
  el.layoutTitleInput.value = state.layoutTitle;
  el.layoutSubtitleInput.value = state.layoutSubtitle;
  el.sourceNoteInput.value = state.sourceNote;
  el.showLayoutTextInput.checked = state.showLayoutText;
  el.exportWidthInput.value = state.exportWidth;
  el.exportHeightInput.value = state.exportHeight;
  el.exportIssuesButton.disabled = join.issueRows.length === 0;
  el.contrastNote.textContent = contrastWarning();
}

function selectSearchedGeography() {
  const query = el.geographySearchInput.value.trim().toLowerCase();
  const features = getAdminFeatures();
  let feature = features.find((item) => item.code.toLowerCase() === query);
  if (!feature) {
    const matches = [...new Map(features.filter((item) => item.name.toLowerCase() === query).map((item) => [item.code, item])).values()];
    if (matches.length > 1) {
      const message = "Several places share this name. Choose a place code from the suggestions.";
      el.densityNote.textContent = message;
      if (el.searchStatus) el.searchStatus.textContent = message;
      return;
    }
    feature = matches[0];
  }
  if (!feature) { if (el.searchStatus) el.searchStatus.textContent = "No exact match. Choose a suggestion, or open an area first to search its barangays."; return; }
  state.level = feature.level;
  state.scopeId = scopeIdForFeature(feature);
  state.selectedCode = feature.code;
  workspaceUi.observedSelection = null;
  el.geographySearchInput.value = "";
  if (el.searchStatus) el.searchStatus.textContent = "";
  if (el.areaFilterInput) el.areaFilterInput.value = "";
  render();
}

function scopeIdForFeature(feature) {
  const scopes = getScopes();
  if (feature.level === "barangay") return scopes.find((scope) => scope.type === "city" && scope.code === feature.cityCode)?.id || state.scopeId;
  if (feature.level === "city") return scopes.find((scope) => scope.type === "province" && scope.code === feature.provinceCode)?.id || scopes.find((scope) => scope.type === "region" && scope.code === feature.regionCode)?.id || "PH";
  if (feature.level === "province") return scopes.find((scope) => scope.type === "region" && scope.code === feature.regionCode)?.id || "PH";
  return "PH";
}

function updateGeographySuggestions() {
  const query = el.geographySearchInput.value.trim().toLowerCase();
  const seen = new Set(), matches = [];
  for (const feature of getAdminFeatures()) {
    if (seen.has(feature.code) || (query ? !`${feature.code} ${feature.name}`.toLowerCase().includes(query) : !featureMatchesLevel(feature, state.level))) continue;
    seen.add(feature.code);
    matches.push(feature);
    if (matches.length >= 80) break;
  }
  el.geographyOptions.innerHTML = matches.map((feature) => `<option value="${escapeAttr(feature.code)}">${escapeHtml(feature.name)} · ${escapeHtml(placeTypeLabel(feature))} · ${escapeHtml(featurePath(feature))}</option>`).join("");
  if (el.searchStatus) el.searchStatus.textContent = query && !matches.length ? "No results in the available places. Open an area to load its barangays." : "";
}

function syncColumnSelect(select, selected) {
  const options = state.columns.length ? state.columns : ["psgc_code", "value"];
  select.innerHTML = options.map((column) => `<option value="${escapeAttr(column)}">${escapeHtml(column)}</option>`).join("");
  if (options.includes(selected)) {
    select.value = selected;
  }
}

function contrastWarning() {
  if (state.transparent) return "";
  if (contrastRatio(state.missingColor, state.backgroundColor) < 1.2) {
    return "Missing-data color is very close to the background.";
  }
  if (contrastRatio(state.borderColor, state.backgroundColor) < 1.2) {
    return "Boundary strokes may be hard to see against the background.";
  }
  return "";
}

function renderHeader(visibleFeatures) {
  const scope = getScope();
  const levelLabel = LEVELS.find((level) => level.id === state.level)?.label || state.level;
  el.activePath.textContent = `${scope.name} / ${levelLabel}`;
  el.mapTitle.textContent = state.projectName || "Untitled demographic map";
  el.sourceStatus.textContent = getBoundarySourceLabel();

  const visibleCount = visibleFeatures.length;
  const metadata = state.boundarySource === "generated" ? boundaryMetadataText() : "";
  if (state.generatedBarangayMessage && state.boundarySource === "generated" && state.level === "barangay") {
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible. ${state.generatedBarangayMessage}${metadata}`;
  } else if (state.generatedBoundaryStatus === "error") {
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible. ${state.generatedBoundaryMessage}`;
  } else {
    const generatedNote = state.boundarySource === "generated" ? ` Source: normalized GeoJSON.${metadata}` : "";
    el.densityNote.textContent = `${new Set(visibleFeatures.map((feature) => feature.code)).size.toLocaleString()} mapped codes · ${visibleCount.toLocaleString()} geometry records.${generatedNote}`;
  }
}

function boundaryMetadataText() {
  const metadata = state.boundaryMetadata || {};
  const parts = [
    metadata.releaseTag ? ` Release ${metadata.releaseTag}.` : "",
    metadata.snapshot ? ` PSGC snapshot ${metadata.snapshot}.` : "",
    metadata.namriaVersion ? ` NAMRIA ${metadata.namriaVersion}.` : "",
    metadata.detailSource ? ` Detailed barangay borders preserve original ${metadata.detailVersion} vertices from a pinned community mirror: ${metadata.detailSource}. Overview borders remain simplified.` : "",
    metadata.caveat ? ` ${metadata.caveat}` : ""
  ];
  return parts.join("");
}

function renderMap(visibleFeatures, join) {
  const focusedLayoutItem = document.activeElement?.closest?.("[data-layout-item]")?.getAttribute("data-layout-item");
  cancelMapGesture?.();
  hideTooltip();
  clearTimeout(mapLabelTimer);
  mapLabelTimer = null;
  const changedFeatures = renderedFeatures !== visibleFeatures;
  renderedFeatures = visibleFeatures;
  renderedValues = join.valueByCode;
  renderedJoin = join;
  const scale = buildScale(visibleFeatures, join.valueByCode);
  renderedScale = scale;
  if (visibleFeatures.length > 3000) {
    if (changedFeatures || !mapSpatialIndex) mapSpatialIndex = createMapSpatialIndex(visibleFeatures, cachedFeatureGeometry);
  } else mapSpatialIndex = null;
  batchedViewport = null;
  const bounds = boundsFromFeatures(visibleFeatures);
  const padding = Math.max(0.001, Math.min(bounds.width, bounds.height) * 0.08);
  const titlePad = state.showLayoutText ? Math.max(bounds.width * 0.09, bounds.height * 0.12) : 0;
  const notePad = state.showLayoutText ? Math.max(bounds.width * 0.05, bounds.height * 0.08) : 0;
  const contentViewBox = [
    bounds.minX - padding,
    bounds.minY - padding - titlePad,
    Math.max(0.001, bounds.width + padding * 2),
    Math.max(0.001, bounds.height + padding * 2 + titlePad + notePad)
  ];
  const rect = el.mapSvg.getBoundingClientRect();
  const canvasSize = { width: rect.width, height: rect.height };
  const fittedViewBox = rect.width > 0 && rect.height > 0 ? fitExportViewBox(contentViewBox, rect.width, rect.height) : contentViewBox;
  const key = `${state.boundarySource}:${state.scopeId}:${state.level}:${visibleFeatures.length}`;
  if (!mapViewBox || mapViewKey !== key) mapViewBox = fittedViewBox;
  else if (mapCanvasSize && rect.width > 0 && rect.height > 0 && (rect.width !== mapCanvasSize.width || rect.height !== mapCanvasSize.height)) {
    cancelMapGesture?.();
    mapViewBox = mapBoxForCanvas(fittedViewBox, canvasSize);
  }
  mapContentViewBox = contentViewBox;
  mapFittedViewBox = fittedViewBox;
  if (rect.width > 0 && rect.height > 0) mapCanvasSize = canvasSize;
  mapViewKey = key;
  const viewBox = mapViewBox;
  mapLayoutViewBox = [...viewBox];

  el.mapSvg.setAttribute("viewBox", viewBox.join(" "));
  el.mapSvg.innerHTML = "";

  if (!state.transparent) {
    const rect = createSvgElement("rect", {
      class: "map-background",
      x: viewBox[0],
      y: viewBox[1],
      width: viewBox[2],
      height: viewBox[3],
      fill: state.backgroundColor
    });
    el.mapSvg.appendChild(rect);
  }

  if (!visibleFeatures.length) {
    const text = createSvgElement("text", {
      x: viewBox[0] + viewBox[2] / 2,
      y: viewBox[1] + viewBox[3] / 2,
      "text-anchor": "middle",
      fill: "#667066",
      "font-size": 18
    });
    text.textContent = "No features in this scope";
    el.mapSvg.appendChild(text);
    return;
  }

  const definitions = createSvgElement("defs", {});
  const clip = createSvgElement("clipPath", { id: "map-viewport-clip", clipPathUnits: "userSpaceOnUse" });
  clip.appendChild(createSvgElement("rect", { class: "map-viewport-clip", x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] }));
  definitions.appendChild(clip);
  el.mapSvg.appendChild(definitions);
  const geography = createSvgElement("g", { class: "map-geography", "clip-path": "url(#map-viewport-clip)" });
  el.mapSvg.appendChild(geography);

  if (state.boundarySource !== "generated") {
    geography.appendChild(createSvgElement("path", { d: visibleFeatures.map(pathFromFeature).join(" "),
      fill: "rgba(32, 35, 31, 0.08)", "fill-rule": "evenodd", transform: "translate(7 9)" }));
  }

  const fragment = document.createDocumentFragment();
  if (mapSpatialIndex) renderBatchedGeography(geography);
  else visibleFeatures.forEach((feature, record) => {
    const featureValue = join.valueByCode.get(feature.code);
    const selected = state.selectedCode === feature.code;
    const group = createSvgElement("g", {
      class: `map-feature${selected ? " is-selected" : ""}`,
      "data-code": feature.code,
      "data-record": record,
      tabindex: visibleFeatures.length > 3000 ? -1 : 0,
      role: "button",
      "aria-label": `${feature.name}, ${placeTypeLabel(feature)}, ${/^\d{10}$/.test(feature.code) && feature.matchStatus !== "unmatched" ? "PSGC code" : "Source identifier"} ${feature.code}. Press Enter for details and editing.`
    });

    const path = createSvgElement("path", {
      d: mapGeometryPath(feature),
      fill: getFeatureFill(feature, featureValue, scale),
      "fill-rule": "evenodd",
      stroke: selected ? state.highlightColor : state.borderColor,
      "stroke-width": selected ? state.borderWidth + 1.4 : state.borderWidth,
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke"
    });
    group.appendChild(path);

    fragment.appendChild(group);
  });
  geography.appendChild(fragment);
  renderPlaceLabels(visibleFeatures, join, viewBox, geography);
  const layout = createSvgElement("g", { class: "map-layout" });
  el.mapSvg.appendChild(layout);
  renderNavigationLayout(focusedLayoutItem);
}

function cachedFeatureGeometry(feature) {
  if (!featureRenderCache.has(feature)) featureRenderCache.set(feature, { bounds: boundsFromFeatures([feature]) });
  return featureRenderCache.get(feature);
}

function mapGeometryPath(feature, batch = false) {
  const cached = cachedFeatureGeometry(feature), key = batch ? "batchPath" : "path";
  return cached[key] ??= batch ? batchPathFromFeature(feature) : pathFromFeature(feature);
}

function renderBatchedGeography(geography = el.mapSvg.querySelector(".map-geography")) {
  if (!mapSpatialIndex || !geography) return;
  const [x, y, width, height] = mapViewBox;
  if (batchedViewport && x >= batchedViewport.minX && y >= batchedViewport.minY && x + width <= batchedViewport.maxX && y + height <= batchedViewport.maxY && width * 4 >= batchedViewport.maxX - batchedViewport.minX) return;
  batchedViewport = { minX: x - width / 2, minY: y - height / 2, maxX: x + width * 1.5, maxY: y + height * 1.5 };
  geography.replaceChildren();
  const batches = new Map(), selected = [];
  renderedBatchOrder = new Map();
  for (const item of mapSpatialIndex.query(batchedViewport).sort((a, b) => a.record - b.record)) {
    if (item.feature.code === state.selectedCode) { selected.push(item); continue; }
    const color = getFeatureFill(item.feature, renderedValues.get(item.feature.code), renderedScale);
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color).push(item.feature);
  }
  for (const [color, features] of batches) {
    renderedBatchOrder.set(color, renderedBatchOrder.size);
    geography.appendChild(createSvgElement("path", {
    class: "map-batch", d: features.map((feature) => mapGeometryPath(feature, true)).join(" "), fill: color, "fill-rule": "nonzero",
    stroke: state.borderColor, "stroke-width": state.borderWidth, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke", "data-feature-count": features.length
    }));
  }
  for (const { feature, record } of selected) {
    const group = createSvgElement("g", { class: "map-feature is-selected", "data-code": feature.code, "data-record": record, tabindex: 0, role: "button", "aria-label": `${feature.name}. Press Enter for details and editing.` });
    group.appendChild(createSvgElement("path", { d: mapGeometryPath(feature), fill: getFeatureFill(feature, renderedValues.get(feature.code), renderedScale), "fill-rule": "evenodd", stroke: state.highlightColor, "stroke-width": state.borderWidth + 1.4, "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke" }));
    geography.appendChild(group);
  }
}

function mapFeatureFromEvent(event) {
  const group = event.target.closest?.(".map-feature");
  if (group) return renderedFeatures[Number(group.dataset.record)];
  if (!mapSpatialIndex || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
  const rect = el.mapSvg.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return null;
  const point = mapPointFromClient(event.clientX, event.clientY);
  return point ? mapSpatialIndex.hit(point, ({ feature }) => feature.code === state.selectedCode ? Infinity : renderedBatchOrder.get(getFeatureFill(feature, renderedValues.get(feature.code), renderedScale)) || 0)?.feature : null;
}

function customLabelForFeature(feature, join) {
  const override = state.placeOverrides[feature.code];
  return override && Object.hasOwn(override, "label") ? override.label : String(join.importedRowByCode.get(feature.code)?.[state.labelColumn] || "");
}

function renderPlaceLabels(features, join, viewBox, target = el.mapSvg) {
  if (state.labelMode === "none") { el.labelStatus.textContent = "Choose a label display, then zoom in for small places."; return; }
  const fontSize = viewBox[2] * state.labelSize / 900;
  const candidates = features.filter((feature) => {
    const b = cachedFeatureGeometry(feature).bounds;
    return b.maxX >= viewBox[0] && b.minX <= viewBox[0] + viewBox[2] && b.maxY >= viewBox[1] && b.minY <= viewBox[1] + viewBox[3] && (feature.code === state.selectedCode || b.width * b.height > fontSize * fontSize * 3);
  }).sort((a, b) => (b.code === state.selectedCode) - (a.code === state.selectedCode) ||
    cachedFeatureGeometry(b).bounds.width * cachedFeatureGeometry(b).bounds.height - cachedFeatureGeometry(a).bounds.width * cachedFeatureGeometry(a).bounds.height);
  const boxes = [], seen = new Set();
  let shown = 0;
  for (const feature of candidates.slice(0, 1000)) {
    if (seen.has(feature.code)) continue;
    seen.add(feature.code);
    const cache = cachedFeatureGeometry(feature);
    if (!Object.hasOwn(cache, "labelPoint")) cache.labelPoint = labelPointForFeature(feature);
    if (!cache.labelPoint) continue;
    const options = { point: cache.labelPoint, fontSize, showName: ["name", "both"].includes(state.labelMode),
      showValue: ["value", "both"].includes(state.labelMode), customLabel: customLabelForFeature(feature, join) };
    const value = join.valueByCode.get(feature.code), lines = formatFeatureLabel(feature, value, options);
    if (!lines.length) continue;
    const width = Math.max(...lines.map((line) => line.length)) * fontSize * 0.58, height = lines.length * fontSize * 1.25;
    const box = { x: cache.labelPoint.x - width / 2, y: cache.labelPoint.y - height / 2, width, height };
    if (feature.code !== state.selectedCode && boxes.some((other) => box.x < other.x + other.width && box.x + width > other.x && box.y < other.y + other.height && box.y + height > other.y)) continue;
    const label = createFeatureLabel(feature, value, options);
    if (label) { target.appendChild(label); boxes.push(box); shown += 1; }
    if (shown >= 200) break;
  }
  el.labelStatus.textContent = `${shown} labels shown. Overlaps are hidden; zoom or choose a smaller scope to reveal more.`;
}

function renderMapLegend(scale, features, join, viewBox, target = el.mapSvg) {
  if (!state.showMapLegend) return;
  const entries = legendEntries(scale, features, join);
  if (!entries.length) return;
  const unit = layoutUnitsPerPixel(viewBox), size = 12 * unit * state.legendScale, padding = size * 0.8;
  const maxWidth = Math.min(viewBox[2] * 0.85, 260 * unit), maxChars = Math.max(8, Math.floor((maxWidth - padding * 2 - size * 2.8) / (size * 0.58)));
  const heading = state.legendTitle.trim() || (state.statisticLabel.trim().toLowerCase() === "value" ? "Statistic" : state.statisticLabel.trim()) || "Statistic";
  const titleLines = wrapLayoutText(heading, maxChars + 3);
  const rows = entries.map((entry) => ({ ...entry, lines: wrapLayoutText(entry.label, maxChars) }));
  const width = Math.min(maxWidth, Math.max(...titleLines.map((line) => line.length * size * 0.62 + padding * 2), ...rows.flatMap((row) => row.lines.map((line) => line.length * size * 0.58 + padding * 2 + size * 2.8))));
  const height = padding * 2 + titleLines.length * size * 1.25 + size * 0.5 + rows.reduce((sum, row) => sum + Math.max(1.5, row.lines.length * 1.2 + 0.3) * size, 0);
  const legend = createSvgElement("g", { class: "map-export-legend", "font-family": "Segoe UI, Arial, sans-serif", "font-size": size, fill: state.legendTextColor });
  legend.appendChild(createSvgElement("rect", { x: 0, y: 0, width, height, rx: size * 0.4, fill: state.legendBackgroundColor, "fill-opacity": state.legendBackgroundOpacity }));
  let top = padding;
  titleLines.forEach((line) => { const text = createSvgElement("text", { x: padding, y: top + size, "font-weight": 700 }); text.textContent = line; legend.appendChild(text); top += size * 1.25; });
  top += size * 0.5;
  rows.forEach((row) => {
    legend.appendChild(createSvgElement("rect", { x: padding, y: top, width: size * 2, height: size * 1.2, fill: row.color }));
    row.lines.forEach((line, index) => { const text = createSvgElement("text", { x: padding + size * 2.8, y: top + size * (1 + index * 1.2) }); text.textContent = line; legend.appendChild(text); });
    top += Math.max(1.5, row.lines.length * 1.2 + 0.3) * size;
  });
  const canvasWidth = el.mapSvg.getBoundingClientRect().width;
  const textBottom = [...target.querySelectorAll('[data-layout-item="title"], [data-layout-item="subtitle"]')].reduce((bottom, node) => {
    const metrics = layoutItemMetrics.get(node);
    return Math.max(bottom, Number(node.getAttribute("data-layout-y")) + (metrics?.height || 0) / viewBox[3]);
  }, 0);
  addLayoutItem("legend", legend, viewBox, target, { width, height }, { x: 0.96 - width / viewBox[2], y: canvasWidth < 600 ? Math.max(0.14, textBottom + 0.035) : 0.045 });
}

function legendEntries(scale, features, join) {
  const values = [...new Set(features.map((feature) => feature.code))].map((code) => join.valueByCode.get(code)).filter(Number.isFinite);
  const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 0;
  const entries = values.length ? scale.colors.map((color, index) => {
    const automatic = state.classification === "highlight" ? "With statistic" : scale.labels?.length === scale.colors.length + 1
      ? `${scale.labels[index]} – ${scale.labels[index + 1]}` : formatNumber(min + (max - min) * index / Math.max(1, scale.colors.length - 1));
    return { color, label: state.legendLabels[index]?.trim() || automatic, autoLabel: automatic, index };
  }) : [];
  if (state.legendShowMissing && features.some((feature) => !Number.isFinite(join.valueByCode.get(feature.code)))) entries.push({ color: state.missingColor, label: state.legendMissingLabel.trim() || "No statistic", index: -1 });
  return entries;
}

function layoutUnitsPerPixel(viewBox) { return viewBox[2] / Math.max(1, el.mapSvg.getBoundingClientRect().width); }

function wrapLayoutText(text, length) {
  return String(text).split(/\r?\n/).flatMap((paragraph) => {
    const lines = [""];
    for (const word of paragraph.trim().split(/\s+/)) {
      const parts = word.match(new RegExp(`.{1,${Math.max(1, length)}}`, "gu")) || [""];
      for (const part of parts) {
        if (lines.at(-1) && lines.at(-1).length + part.length + 1 > length) lines.push(part);
        else lines[lines.length - 1] += (lines.at(-1) ? " " : "") + part;
      }
    }
    return lines;
  });
}

function addLayoutItem(id, group, viewBox, target, fallback, defaultPosition) {
  group.setAttribute("data-layout-item", id);
  group.setAttribute("class", `${group.getAttribute("class") || ""} layout-item${layoutEditor.selected === id ? " is-layout-selected" : ""}`.trim());
  target.appendChild(group);
  const measured = group.getBBox?.();
  const box = measured?.width > 0 && measured?.height > 0 ? measured : { x: 0, y: 0, ...fallback };
  const margin = 6 * layoutUnitsPerPixel(viewBox);
  const fit = Math.max(0.001, Math.min(1, (viewBox[2] - margin * 2) / box.width, (viewBox[3] - margin * 2) / box.height));
  layoutItemMetrics.set(group, { box, fit, width: box.width * fit, height: box.height * fit, viewBox });
  positionLayoutItem(group, state.layoutPositions[id] || defaultPosition);
  if (layoutEditor.enabled) {
    group.setAttribute("tabindex", "0"); group.setAttribute("role", "button");
    group.setAttribute("aria-label", `Move ${id === "source" ? "source note" : id}. Arrow keys move; Shift moves farther.`);
    group.appendChild(createSvgElement("rect", { "data-editor-only": "true", class: "layout-edit-outline", x: box.x, y: box.y, width: box.width, height: box.height, fill: "transparent", stroke: "#2563b0", "stroke-width": 1.5 * layoutUnitsPerPixel(viewBox) / fit, "stroke-dasharray": `${4 * layoutUnitsPerPixel(viewBox) / fit} ${3 * layoutUnitsPerPixel(viewBox) / fit}` }));
  }
}

function positionLayoutItem(group, position) {
  const metrics = layoutItemMetrics.get(group);
  if (!metrics) return null;
  const { box, fit, width, height, viewBox: [x, y, canvasWidth, canvasHeight] } = metrics;
  const marginX = Math.min(0.02, 6 / Math.max(1, el.mapSvg.getBoundingClientRect().width));
  const marginY = marginX * canvasWidth / canvasHeight;
  const next = { x: clamp(position.x, marginX, Math.max(marginX, 1 - width / canvasWidth - marginX)), y: clamp(position.y, marginY, Math.max(marginY, 1 - height / canvasHeight - marginY)) };
  group.setAttribute("transform", `translate(${x + next.x * canvasWidth} ${y + next.y * canvasHeight}) scale(${fit}) translate(${-box.x} ${-box.y})`);
  group.setAttribute("data-layout-x", next.x); group.setAttribute("data-layout-y", next.y);
  return next;
}

function selectLayoutItem(id) {
  if (!["legend", "title", "subtitle", "source"].includes(id)) return;
  layoutEditor.selected = id;
  el.mapSvg.querySelectorAll("[data-layout-item]").forEach((group) => group.classList.toggle("is-layout-selected", group.getAttribute("data-layout-item") === id));
  syncLayoutControls();
}

function setLayoutEditMode(enabled) {
  cancelMapGesture?.();
  layoutEditor.enabled = Boolean(enabled);
  hideTooltip();
  if (enabled) closeWorkspacePanel();
  el.mapSvg.classList.toggle("is-arranging", layoutEditor.enabled);
  renderNavigationLayout();
  if (enabled && !el.mapSvg.querySelector(`[data-layout-item="${layoutEditor.selected}"]`)) {
    const first = el.mapSvg.querySelector("[data-layout-item]");
    if (first) selectLayoutItem(first.getAttribute("data-layout-item"));
    else { layoutEditor.enabled = false; el.mapSvg.classList.remove("is-arranging"); }
  }
  syncLayoutControls();
  if (layoutEditor.enabled) el.mapSvg.querySelector(`[data-layout-item="${layoutEditor.selected}"]`)?.focus?.();
}

function moveLayoutItem(id, position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  const group = el.mapSvg.querySelector(`[data-layout-item="${id}"]`);
  if (!group) return;
  const next = positionLayoutItem(group, position);
  if (next) state.layoutPositions[id] = next;
  selectLayoutItem(id);
}

function setLayoutPreset(id, preset) {
  const group = el.mapSvg.querySelector(`[data-layout-item="${id}"]`), metrics = group && layoutItemMetrics.get(group);
  if (!metrics) return;
  const width = metrics.width / metrics.viewBox[2], height = metrics.height / metrics.viewBox[3];
  const positions = { "top-left": { x: 0.025, y: 0.025 }, "top-right": { x: 0.975 - width, y: 0.025 }, "bottom-left": { x: 0.025, y: 0.975 - height }, "bottom-right": { x: 0.975 - width, y: 0.975 - height }, center: { x: (1 - width) / 2, y: (1 - height) / 2 } };
  if (positions[preset]) moveLayoutItem(id, positions[preset]);
}

function resetLayoutPositions() { cancelMapGesture?.(); state.layoutPositions = {}; renderNavigationLayout(); syncLayoutControls(); }

function mapBoxForCanvas(fittedBox, size) {
  const fitTolerance = mapFittedViewBox ? Math.min(mapFittedViewBox[2], mapFittedViewBox[3]) * 1e-7 : 0;
  if (!mapViewBox || !mapCanvasSize || !mapFittedViewBox || mapViewBox.every((value, index) => Math.abs(value - mapFittedViewBox[index]) <= fitTolerance)) return fittedBox;
  const [x, y, width, height] = mapViewBox;
  const unitsPerPixel = width / mapCanvasSize.width;
  const newWidth = size.width * unitsPerPixel, newHeight = size.height * unitsPerPixel;
  return [x + (width - newWidth) / 2, y + (height - newHeight) / 2, newWidth, newHeight];
}

function resizeMapViewport() {
  if (!mapViewBox || !mapContentViewBox) return;
  const { width, height } = el.mapSvg.getBoundingClientRect();
  if (width <= 0 || height <= 0 || (mapCanvasSize?.width === width && mapCanvasSize?.height === height)) return;
  cancelMapGesture?.();
  const fittedBox = fitExportViewBox(mapContentViewBox, width, height);
  const box = mapBoxForCanvas(fittedBox, { width, height });
  mapCanvasSize = { width, height };
  mapFittedViewBox = fittedBox;
  updateMapViewport(box);
  renderNavigationLayout();
  refreshNavigationLabels();
}

function renderNavigationLayout(focusedItem = document.activeElement?.closest?.("[data-layout-item]")?.getAttribute("data-layout-item")) {
  const layout = el.mapSvg.querySelector(".map-layout");
  if (!layout || !renderedJoin) return;
  layout.replaceChildren();
  layout.removeAttribute("transform");
  mapLayoutViewBox = [...mapViewBox];
  if (state.showLayoutText) renderLayoutText(mapViewBox, layout);
  renderMapLegend(renderedScale || buildScale(renderedFeatures, renderedValues), renderedFeatures, renderedJoin, mapViewBox, layout);
  el.mapSvg.classList.toggle("is-arranging", layoutEditor.enabled);
  if (layoutEditor.enabled && focusedItem) el.mapSvg.querySelector(`[data-layout-item="${focusedItem}"]`)?.focus?.();
}

function updateMapViewport(box) {
  mapViewBox = box;
  el.mapSvg.setAttribute("viewBox", box.join(" "));
  el.mapSvg.querySelectorAll(".map-background, .map-viewport-clip").forEach((node) => {
    ["x", "y", "width", "height"].forEach((key, index) => node.setAttribute(key, box[index]));
  });
  const layout = el.mapSvg.querySelector(".map-layout");
  if (layout && mapLayoutViewBox) {
    const [x, y, width, height] = mapLayoutViewBox;
    layout.setAttribute("transform", `translate(${box[0]} ${box[1]}) scale(${box[2] / width} ${box[3] / height}) translate(${-x} ${-y})`);
  }
  renderBatchedGeography();
}

function refreshNavigationLabels() {
  clearTimeout(mapLabelTimer);
  mapLabelTimer = null;
  const geography = el.mapSvg.querySelector(".map-geography");
  if (!geography || !renderedJoin) return;
  geography.querySelectorAll(".map-label").forEach((node) => node.remove());
  renderPlaceLabels(renderedFeatures, renderedJoin, mapViewBox, geography);
  maybeLoadViewportBoundaryDetail();
}

function mapPointFromClient(clientX, clientY) {
  const matrix = el.mapSvg.getScreenCTM();
  return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : null;
}

function zoomMap(factor, anchor = null) {
  if (!mapViewBox || !Number.isFinite(factor) || factor <= 0) return;
  const [x, y, width, height] = mapViewBox;
  const fittedWidth = mapFittedViewBox?.[2] || width;
  const newWidth = clamp(width * factor, Math.max(1e-9, fittedWidth / 4096), fittedWidth * 8);
  if (newWidth === width) return;
  const ratio = newWidth / width;
  const point = anchor || { x: x + width / 2, y: y + height / 2 };
  updateMapViewport([point.x - (point.x - x) * ratio, point.y - (point.y - y) * ratio, newWidth, height * ratio]);
  hideTooltip();
  clearTimeout(mapLabelTimer);
  mapLabelTimer = setTimeout(refreshNavigationLabels, 120);
}

function bindMapNavigation() {
  let drag = null, moved = false;
  const finishDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag, dragged = moved;
    if (event.type === "pointercancel") moved = true;
    drag = null;
    if (el.mapSvg.hasPointerCapture?.(event.pointerId)) el.mapSvg.releasePointerCapture(event.pointerId);
    el.mapSvg.classList.remove("is-panning");
    if (finished.layoutId) {
      if (event.type === "pointercancel") {
        if (finished.savedPosition) state.layoutPositions[finished.layoutId] = finished.savedPosition;
        else delete state.layoutPositions[finished.layoutId];
        renderNavigationLayout();
      }
      syncLayoutControls();
    } else if (dragged) refreshNavigationLabels();
  };
  cancelMapGesture = () => { if (drag) finishDrag({ pointerId: drag.id, type: "pointercancel" }); };
  const select = (event) => {
    if (event.type === "click" && moved) { moved = false; return; }
    if (layoutEditor.enabled) {
      const item = event.target.closest?.("[data-layout-item]");
      if (item) selectLayoutItem(item.getAttribute("data-layout-item"));
      return;
    }
    const feature = mapFeatureFromEvent(event);
    if (!feature) return;
    state.selectedCode = feature.code === state.selectedCode && workspaceUi.editorOpen ? null : feature.code;
    workspaceUi.observedSelection = null;
    render();
  };
  el.mapSvg.addEventListener("click", select);
  el.mapSvg.addEventListener("keydown", (event) => {
    if (layoutEditor.enabled && event.key === "Escape") { event.preventDefault(); event.stopPropagation?.(); setLayoutEditMode(false); return; }
    const item = event.target.closest?.("[data-layout-item]");
    if (layoutEditor.enabled && item && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation?.();
      const amount = event.shiftKey ? 0.05 : 0.01;
      moveLayoutItem(item.getAttribute("data-layout-item"), { x: Number(item.getAttribute("data-layout-x")) + (event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0), y: Number(item.getAttribute("data-layout-y")) + (event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0) });
      return;
    }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(event); }
  });
  el.mapSvg.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.isPrimary === false || !mapViewBox || drag) return;
    event.preventDefault();
    const item = event.target.closest?.("[data-layout-item]");
    if (layoutEditor.enabled) {
      if (!item) return;
      const layoutId = item.getAttribute("data-layout-item");
      selectLayoutItem(layoutId); item.focus?.();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, layoutId, position: { x: Number(item.getAttribute("data-layout-x")), y: Number(item.getAttribute("data-layout-y")) }, savedPosition: state.layoutPositions[layoutId] ? { ...state.layoutPositions[layoutId] } : null };
      moved = false; hideTooltip();
      return;
    }
    if (item) return;
    const matrix = el.mapSvg.getScreenCTM();
    if (!matrix) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, box: [...mapViewBox], inverse: matrix.inverse() };
    moved = false;
  });
  el.mapSvg.addEventListener("pointermove", (event) => {
    if (drag) {
      if (event.pointerId !== drag.id) return;
      if (!(event.buttons & 1)) { finishDrag(event); return; }
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4 && !moved) { moved = true; el.mapSvg.setPointerCapture(event.pointerId); if (!drag.layoutId) el.mapSvg.classList.add("is-panning"); }
      if (moved) {
        if (drag.layoutId) {
          const rect = el.mapSvg.getBoundingClientRect();
          moveLayoutItem(drag.layoutId, { x: drag.position.x + dx / rect.width, y: drag.position.y + dy / rect.height });
        } else {
          const matrix = drag.inverse;
          updateMapViewport([drag.box[0] - dx * matrix.a - dy * matrix.c, drag.box[1] - dx * matrix.b - dy * matrix.d, drag.box[2], drag.box[3]]);
        }
        hideTooltip();
      }
      return;
    }
    if (layoutEditor.enabled) { hideTooltip(); return; }
    const feature = mapFeatureFromEvent(event);
    if (feature) showTooltip(event, feature, renderedValues.get(feature.code), renderedJoin); else hideTooltip();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) el.mapSvg.addEventListener(type, finishDrag);
  el.mapSvg.addEventListener("dragstart", (event) => event.preventDefault());
  el.mapSvg.addEventListener("pointerleave", (event) => { hideTooltip(); if (!moved) finishDrag(event); });
  el.mapSvg.addEventListener("wheel", (event) => {
    if (!mapViewBox || !event.deltaY) return;
    event.preventDefault();
    if (drag) return;
    const point = mapPointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.mapSvg.getBoundingClientRect().height : 1);
    zoomMap(Math.exp(clamp(pixels, -240, 240) * 0.002), point);
  }, { passive: false });
  if (typeof ResizeObserver === "function") {
    let pendingResize = null;
    new ResizeObserver(() => {
      if (pendingResize !== null) return;
      pendingResize = requestAnimationFrame(() => { pendingResize = null; resizeMapViewport(); });
    }).observe(el.mapSvg);
  }
}

function renderLayoutText(viewBox, target = el.mapSvg) {
  const unit = layoutUnitsPerPixel(viewBox), width = viewBox[2], height = viewBox[3];
  const narrow = el.mapSvg.getBoundingClientRect().width < 600;
  let nextY = 0.025;
  for (const [id, content, baseSize, weight] of [["title", state.layoutTitle, 20, 800], ["subtitle", state.layoutSubtitle, 12, 400], ["source", state.sourceNote, 9, 400]]) {
    if (!content.trim()) continue;
    const size = baseSize * unit * state.layoutTextScale;
    const maxWidth = width * (id === "source" || narrow ? 0.9 : 0.62);
    const lines = wrapLayoutText(content.trim(), Math.max(8, Math.floor(maxWidth / (size * 0.6))));
    const group = createSvgElement("g", { "font-family": "Segoe UI, Arial, sans-serif", fill: state.layoutTextColor });
    lines.forEach((line, index) => {
      const text = createSvgElement("text", { x: 0, y: size * (1 + index * 1.25), "font-size": size, "font-weight": weight });
      text.textContent = line;
      group.appendChild(text);
    });
    const block = { width: Math.max(1, ...lines.map((line) => line.length)) * size * 0.6, height: size * (lines.length * 1.25) };
    const position = id === "source" ? { x: 0.955 - block.width / width, y: 0.975 - block.height / height } : { x: 0.045, y: nextY };
    addLayoutItem(id, group, viewBox, target, block, position);
    if (id !== "source") nextY += (layoutItemMetrics.get(group)?.height || block.height) / height + 0.012;
  }
}

function renderSelection(join, visibleFeatures) {
  const selected = state.selectedCode ? featureByCode(state.selectedCode) : null;
  const feature = selected;

  if (!feature) {
    el.selectionDetails.innerHTML = `<p class="empty-state">No selected geography.</p>`;
    for (const id of ["selectedPlaceLabel", "selectedPlaceValue", "applyPlaceButton", "resetPlaceButton", "drilldownButton"]) el[id].disabled = true;
    return;
  }

  const value = join.valueByCode.get(feature.code);
  for (const id of ["selectedPlaceLabel", "selectedPlaceValue", "applyPlaceButton", "resetPlaceButton"]) el[id].disabled = false;
  el.drilldownButton.hidden = feature.level === "barangay" || !getScopes().some((scope) => scope.type === feature.level && scope.code === feature.code);
  el.drilldownButton.textContent = ({ region: "View provinces and independent cities", province: "View cities and municipalities", city: "View barangays" })[feature.level] || "View child map";
  const draft = workspaceUi.drafts.get(feature.code);
  el.drilldownButton.disabled = false;
  if (workspaceUi.observedSelection !== state.selectedCode) el.editStatus.textContent = "";
  if (draft) el.editStatus.textContent = "Unapplied changes. Choose Apply changes to update the map.";
  el.selectedPlaceLabel.value = draft ? draft.label : customLabelForFeature(feature, join);
  el.selectedPlaceValue.value = draft ? draft.value : Number.isFinite(value) ? String(value) : "";
  el.resetPlaceButton.textContent = join.importedRowByCode.has(feature.code) ? "Use CSV value again" : "Clear place edit";
  el.resetPlaceButton.disabled = !Object.hasOwn(state.placeOverrides, feature.code) && !draft;
  el.selectionDetails.innerHTML = `
    ${placeDetailsMarkup(feature, value, join)}
    ${visibleFeatures.filter((item) => item.code === feature.code).length > 1 ? '<p class="note">The source assigns this code to several geometry records. A statistic applies to all of them; review the coverage report before publication.</p>' : ""}
  `;
}

function renderMatchSummary(join) {
  el.matchSummary.innerHTML = [
    ["CSV rows", state.importedRows.length],
    ["Places with values", join.valueByCode.size],
    ["Rows needing attention", new Set(join.issueRows.map((issue) => issue.rowNumber)).size],
    ["Manual place edits", join.manualCount]
  ]
    .map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderReviewTable(join) {
  const issues = join.issueRows.map((item) => ({
    status: item.status,
    severity: item.severity,
    code: item.code,
    rowNumber: item.rowNumber,
    inputName: item.inputName,
    matchedName: item.matchedName,
    valueText: item.valueText,
    detail: item.detail
  }));
  const issueRowNumbers = new Set(issues.map((item) => item.rowNumber));
  const matched = join.matchedRows.filter((item) => !issueRowNumbers.has(item.rowNumber)).slice(0, Math.max(0, 12 - issues.length)).map((item) => ({
    status: Number.isFinite(item.value) ? "Mapped" : "Matched",
    severity: Number.isFinite(item.value) ? "ok" : "warn",
    code: item.code,
    rowNumber: item.rowNumber,
    inputName: getImportedName(item.row),
    matchedName: item.feature.name,
    valueText: item.valueText ?? (Number.isFinite(item.value) ? formatNumber(item.value) : ""),
    detail: Number.isFinite(item.value) ? "Ready for map styling." : "Geography matched, but the value is blank or non-numeric."
  }));
  const rows = [...issues, ...matched].slice(0, 18);

  if (!state.importedRows.length) {
    el.reviewTable.innerHTML = `<p class="empty-state">No imported rows.</p>`;
    return;
  }

  if (!rows.length) {
    el.reviewTable.innerHTML = `<p class="empty-state">No import rows to review.</p>`;
    return;
  }

  el.reviewTable.innerHTML = `
    <div class="review-heading">
      <span>${join.issueRows.length ? `${join.issueRows.length} issue${join.issueRows.length === 1 ? "" : "s"} found` : "All imported rows are clean for this scope"}</span>
      <span>${join.unmatchedRows.length} unmatched</span>
    </div>
    <table class="review-table">
      <thead><tr><th>Data row</th><th>Status</th><th>Place code</th><th>Input place</th><th>Matched place</th><th>Statistic entry</th><th>Note</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr class="review-row review-row-${escapeAttr(row.severity)}"><td>${row.rowNumber}</td><td><span class="status-badge status-${escapeAttr(row.severity)}">${escapeHtml(row.status)}</span></td><td><code>${escapeHtml(row.code || "-")}</code></td><td>${escapeHtml(row.inputName || "-")}</td><td>${escapeHtml(row.matchedName || "-")}</td><td>${escapeHtml(row.valueText?.trim() || "Blank")}</td><td>${escapeHtml(row.detail || "-")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${join.issueRows.length > rows.filter((row) => row.severity !== "ok").length ? `<p class="empty-state">Export issues CSV to review all problem rows.</p>` : ""}
  `;
}
