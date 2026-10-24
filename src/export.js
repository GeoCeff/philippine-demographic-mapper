"use strict";

function exportPng() {
  const { exportWidth, exportHeight, transparent, backgroundColor } = state;
  const serialized = serializeMapSvg();
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = exportWidth;
    canvas.height = exportHeight;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!transparent) {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) {
        alert("PNG export failed.");
        return;
      }
      downloadBlob(pngBlob, `${slugify(state.projectName || "demographic-map")}.png`);
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    alert("PNG export failed.");
  };
  image.src = url;
}

function exportSvg() {
  downloadBlob(
    new Blob([serializeMapSvg()], { type: "image/svg+xml;charset=utf-8" }),
    `${slugify(state.projectName || "demographic-map")}.svg`
  );
}

function serializeMapSvg() {
  const exportSvg = el.mapSvg.cloneNode(true);
  exportSvg.setAttribute("width", state.exportWidth);
  exportSvg.setAttribute("height", state.exportHeight);
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const previewViewBox = exportSvg.getAttribute("viewBox").split(/\s+/).map(Number);
  const viewBox = fitExportViewBox(previewViewBox, state.exportWidth, state.exportHeight);
  exportSvg.setAttribute("viewBox", viewBox.join(" "));
  const [previewX, previewY, previewWidth, previewHeight] = previewViewBox;
  const content = createSvgElement("g", { "clip-path": "url(#map-export-preview-clip)" });
  while (exportSvg.firstChild) content.appendChild(exportSvg.firstChild);
  const definitions = createSvgElement("defs", {});
  const clip = createSvgElement("clipPath", { id: "map-export-preview-clip", clipPathUnits: "userSpaceOnUse" });
  clip.appendChild(createSvgElement("rect", { x: previewX, y: previewY, width: previewWidth, height: previewHeight }));
  definitions.appendChild(clip);
  exportSvg.appendChild(definitions);
  exportSvg.appendChild(content);
  if (!state.transparent) {
    const [x, y, width, height] = viewBox;
    exportSvg.insertBefore(createSvgElement("rect", { x, y, width, height, fill: state.backgroundColor }), exportSvg.firstChild);
  }
  exportSvg.querySelectorAll(".map-feature").forEach((node) => {
    node.removeAttribute("tabindex");
    node.removeAttribute("role");
  });
  exportSvg.querySelectorAll("[data-editor-only]").forEach((node) => node.remove());
  exportSvg.querySelectorAll("[data-layout-item]").forEach((node) => {
    ["data-layout-item", "data-layout-x", "data-layout-y", "data-layout-width", "data-layout-height", "data-layout-selected", "tabindex", "role", "aria-label", "aria-selected", "aria-grabbed", "aria-roledescription"].forEach((key) => node.removeAttribute(key));
  });
  [exportSvg, ...exportSvg.querySelectorAll("[class]")].forEach((node) => {
    const classes = (node.getAttribute("class") || "").split(/\s+/).filter((name) => name && !["layout-item", "is-layout-selected", "is-arranging"].includes(name));
    if (classes.length) node.setAttribute("class", classes.join(" "));
    else node.removeAttribute("class");
  });
  return new XMLSerializer().serializeToString(exportSvg);
}

function fitExportViewBox([x, y, width, height], targetWidth, targetHeight) {
  const ratio = targetWidth / targetHeight;
  const newWidth = Math.max(width, height * ratio);
  const newHeight = Math.max(height, width / ratio);
  return [x - (newWidth - width) / 2, y - (newHeight - height) / 2, newWidth, newHeight];
}

