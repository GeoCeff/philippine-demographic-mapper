"use strict";

const PROJECT_STATE_KEYS = [
  "scopeId", "level", "boundarySource", "palette", "classification", "customThresholds", "bins",
  "borderColor", "borderWidth", "missingColor", "highlightColor", "backgroundColor", "transparent",
  "exportWidth", "exportHeight", "layoutTitle", "layoutSubtitle", "sourceNote", "showLayoutText", "projectName",
  "importedRows", "columns", "keyColumn", "valueColumn", "labelColumn", "labelMode", "labelSize",
  "showMapLegend", "statisticLabel", "placeOverrides", "metricUnit", "metricPeriod", "metricSource", "numberPrecision", "camera", ...Object.keys(MAP_STYLE_DEFAULTS)
];
const PROJECT_STATE_DEFAULTS = JSON.parse(JSON.stringify(Object.fromEntries(PROJECT_STATE_KEYS.map((key) => [key, state[key]]))));

function exportPng() {
  const { exportWidth, exportHeight, transparent, backgroundColor, projectName } = state;
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
      downloadBlob(pngBlob, `${slugify(projectName || "demographic-map")}.png`);
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
  exportSvg.removeAttribute("style");
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

function projectPayload() {
  return JSON.parse(JSON.stringify({
    version: 2,
    savedAt: new Date().toISOString(),
    boundaryMetadata: state.boundaryMetadata,
    state: { ...Object.fromEntries(PROJECT_STATE_KEYS.map((key) => [key, state[key]])), camera: captureProjectCamera() }
  }));
}

function saveProject() {
  const payload = projectPayload();
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(state.projectName)}.json`);
  if (typeof projectSession !== "undefined") { projectSession.message = workspaceUi.drafts.size ? "Project download requested · Unapplied drafts remain in local recovery" : "Project download requested"; updateProjectSessionStatus(); }
}

function captureProjectCamera() {
  if (state.camera?.scopeId === state.scopeId && state.camera.level === state.level && state.camera.boundarySource === state.boundarySource) return JSON.parse(JSON.stringify(state.camera));
  return typeof mapViewBox !== "undefined" && mapViewBox?.every(Number.isFinite) && mapViewBox[2] > 0 && mapViewBox[3] > 0
    ? { scopeId: state.scopeId, level: state.level, boundarySource: state.boundarySource, snapshot: state.boundaryMetadata.snapshot || "", viewBox: [...mapViewBox] } : null;
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
  const reservedHeaders = new Set(metadataHeaders.map((header) => header.toLowerCase()));
  const occupiedHeaders = new Set([...metadataHeaders, ...state.columns].map((header) => header.toLowerCase()));
  const originalHeaders = state.columns.map((column) => {
    let header = column;
    if (reservedHeaders.has(header.toLowerCase())) {
      do { header = `input_${header}`; } while (occupiedHeaders.has(header.toLowerCase()));
      occupiedHeaders.add(header.toLowerCase());
    }
    return { column, header };
  });
  const headers = [...metadataHeaders, ...originalHeaders.map(({ header }) => header)];
  const scope = getScope();
  const rows = join.issueRows.map((issue) => ({
    ...Object.fromEntries(originalHeaders.map(({ column, header }) => [header, issue.row[column]])),
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
    _map_level: state.level
  }));

  downloadBlob(
    new Blob([`${rowsToCsv(headers, rows)}\n`], { type: "text/csv;charset=utf-8" }),
    `${slugify(state.projectName || "demographic-map")}-match-issues.csv`
  );
}

async function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 25_000_000) { alert("This project is larger than 25 MB. Use a smaller project file."); el.projectInput.value = ""; return; }
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    alert("Project file is not valid JSON.");
    el.projectInput.value = "";
    return;
  }
  const loadedState = [undefined, 1, 2].includes(payload?.version) ? validateProjectState(payload && typeof payload === "object" ? payload.state : null) : null;
  if (!loadedState) {
    alert("Project file is missing required map settings.");
    el.projectInput.value = "";
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
  if (typeof onProjectLoaded === "function") onProjectLoaded(payload);
  el.projectInput.value = "";
}

function validateProjectState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.scopeId !== "string" || !/^(?:PH|(?:REG|PROV|CITY)-(?:\d{2,10}|NAMRIA_[A-Za-z0-9_]+))$/.test(value.scopeId) || !LEVELS.some((level) => level.id === value.level)) return null;
  const loaded = JSON.parse(JSON.stringify(PROJECT_STATE_DEFAULTS));
  for (const [key, limit] of [["metricUnit", 60], ["metricPeriod", 60], ["metricSource", 500]]) if (typeof value[key] === "string") loaded[key] = value[key].trim().slice(0, limit);
  if (value.numberPrecision === "auto" || /^[0-8]$/.test(String(value.numberPrecision))) loaded.numberPrecision = String(value.numberPrecision);
  const camera = value.camera;
  if (camera && camera.scopeId === value.scopeId && camera.level === value.level && camera.boundarySource === (value.boundarySource || loaded.boundarySource) && Array.isArray(camera.viewBox) && camera.viewBox.length === 4 && camera.viewBox.every((number) => Number.isFinite(number) && Math.abs(number) <= 1e9) && camera.viewBox[2] > 0 && camera.viewBox[3] > 0) {
    loaded.camera = { scopeId: camera.scopeId, level: camera.level, boundarySource: camera.boundarySource, snapshot: typeof camera.snapshot === "string" ? camera.snapshot.slice(0, 40) : "", viewBox: [...camera.viewBox] };
  }
  const strings = ["scopeId", "level", "boundarySource", "palette", "classification", "customThresholds", "layoutTitle", "layoutSubtitle", "sourceNote", "projectName", "keyColumn", "valueColumn", "labelColumn", "labelMode", "statisticLabel"];
  const numbers = ["bins", "borderWidth", "exportWidth", "exportHeight", "labelSize"];
  strings.forEach((key) => {
    if (typeof value[key] === "string") loaded[key] = value[key];
  });
  numbers.forEach((key) => {
    if (typeof value[key] === "number" && Number.isFinite(value[key])) {
      const number = value[key];
      loaded[key] = key === "bins" ? clamp(Math.round(number), 3, 7) : key === "labelSize" ? clamp(number, 6, 24)
        : ["exportWidth", "exportHeight"].includes(key) ? clamp(Math.round(number), 640, 5000) : clamp(number, 0, 8);
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
  for (const key of ["borderColor", "missingColor", "highlightColor", "backgroundColor", "legendTextColor", "legendBackgroundColor", "layoutTextColor"]) {
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
  if (!Object.hasOwn(PALETTES, loaded.palette)) loaded.palette = "density";
  if (!["equal", "quantile", "continuous", "highlight", "custom"].includes(loaded.classification)) loaded.classification = "equal";
  if (!["generated", "fixture"].includes(loaded.boundarySource)) loaded.boundarySource = "generated";
  if (Object.hasOwn(value, "columns")) {
    if (!Array.isArray(value.columns) || value.columns.some((column) => typeof column !== "string" || !column.trim() || column !== column.trim())) return null;
    loaded.columns = value.columns.slice();
    if (new Set(loaded.columns.map((column) => column.toLowerCase())).size !== loaded.columns.length) return null;
  }
  if (Object.hasOwn(value, "importedRows")) {
    if (!Array.isArray(value.importedRows) || value.importedRows.some((row) => !row || typeof row !== "object" || Array.isArray(row) ||
      Object.values(row).some((cell) => cell !== null && typeof cell !== "string" && !(typeof cell === "number" && Number.isFinite(cell))))) return null;
    loaded.importedRows = value.importedRows.map((row) => Object.fromEntries(Object.entries(row).map(([column, cell]) => [column, String(cell ?? "")])));
  }
  if (loaded.importedRows.length) {
    if (!loaded.columns.length) return null;
    if (!Object.hasOwn(value, "keyColumn")) loaded.keyColumn = chooseColumn(loaded.columns, ["psgc_code", "psgc", "code"], loaded.columns[0]);
    if (!Object.hasOwn(value, "valueColumn")) loaded.valueColumn = chooseNumericColumn(loaded.importedRows, loaded.columns, loaded.keyColumn) || "";
    if (!loaded.columns.includes(loaded.keyColumn) || loaded.valueColumn && !loaded.columns.includes(loaded.valueColumn) || loaded.labelColumn && !loaded.columns.includes(loaded.labelColumn)) return null;
    loaded.importedRows = loaded.importedRows.map((row) => Object.fromEntries(loaded.columns.map((column) => [column, Object.hasOwn(row, column) ? row[column] : ""])));
  }
  if (!["none", "name", "value", "both", "custom"].includes(loaded.labelMode)) loaded.labelMode = "none";
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
