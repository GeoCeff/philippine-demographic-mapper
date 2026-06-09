"use strict";

function exportPng() {
  const exportSvg = el.mapSvg.cloneNode(true);
  exportSvg.setAttribute("width", state.exportWidth);
  exportSvg.setAttribute("height", state.exportHeight);
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.querySelectorAll(".map-feature").forEach((node) => {
    node.removeAttribute("tabindex");
    node.removeAttribute("role");
  });

  const serialized = new XMLSerializer().serializeToString(exportSvg);
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
      downloadBlob(pngBlob, `${slugify(state.projectName || "demographic-map")}.png`);
    }, "image/png");
  };
  image.src = url;
}

function saveProject() {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    state: {
      scopeId: state.scopeId,
      level: state.level,
      palette: state.palette,
      classification: state.classification,
      bins: state.bins,
      borderColor: state.borderColor,
      borderWidth: state.borderWidth,
      missingColor: state.missingColor,
      highlightColor: state.highlightColor,
      backgroundColor: state.backgroundColor,
      transparent: state.transparent,
      exportWidth: state.exportWidth,
      exportHeight: state.exportHeight,
      projectName: state.projectName,
      importedRows: state.importedRows,
      columns: state.columns,
      keyColumn: state.keyColumn,
      valueColumn: state.valueColumn
    }
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `${slugify(state.projectName)}.json`);
}

async function loadProject(event) {
  const file = event.target.files[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  Object.assign(state, payload.state || {});
  state.selectedCode = null;
  render();
  el.projectInput.value = "";
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