function saveProject() {
  const payload = {
    version: 2,
    savedAt: new Date().toISOString(),
    boundaryMetadata: state.boundaryMetadata,
    state: {
      scopeId: state.scopeId,
      level: state.level,
      boundarySource: state.boundarySource,
      palette: state.palette,
      classification: state.classification,
      customThresholds: state.customThresholds,
      bins: state.bins,
      borderColor: state.borderColor,
      borderWidth: state.borderWidth,
      missingColor: state.missingColor,
      highlightColor: state.highlightColor,
      backgroundColor: state.backgroundColor,
      transparent: state.transparent,
      exportWidth: state.exportWidth,
      exportHeight: state.exportHeight,
      layoutTitle: state.layoutTitle,
      layoutSubtitle: state.layoutSubtitle,
      sourceNote: state.sourceNote,
      showLayoutText: state.showLayoutText,
      projectName: state.projectName,
      importedRows: state.importedRows,
      columns: state.columns,
      keyColumn: state.keyColumn,
      valueColumn: state.valueColumn,
      labelColumn: state.labelColumn, labelMode: state.labelMode, labelSize: state.labelSize,
      showMapLegend: state.showMapLegend, statisticLabel: state.statisticLabel, placeOverrides: state.placeOverrides,
      ...Object.fromEntries(Object.keys(MAP_STYLE_DEFAULTS).map((key) => [key, state[key]]))
    }
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(state.projectName)}.json`);
}

function exportImportIssues() {
  const join = buildJoin();
  if (!join.issueRows.length) return;

  const metadataHeaders = [
    "_issue_type",
    "_status",
    "_severity",
    "_row_number",
    "_psgc_code",
    "_input_name",
    "_value",
    "_matched_name",
    "_detail",
    "_scope",
    "_map_level"
  ];
  const originalHeaders = state.columns.filter((column) => !metadataHeaders.includes(column));
  const headers = [...metadataHeaders, ...originalHeaders];
  const scope = getScope();
  const rows = join.issueRows.map((issue) => ({
    _issue_type: issue.type,
    _status: issue.status,
    _severity: issue.severity,
    _row_number: issue.rowNumber,
    _psgc_code: issue.code,
    _input_name: issue.inputName,
    _value: issue.valueText,
    _matched_name: issue.matchedName,
    _detail: issue.detail,
    _scope: scope.name,
    _map_level: state.level,
    ...issue.row
  }));

  downloadBlob(
    new Blob([`${rowsToCsv(headers, rows)}\n`], { type: "text/csv;charset=utf-8" }),
    `${slugify(state.projectName || "demographic-map")}-match-issues.csv`
  );
}

async function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    alert("Project file is not valid JSON.");
    return;
  }
  const loadedState = validateProjectState(payload && typeof payload === "object" ? payload.state : null);
  if (!loadedState) {
    alert("Project file is missing required map settings.");
    return;
  }
  if (!await confirmDataReplacement()) { el.projectInput.value = ""; return; }
  cancelMapGesture?.();
  layoutEditor.enabled = false;
  layoutEditor.selected = "legend";
  Object.assign(state, loadedState);
  resetWorkspaceEdits();
  el.areaFilterInput.value = "";
  mapViewBox = null;
  state.selectedCode = null;
  render();
  el.projectInput.value = "";
}

function validateProjectState(value) {
  if (!value || typeof value !== "object") return null;
  const loaded = JSON.parse(JSON.stringify(MAP_STYLE_DEFAULTS));
  const strings = ["scopeId", "level", "boundarySource", "palette", "classification", "customThresholds", "borderColor", "missingColor", "highlightColor", "backgroundColor", "layoutTitle", "layoutSubtitle", "sourceNote", "projectName", "keyColumn", "valueColumn", "labelColumn", "labelMode", "statisticLabel"];
  const numbers = ["bins", "borderWidth", "exportWidth", "exportHeight", "labelSize"];
  strings.forEach((key) => {
    if (typeof value[key] === "string") loaded[key] = value[key];
  });
  numbers.forEach((key) => {
    if (Number.isFinite(Number(value[key]))) {
      const number = Number(value[key]);
      loaded[key] = key === "bins" ? clamp(Math.round(number), 3, 7) : key === "labelSize" ? clamp(number, 6, 24)
        : ["exportWidth", "exportHeight"].includes(key) ? clamp(Math.round(number), 640, 5000) : number;
    }
  });
  ["transparent", "showLayoutText", "showMapLegend"].forEach((key) => {
    if (typeof value[key] === "boolean") loaded[key] = value[key];
  });
  ["reverseColors", "legendShowMissing"].forEach((key) => {
    if (typeof value[key] === "boolean") loaded[key] = value[key];
  });
  ["legendTitle", "legendMissingLabel"].forEach((key) => {
    if (typeof value[key] === "string") loaded[key] = value[key].trim().slice(0, 160);
  });
  const colorPattern = /^#[0-9a-f]{6}$/i;
  for (const key of ["legendTextColor", "legendBackgroundColor", "layoutTextColor"]) {
    if (typeof value[key] === "string" && colorPattern.test(value[key])) loaded[key] = value[key].toLowerCase();
  }
  if (Array.isArray(value.customColors)) loaded.customColors = value.customColors.filter((color) => typeof color === "string" && colorPattern.test(color)).slice(0, 32).map((color) => color.toLowerCase());
  if (Array.isArray(value.legendLabels)) loaded.legendLabels = value.legendLabels.slice(0, 32).map((label) => typeof label === "string" ? label.trim().slice(0, 160) : "");
  for (const [key, min, max] of [["legendScale", 0.6, 2], ["layoutTextScale", 0.5, 2], ["legendBackgroundOpacity", 0, 1]]) {
    if (typeof value[key] === "number" && Number.isFinite(value[key])) loaded[key] = clamp(value[key], min, max);
  }
  for (const key of ["legend", "title", "subtitle", "source"]) {
    const position = value.layoutPositions && Object.hasOwn(value.layoutPositions, key) ? value.layoutPositions[key] : null;
    if (position && typeof position === "object" && !Array.isArray(position) && Object.hasOwn(position, "x") && Object.hasOwn(position, "y") && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      loaded.layoutPositions[key] = { x: clamp(position.x, 0, 1), y: clamp(position.y, 0, 1) };
    }
  }
  if (loaded.palette && !Object.hasOwn(PALETTES, loaded.palette)) loaded.palette = "density";
  if (loaded.classification && !["equal", "quantile", "continuous", "highlight", "custom"].includes(loaded.classification)) loaded.classification = "equal";
  if (loaded.boundarySource && !["generated", "fixture"].includes(loaded.boundarySource)) loaded.boundarySource = "generated";
  if (Array.isArray(value.importedRows)) loaded.importedRows = value.importedRows;
  if (Array.isArray(value.columns)) loaded.columns = value.columns;
  if (loaded.labelMode && !["none", "name", "value", "both", "custom"].includes(loaded.labelMode)) loaded.labelMode = "none";
  loaded.placeOverrides = {};
  if (value.placeOverrides && typeof value.placeOverrides === "object" && !Array.isArray(value.placeOverrides)) {
    for (const [code, override] of Object.entries(value.placeOverrides)) {
      if (!/^(?:\d{10}|NAMRIA_[A-Za-z0-9_]+)$/.test(code) || !override || typeof override !== "object" || Array.isArray(override)) continue;
      const entry = {};
      if (typeof override.label === "string") entry.label = override.label.trim().slice(0, 160);
      if (Object.hasOwn(override, "value")) {
        if (!["string", "number"].includes(typeof override.value)) continue;
        const text = String(override.value).trim();
        if (text && !Number.isFinite(parseValue(text))) continue;
        entry.value = text;
      }
      if (Object.keys(entry).length) loaded.placeOverrides[code] = entry;
    }
  }
  if (!loaded.scopeId || !loaded.level) return null;
  return loaded;
}

function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}
