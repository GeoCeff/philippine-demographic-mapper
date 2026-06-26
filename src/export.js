"use strict";

function exportPng() {
  const serialized = serializeMapSvg();
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = state.exportWidth;
    canvas.height = state.exportHeight;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
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
  exportSvg.querySelectorAll(".map-feature").forEach((node) => {
    node.removeAttribute("tabindex");
    node.removeAttribute("role");
  });
  return new XMLSerializer().serializeToString(exportSvg);
}

function saveProject() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
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
      valueColumn: state.valueColumn
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
  const loadedState = validateProjectState(payload.state);
  if (!loadedState) {
    alert("Project file is missing required map settings.");
    return;
  }
  Object.assign(state, loadedState);
  state.selectedCode = null;
  render();
  el.projectInput.value = "";
}

function validateProjectState(value) {
  if (!value || typeof value !== "object") return null;
  const loaded = {};
  const strings = ["scopeId", "level", "boundarySource", "palette", "classification", "customThresholds", "borderColor", "missingColor", "highlightColor", "backgroundColor", "layoutTitle", "layoutSubtitle", "sourceNote", "projectName", "keyColumn", "valueColumn"];
  const numbers = ["bins", "borderWidth", "exportWidth", "exportHeight"];
  strings.forEach((key) => {
    if (typeof value[key] === "string") loaded[key] = value[key];
  });
  numbers.forEach((key) => {
    if (Number.isFinite(Number(value[key]))) loaded[key] = Number(value[key]);
  });
  ["transparent", "showLayoutText"].forEach((key) => {
    if (typeof value[key] === "boolean") loaded[key] = value[key];
  });
  if (Array.isArray(value.importedRows)) loaded.importedRows = value.importedRows;
  if (Array.isArray(value.columns)) loaded.columns = value.columns;
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
