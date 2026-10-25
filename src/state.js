"use strict";

const MAP_STYLE_DEFAULTS = {
  customColors: [], reverseColors: false,
  legendTitle: "", legendLabels: [], legendShowMissing: true, legendMissingLabel: "No statistic",
  legendScale: 1, legendTextColor: "#20231f", legendBackgroundColor: "#ffffff", legendBackgroundOpacity: 0.92,
  layoutTextColor: "#20231f", layoutTextScale: 1, layoutPositions: {}
};

const state = {
  ...JSON.parse(JSON.stringify(MAP_STYLE_DEFAULTS)),
  scopeId: "PH",
  level: "province",
  boundarySource: "generated",
  generatedBoundaryStatus: "not-loaded",
  generatedBoundaryMessage: "",
  generatedBarangayMessage: "",
  boundaryMetadata: {},
  palette: "density",
  classification: "equal",
  customThresholds: "",
  bins: 7,
  borderColor: "#ffffff",
  borderWidth: 0.45,
  missingColor: "#d8ded7",
  highlightColor: "#f05a41",
  backgroundColor: "#ffffff",
  transparent: false,
  exportWidth: 1600,
  exportHeight: 2000,
  layoutTitle: "Philippine demographic map",
  layoutSubtitle: "Add your statistics by PSGC code",
  sourceNote: "Boundaries: PSA / NAMRIA, 2023 snapshot. Historical coverage gaps apply.",
  showLayoutText: true,
  importedRows: [],
  columns: [],
  keyColumn: "psgc_code",
  valueColumn: "value",
  labelColumn: "",
  labelMode: "none",
  labelSize: 10,
  showMapLegend: true,
  statisticLabel: "Value",
  metricUnit: "", metricPeriod: "", metricSource: "", numberPrecision: "auto", camera: null,
  placeOverrides: {},
  selectedCode: null,
  projectName: "Philippine demographic map"
};

const layoutEditor = { enabled: false, selected: "legend" };
const el = {};
