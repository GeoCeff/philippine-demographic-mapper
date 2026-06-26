"use strict";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  populateStaticControls();
  bindEvents();
  parseImportedCsv(SAMPLE_REGION_CSV, { scopeId: "PH", level: "region", projectName: "Regional sample map" });
  await loadGeneratedBoundaryFeatures();
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
    "exportPngButton",
    "exportSvgButton",
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
    "legend",
    "reviewTable"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function populateStaticControls() {
  el.scopeSelect.innerHTML = SCOPES.map((scope) => `<option value="${scope.id}">${escapeHtml(scope.name)}</option>`).join("");
  el.paletteSelect.innerHTML = Object.entries(PALETTES)
    .map(([id, palette]) => `<option value="${id}">${escapeHtml(palette.label)}</option>`)
    .join("");
}

function bindEvents() {
  el.scopeSelect.addEventListener("change", () => {
    state.scopeId = el.scopeSelect.value;
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
    if (state.boundarySource === "generated" && state.generatedBoundaryStatus !== "ready") {
      state.boundarySource = "fixture";
    }
    state.selectedCode = null;
    render();
  });

  el.geographySearchInput.addEventListener("change", () => {
    const query = el.geographySearchInput.value.trim().toLowerCase();
    const feature = getAdminFeatures().find((item) => item.code.toLowerCase() === query || item.name.toLowerCase() === query);
    if (!feature) return;
    state.level = feature.level;
    state.scopeId = scopeIdForFeature(feature);
    state.selectedCode = feature.code;
    el.geographySearchInput.value = "";
    render();
  });

  el.fitMapButton.addEventListener("click", () => {
    state.selectedCode = null;
    render();
  });

  el.clearSelectionButton.addEventListener("click", () => {
    state.selectedCode = null;
    render();
  });

  el.csvInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    parseImportedCsv(text, { projectName: file.name.replace(/\.csv$/i, "") });
    render();
    el.csvInput.value = "";
  });

  el.loadRegionSample.addEventListener("click", () => {
    parseImportedCsv(SAMPLE_REGION_CSV, { scopeId: "PH", level: "region", projectName: "Regional sample map" });
    render();
  });

  el.loadProvinceSample.addEventListener("click", () => {
    parseImportedCsv(SAMPLE_PROVINCE_CSV, { scopeId: "PH", level: "province", projectName: "Province sample map" });
    render();
  });

  el.loadBarangaySample.addEventListener("click", () => {
    parseImportedCsv(SAMPLE_BARANGAY_CSV, {
      scopeId: "CITY-137404",
      level: "barangay",
      projectName: "Quezon City barangay sample"
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

  el.paletteSelect.addEventListener("change", () => {
    state.palette = el.paletteSelect.value;
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
      if (key === "layoutTitle") {
        state.projectName = el[inputId].value || "Untitled demographic map";
      }
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

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = button.dataset.preset;
      if (preset === "square") {
        state.exportWidth = 1600;
        state.exportHeight = 1600;
      }
      if (preset === "portrait") {
        state.exportWidth = 1600;
        state.exportHeight = 2000;
      }
      if (preset === "report") {
        state.exportWidth = 1800;
        state.exportHeight = 2400;
      }
      syncControls();
    });
  });

  el.exportPngButton.addEventListener("click", exportPng);
  el.exportSvgButton.addEventListener("click", exportSvg);
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
  state.selectedCode = null;
}

function render() {
  const scope = getScope();
  if (!scope.allowedLevels.includes(state.level)) {
    state.level = scope.preferredLevel;
  }
  maybeLoadGeneratedBarangaysForScope();
  syncControls();
  renderMap();
  renderSelection();
  renderLegend();
  renderMatchSummary();
  renderReviewTable();
  renderHeader();
}

function syncControls() {
  const scope = getScope();
  el.scopeSelect.value = state.scopeId;
  el.levelSelect.innerHTML = LEVELS.map((level) => {
    const disabled = scope.allowedLevels.includes(level.id) ? "" : " disabled";
    return `<option value="${level.id}"${disabled}>${escapeHtml(level.label)}</option>`;
  }).join("");
  el.levelSelect.value = state.level;
  el.boundarySourceSelect.value = state.boundarySource;
  el.boundarySourceSelect.querySelector('option[value="generated"]').disabled = state.generatedBoundaryStatus !== "ready";
  el.geographyOptions.innerHTML = getAdminFeatures()
    .slice(0, 3000)
    .map((feature) => `<option value="${escapeAttr(feature.code)}">${escapeHtml(feature.name)}</option>`)
    .join("");

  syncColumnSelect(el.keyColumnSelect, state.keyColumn);
  syncColumnSelect(el.valueColumnSelect, state.valueColumn);

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
  el.exportIssuesButton.disabled = buildJoin().issueRows.length === 0;
  el.contrastNote.textContent = contrastWarning();
}

function scopeIdForFeature(feature) {
  if (feature.level === "barangay") return SCOPES.find((scope) => scope.type === "city" && scope.code === feature.cityCode)?.id || state.scopeId;
  if (feature.level === "city") return SCOPES.find((scope) => scope.type === "province" && scope.code === feature.provinceCode)?.id || SCOPES.find((scope) => scope.type === "region" && scope.code === feature.regionCode)?.id || "PH";
  if (feature.level === "province") return SCOPES.find((scope) => scope.type === "region" && scope.code === feature.regionCode)?.id || "PH";
  return "PH";
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

function renderHeader() {
  const scope = getScope();
  const levelLabel = LEVELS.find((level) => level.id === state.level)?.label || state.level;
  el.activePath.textContent = `${scope.name} / ${levelLabel}`;
  el.mapTitle.textContent = state.projectName || "Untitled demographic map";
  el.sourceStatus.textContent = getBoundarySourceLabel();

  const visibleCount = getVisibleFeatures().length;
  const metadata = state.boundarySource === "generated" ? boundaryMetadataText() : "";
  if (state.level === "barangay" && state.scopeId === "PH") {
    el.densityNote.textContent = "Choose a province or city scope to load generated barangays.";
  } else if (state.generatedBarangayMessage && state.boundarySource === "generated" && state.level === "barangay") {
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible. ${state.generatedBarangayMessage}${metadata}`;
  } else if (state.generatedBoundaryStatus === "error") {
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible. ${state.generatedBoundaryMessage}`;
  } else {
    const generatedNote = state.boundarySource === "generated" ? ` Source: normalized GeoJSON.${metadata}` : "";
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible.${generatedNote}`;
  }
}

function boundaryMetadataText() {
  const metadata = state.boundaryMetadata || {};
  const parts = [
    metadata.releaseTag ? ` Release ${metadata.releaseTag}.` : "",
    metadata.snapshot ? ` PSGC snapshot ${metadata.snapshot}.` : "",
    metadata.namriaVersion ? ` NAMRIA ${metadata.namriaVersion}.` : "",
    metadata.caveat ? ` ${metadata.caveat}` : ""
  ];
  return parts.join("");
}

function renderMap() {
  const visibleFeatures = getVisibleFeatures();
  const join = buildJoin();
  const scale = buildScale(visibleFeatures, join.valueByCode);
  const bounds = boundsFromFeatures(visibleFeatures);
  const padding = Math.max(28, Math.min(bounds.width, bounds.height) * 0.08);
  const titlePad = state.showLayoutText ? Math.max(52, bounds.height * 0.12) : 0;
  const notePad = state.showLayoutText ? Math.max(40, bounds.height * 0.08) : 0;
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding - titlePad,
    Math.max(1, bounds.width + padding * 2),
    Math.max(1, bounds.height + padding * 2 + titlePad + notePad)
  ];

  el.mapSvg.setAttribute("viewBox", viewBox.join(" "));
  el.mapSvg.innerHTML = "";

  if (!state.transparent) {
    const rect = createSvgElement("rect", {
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

  if (state.showLayoutText) {
    renderLayoutText(viewBox);
  }

  const shadow = createSvgElement("path", {
    d: visibleFeatures.map(pathFromFeature).join(" "),
    fill: "rgba(32, 35, 31, 0.08)",
    "fill-rule": "evenodd",
    transform: "translate(7 9)"
  });
  el.mapSvg.appendChild(shadow);

  visibleFeatures.forEach((feature) => {
    const featureValue = join.valueByCode.get(feature.code);
    const selected = state.selectedCode === feature.code;
    const group = createSvgElement("g", {
      class: `map-feature${selected ? " is-selected" : ""}`,
      "data-code": feature.code,
      tabindex: 0,
      role: "button",
      "aria-label": `${feature.name}, ${feature.code}`
    });

    const path = createSvgElement("path", {
      d: pathFromFeature(feature),
      fill: getFeatureFill(feature, featureValue, scale),
      "fill-rule": "evenodd",
      stroke: selected ? state.highlightColor : state.borderColor,
      "stroke-width": selected ? state.borderWidth + 1.4 : state.borderWidth,
      "stroke-linejoin": "round",
      "vector-effect": "non-scaling-stroke"
    });
    group.appendChild(path);

    group.addEventListener("click", () => {
      state.selectedCode = state.selectedCode === feature.code ? null : feature.code;
      render();
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedCode = state.selectedCode === feature.code ? null : feature.code;
        render();
      }
    });
    group.addEventListener("mousemove", (event) => showTooltip(event, feature, featureValue));
    group.addEventListener("mouseleave", hideTooltip);
    el.mapSvg.appendChild(group);
  });
}

function renderLayoutText(viewBox) {
  const [x, y, width, height] = viewBox;
  const left = x + width * 0.045;
  const right = x + width * 0.955;
  const titleY = y + Math.max(24, height * 0.045);
  const titleSize = clamp(width * 0.038, 18, 42);
  const subtitleSize = clamp(width * 0.018, 10, 20);
  const noteSize = clamp(width * 0.014, 8, 15);

  if (state.layoutTitle.trim()) {
    const title = createSvgElement("text", {
      x: left,
      y: titleY,
      fill: "#20231f",
      "font-size": titleSize,
      "font-weight": 800,
      "font-family": "Inter, Segoe UI, Arial, sans-serif"
    });
    title.textContent = state.layoutTitle.trim();
    el.mapSvg.appendChild(title);
  }

  if (state.layoutSubtitle.trim()) {
    const subtitle = createSvgElement("text", {
      x: left,
      y: titleY + titleSize * 0.82,
      fill: "#667066",
      "font-size": subtitleSize,
      "font-family": "Inter, Segoe UI, Arial, sans-serif"
    });
    subtitle.textContent = state.layoutSubtitle.trim();
    el.mapSvg.appendChild(subtitle);
  }

  if (state.sourceNote.trim()) {
    const note = createSvgElement("text", {
      x: right,
      y: y + height - Math.max(16, height * 0.028),
      fill: "#667066",
      "font-size": noteSize,
      "text-anchor": "end",
      "font-family": "Inter, Segoe UI, Arial, sans-serif"
    });
    note.textContent = state.sourceNote.trim();
    el.mapSvg.appendChild(note);
  }
}

function renderSelection() {
  const selected = state.selectedCode ? featureByCode(state.selectedCode) : null;
  const join = buildJoin();
  const fallback = getVisibleFeatures()[0];
  const feature = selected || fallback;

  if (!feature) {
    el.selectionDetails.innerHTML = `<p class="empty-state">No selected geography.</p>`;
    return;
  }

  const value = join.valueByCode.get(feature.code);
  const parentParts = [feature.regionName, feature.provinceName, feature.cityName].filter(Boolean);
  el.selectionDetails.innerHTML = `
    <div>
      <p class="selection-name">${escapeHtml(feature.name)}</p>
      <p class="selection-meta">${escapeHtml(parentParts.join(" / ") || "Philippines")}</p>
    </div>
    <p class="selection-meta">PSGC: <code>${escapeHtml(feature.code)}</code></p>
    <p class="selection-meta">Value: <strong>${Number.isFinite(value) ? formatNumber(value) : "Missing"}</strong></p>
  `;
}

function renderLegend() {
  const visibleFeatures = getVisibleFeatures();
  const join = buildJoin();
  const scale = buildScale(visibleFeatures, join.valueByCode);
  const values = visibleFeatures.map((feature) => join.valueByCode.get(feature.code)).filter(Number.isFinite);

  if (!values.length || state.classification === "highlight") {
    el.legend.innerHTML = `
      <div class="legend-ramp" style="--legend-count:2">
        <span style="background:${state.highlightColor}"></span>
        <span style="background:${state.missingColor}"></span>
      </div>
      <div class="legend-labels"><span>Highlighted</span><span>Missing</span></div>
    `;
    return;
  }

  const colors = scale.colors;
  el.legend.innerHTML = `
    <div class="legend-ramp" style="--legend-count:${colors.length}">
      ${colors.map((color) => `<span style="background:${color}"></span>`).join("")}
    </div>
    <div class="legend-labels">
      ${(scale.labels || [formatNumber(Math.min(...values)), formatNumber(Math.max(...values))]).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}
    </div>
  `;
}

function renderMatchSummary() {
  const join = buildJoin();
  el.matchSummary.innerHTML = [
    ["Rows", state.importedRows.length],
    ["Mapped", join.mappedRows.length],
    ["Matched", join.matchedRows.length],
    ["Issues", join.issueRows.length]
  ]
    .map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderReviewTable() {
  const join = buildJoin();
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
  const matched = join.matchedRows.slice(0, Math.max(0, 12 - issues.length)).map((item) => ({
    status: Number.isFinite(item.value) ? "Mapped" : "Matched",
    severity: Number.isFinite(item.value) ? "ok" : "warn",
    code: item.code,
    rowNumber: item.rowNumber,
    inputName: getImportedName(item.row),
    matchedName: item.feature.name,
    valueText: Number.isFinite(item.value) ? formatNumber(item.value) : "",
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
      <thead><tr><th>Row</th><th>Status</th><th>PSGC</th><th>Input</th><th>Matched</th><th>Note</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr class="review-row review-row-${escapeAttr(row.severity)}"><td>${row.rowNumber}</td><td><span class="status-badge status-${escapeAttr(row.severity)}">${escapeHtml(row.status)}</span></td><td><code>${escapeHtml(row.code || "-")}</code></td><td>${escapeHtml(row.inputName || "-")}</td><td>${escapeHtml(row.matchedName || "-")}</td><td>${escapeHtml(row.detail || "-")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${join.issueRows.length > rows.filter((row) => row.severity !== "ok").length ? `<p class="empty-state">Export issues CSV to review all problem rows.</p>` : ""}
  `;
}
