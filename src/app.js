"use strict";

const LEVELS = [
  { id: "region", label: "Region" },
  { id: "province", label: "Province" },
  { id: "city", label: "City / municipality" },
  { id: "barangay", label: "Barangay" }
];

const PALETTES = {
  emerald: {
    label: "Laguna green",
    colors: ["#eef7e9", "#c9e8bf", "#8acc86", "#4aad68", "#198754", "#006d42", "#004b2d"]
  },
  bay: {
    label: "Bay to mango",
    colors: ["#e9f6f7", "#bfe5df", "#7dc9b7", "#32a891", "#f0b84f", "#ee8a43", "#d94c38"]
  },
  hibiscus: {
    label: "Hibiscus",
    colors: ["#f9edf1", "#efc7d1", "#dc8ea3", "#c65373", "#9f3158", "#742245", "#4e1935"]
  },
  monoInk: {
    label: "Print ink",
    colors: ["#f4f4f0", "#d8ddd2", "#aeb9aa", "#818e7c", "#596656", "#354233", "#182118"]
  }
};

const SAMPLE_REGION_CSV = `psgc_code,name,value
0100000000,Ilocos Region,58
0200000000,Cagayan Valley,42
0300000000,Central Luzon,81
0400000000,CALABARZON,76
0500000000,Bicol Region,47
0600000000,Western Visayas,63
0700000000,Central Visayas,68
0800000000,Eastern Visayas,39
0900000000,Zamboanga Peninsula,44
1100000000,Davao Region,71
1300000000,National Capital Region,93
1500000000,Bangsamoro,36`;

const SAMPLE_PROVINCE_CSV = `psgc_code,name,value
0128000000,Ilocos Norte,54
0155000000,Pangasinan,72
0231000000,Isabela,45
0314000000,Bulacan,82
0421000000,Cavite,88
0505000000,Albay,59
0630000000,Iloilo,67
0722000000,Cebu,91
0837000000,Leyte,52
0973000000,Zamboanga del Sur,43
1124000000,Davao del Sur,74
1538000000,Maguindanao del Sur,38`;

const SAMPLE_BARANGAY_CSV = `psgc_code,name,value,households
1374040001,Batasan Hills,91,40200
1374040002,Commonwealth,88,38100
1374040003,Payatas,73,28600
1374040004,Holy Spirit,66,21100
1374040005,Bagong Pag-asa,57,16500
1374040006,Tandang Sora,61,19200
1374040007,Novaliches Proper,69,22000
1374040008,Cubao,84,24400
1374040009,Loyola Heights,48,13400
1374040010,Project 6,52,14200
1374040011,Kamuning,46,12100
1374040012,Socorro,64,17600`;

function f(config) {
  return {
    ...config,
    polygons: config.polygons.map((polygon) => polygon.map(([x, y]) => ({ x, y })))
  };
}

const ADMIN_FEATURES = [
  f({
    code: "0100000000",
    name: "Ilocos Region",
    level: "region",
    regionCode: "0100000000",
    regionName: "Ilocos Region",
    polygons: [[[150, 85], [264, 72], [302, 222], [226, 323], [151, 282], [132, 180]]]
  }),
  f({
    code: "0200000000",
    name: "Cagayan Valley",
    level: "region",
    regionCode: "0200000000",
    regionName: "Cagayan Valley",
    polygons: [[[275, 72], [399, 88], [432, 262], [338, 304], [303, 223], [316, 128]]]
  }),
  f({
    code: "0300000000",
    name: "Central Luzon",
    level: "region",
    regionCode: "0300000000",
    regionName: "Central Luzon",
    polygons: [[[217, 320], [338, 304], [362, 407], [305, 462], [225, 433], [193, 370]]]
  }),
  f({
    code: "1300000000",
    name: "National Capital Region",
    level: "region",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    polygons: [[[291, 424], [326, 425], [338, 455], [308, 477], [282, 452]]]
  }),
  f({
    code: "0400000000",
    name: "CALABARZON",
    level: "region",
    regionCode: "0400000000",
    regionName: "CALABARZON",
    polygons: [[[327, 432], [424, 472], [405, 550], [296, 536], [300, 473]]]
  }),
  f({
    code: "0500000000",
    name: "Bicol Region",
    level: "region",
    regionCode: "0500000000",
    regionName: "Bicol Region",
    polygons: [[[414, 513], [525, 563], [626, 651], [582, 716], [455, 613], [395, 552]]]
  }),
  f({
    code: "0600000000",
    name: "Western Visayas",
    level: "region",
    regionCode: "0600000000",
    regionName: "Western Visayas",
    polygons: [[[308, 602], [451, 621], [434, 733], [300, 706], [263, 653]]]
  }),
  f({
    code: "0700000000",
    name: "Central Visayas",
    level: "region",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    polygons: [
      [[448, 641], [534, 656], [515, 718], [432, 701]],
      [[548, 698], [625, 721], [604, 760], [533, 741]]
    ]
  }),
  f({
    code: "0800000000",
    name: "Eastern Visayas",
    level: "region",
    regionCode: "0800000000",
    regionName: "Eastern Visayas",
    polygons: [[[546, 617], [655, 670], [651, 779], [548, 745], [518, 682]]]
  }),
  f({
    code: "0900000000",
    name: "Zamboanga Peninsula",
    level: "region",
    regionCode: "0900000000",
    regionName: "Zamboanga Peninsula",
    polygons: [[[319, 829], [441, 801], [521, 850], [466, 907], [329, 899], [280, 864]]]
  }),
  f({
    code: "1100000000",
    name: "Davao Region",
    level: "region",
    regionCode: "1100000000",
    regionName: "Davao Region",
    polygons: [[[589, 836], [736, 870], [735, 1006], [619, 1036], [560, 931]]]
  }),
  f({
    code: "1500000000",
    name: "Bangsamoro",
    level: "region",
    regionCode: "1500000000",
    regionName: "Bangsamoro",
    polygons: [[[430, 879], [580, 920], [570, 1041], [444, 1061], [391, 971]]]
  }),

  f({
    code: "0128000000",
    name: "Ilocos Norte",
    level: "province",
    regionCode: "0100000000",
    regionName: "Ilocos Region",
    provinceCode: "0128000000",
    provinceName: "Ilocos Norte",
    polygons: [[[150, 85], [264, 72], [283, 155], [190, 176], [132, 180]]]
  }),
  f({
    code: "0155000000",
    name: "Pangasinan",
    level: "province",
    regionCode: "0100000000",
    regionName: "Ilocos Region",
    provinceCode: "0155000000",
    provinceName: "Pangasinan",
    polygons: [[[188, 176], [283, 156], [302, 222], [226, 323], [151, 282]]]
  }),
  f({
    code: "0231000000",
    name: "Isabela",
    level: "province",
    regionCode: "0200000000",
    regionName: "Cagayan Valley",
    provinceCode: "0231000000",
    provinceName: "Isabela",
    polygons: [[[316, 128], [399, 88], [432, 262], [338, 304], [303, 223]]]
  }),
  f({
    code: "0314000000",
    name: "Bulacan",
    level: "province",
    regionCode: "0300000000",
    regionName: "Central Luzon",
    provinceCode: "0314000000",
    provinceName: "Bulacan",
    polygons: [[[218, 321], [338, 304], [362, 407], [307, 430], [247, 405]]]
  }),
  f({
    code: "0421000000",
    name: "Cavite",
    level: "province",
    regionCode: "0400000000",
    regionName: "CALABARZON",
    provinceCode: "0421000000",
    provinceName: "Cavite",
    polygons: [[[327, 432], [424, 472], [405, 550], [324, 520], [300, 473]]]
  }),
  f({
    code: "0505000000",
    name: "Albay",
    level: "province",
    regionCode: "0500000000",
    regionName: "Bicol Region",
    provinceCode: "0505000000",
    provinceName: "Albay",
    polygons: [[[414, 513], [525, 563], [626, 651], [582, 716], [507, 654], [395, 552]]]
  }),
  f({
    code: "0630000000",
    name: "Iloilo",
    level: "province",
    regionCode: "0600000000",
    regionName: "Western Visayas",
    provinceCode: "0630000000",
    provinceName: "Iloilo",
    polygons: [[[308, 602], [451, 621], [434, 733], [300, 706], [263, 653]]]
  }),
  f({
    code: "0722000000",
    name: "Cebu",
    level: "province",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    polygons: [[[448, 641], [534, 656], [515, 718], [432, 701]]]
  }),
  f({
    code: "0837000000",
    name: "Leyte",
    level: "province",
    regionCode: "0800000000",
    regionName: "Eastern Visayas",
    provinceCode: "0837000000",
    provinceName: "Leyte",
    polygons: [[[546, 617], [655, 670], [651, 779], [548, 745], [518, 682]]]
  }),
  f({
    code: "0973000000",
    name: "Zamboanga del Sur",
    level: "province",
    regionCode: "0900000000",
    regionName: "Zamboanga Peninsula",
    provinceCode: "0973000000",
    provinceName: "Zamboanga del Sur",
    polygons: [[[319, 829], [441, 801], [521, 850], [466, 907], [329, 899], [280, 864]]]
  }),
  f({
    code: "1124000000",
    name: "Davao del Sur",
    level: "province",
    regionCode: "1100000000",
    regionName: "Davao Region",
    provinceCode: "1124000000",
    provinceName: "Davao del Sur",
    polygons: [[[589, 836], [736, 870], [735, 1006], [619, 1036], [560, 931]]]
  }),
  f({
    code: "1538000000",
    name: "Maguindanao del Sur",
    level: "province",
    regionCode: "1500000000",
    regionName: "Bangsamoro",
    provinceCode: "1538000000",
    provinceName: "Maguindanao del Sur",
    polygons: [[[430, 879], [580, 920], [570, 1041], [444, 1061], [391, 971]]]
  }),

  f({
    code: "1374040000",
    name: "Quezon City",
    level: "city",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    cityCode: "1374040000",
    cityName: "Quezon City",
    polygons: [[[292, 421], [329, 424], [346, 449], [333, 475], [303, 482], [280, 453]]]
  }),
  f({
    code: "1339000000",
    name: "City of Manila",
    level: "city",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    cityCode: "1339000000",
    cityName: "City of Manila",
    polygons: [[[272, 447], [302, 482], [290, 506], [254, 487], [251, 463]]]
  }),
  f({
    code: "1375010000",
    name: "Caloocan",
    level: "city",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    cityCode: "1375010000",
    cityName: "Caloocan",
    polygons: [[[279, 389], [319, 397], [329, 424], [292, 421], [266, 409]]]
  }),
  f({
    code: "1376020000",
    name: "Makati",
    level: "city",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    cityCode: "1376020000",
    cityName: "Makati",
    polygons: [[[303, 482], [333, 475], [340, 501], [314, 519], [290, 506]]]
  }),
  f({
    code: "0722170000",
    name: "Cebu City",
    level: "city",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    cityCode: "0722170000",
    cityName: "Cebu City",
    polygons: [[[456, 645], [514, 652], [523, 684], [501, 719], [453, 706], [437, 673]]]
  }),
  f({
    code: "0722300000",
    name: "Mandaue",
    level: "city",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    cityCode: "0722300000",
    cityName: "Mandaue",
    polygons: [[[514, 652], [546, 660], [543, 690], [523, 684]]]
  }),
  f({
    code: "0722260000",
    name: "Lapu-Lapu",
    level: "city",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    cityCode: "0722260000",
    cityName: "Lapu-Lapu",
    polygons: [[[550, 693], [602, 705], [594, 744], [542, 728]]]
  }),
  f({
    code: "0722510000",
    name: "Toledo",
    level: "city",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    cityCode: "0722510000",
    cityName: "Toledo",
    polygons: [[[435, 674], [453, 706], [423, 724], [404, 689]]]
  }),
  f({
    code: "1124020000",
    name: "Davao City",
    level: "city",
    regionCode: "1100000000",
    regionName: "Davao Region",
    provinceCode: "1124000000",
    provinceName: "Davao del Sur",
    cityCode: "1124020000",
    cityName: "Davao City",
    polygons: [[[605, 864], [704, 884], [724, 963], [662, 1012], [589, 942]]]
  }),
  f({
    code: "1124030000",
    name: "Digos",
    level: "city",
    regionCode: "1100000000",
    regionName: "Davao Region",
    provinceCode: "1124000000",
    provinceName: "Davao del Sur",
    cityCode: "1124030000",
    cityName: "Digos",
    polygons: [[[589, 942], [662, 1012], [618, 1038], [559, 986]]]
  }),

  ...makeBarangayGrid({
    prefix: "137404",
    regionCode: "1300000000",
    regionName: "National Capital Region",
    cityCode: "1374040000",
    cityName: "Quezon City",
    names: [
      "Batasan Hills",
      "Commonwealth",
      "Payatas",
      "Holy Spirit",
      "Bagong Pag-asa",
      "Tandang Sora",
      "Novaliches Proper",
      "Cubao",
      "Loyola Heights",
      "Project 6",
      "Kamuning",
      "Socorro"
    ],
    startX: 282,
    startY: 422,
    cellW: 21,
    cellH: 18,
    cols: 4,
    skew: 3
  }),
  ...makeBarangayGrid({
    prefix: "072217",
    regionCode: "0700000000",
    regionName: "Central Visayas",
    provinceCode: "0722000000",
    provinceName: "Cebu",
    cityCode: "0722170000",
    cityName: "Cebu City",
    names: ["Lahug", "Guadalupe", "Capitol Site", "Mabolo", "Talamban", "Pardo", "Punta Princesa", "Ermita", "Tinago", "Busay"],
    startX: 444,
    startY: 648,
    cellW: 24,
    cellH: 22,
    cols: 3,
    skew: 4
  }),
  ...makeBarangayGrid({
    prefix: "112402",
    regionCode: "1100000000",
    regionName: "Davao Region",
    provinceCode: "1124000000",
    provinceName: "Davao del Sur",
    cityCode: "1124020000",
    cityName: "Davao City",
    names: ["Poblacion", "Buhangin", "Talomo", "Toril", "Calinan", "Agdao", "Sasa", "Bunawan"],
    startX: 600,
    startY: 872,
    cellW: 34,
    cellH: 30,
    cols: 3,
    skew: 8
  })
];

function makeBarangayGrid(config) {
  return config.names.map((name, index) => {
    const col = index % config.cols;
    const row = Math.floor(index / config.cols);
    const x = config.startX + col * config.cellW + row * config.skew;
    const y = config.startY + row * config.cellH;
    const jitter = (index % 2) * 3;
    const code = `${config.prefix}${String(index + 1).padStart(4, "0")}`.slice(0, 10);
    return f({
      code,
      name,
      level: "barangay",
      regionCode: config.regionCode,
      regionName: config.regionName,
      provinceCode: config.provinceCode,
      provinceName: config.provinceName,
      cityCode: config.cityCode,
      cityName: config.cityName,
      barangayCode: code,
      barangayName: name,
      polygons: [[[x, y + jitter], [x + config.cellW, y + 2], [x + config.cellW - 3, y + config.cellH], [x + 4, y + config.cellH - 2]]]
    });
  });
}

const SCOPES = [
  {
    id: "PH",
    name: "Philippines",
    type: "country",
    code: null,
    preferredLevel: "region",
    allowedLevels: ["region", "province", "city", "barangay"]
  },
  {
    id: "REG-13",
    name: "National Capital Region",
    type: "region",
    code: "1300000000",
    preferredLevel: "city",
    allowedLevels: ["city", "barangay"]
  },
  {
    id: "REG-07",
    name: "Central Visayas",
    type: "region",
    code: "0700000000",
    preferredLevel: "province",
    allowedLevels: ["province", "city", "barangay"]
  },
  {
    id: "REG-11",
    name: "Davao Region",
    type: "region",
    code: "1100000000",
    preferredLevel: "province",
    allowedLevels: ["province", "city", "barangay"]
  },
  {
    id: "PROV-0722",
    name: "Cebu",
    type: "province",
    code: "0722000000",
    preferredLevel: "city",
    allowedLevels: ["city", "barangay"]
  },
  {
    id: "PROV-1124",
    name: "Davao del Sur",
    type: "province",
    code: "1124000000",
    preferredLevel: "city",
    allowedLevels: ["city", "barangay"]
  },
  {
    id: "CITY-137404",
    name: "Quezon City",
    type: "city",
    code: "1374040000",
    preferredLevel: "barangay",
    allowedLevels: ["barangay"]
  },
  {
    id: "CITY-072217",
    name: "Cebu City",
    type: "city",
    code: "0722170000",
    preferredLevel: "barangay",
    allowedLevels: ["barangay"]
  },
  {
    id: "CITY-112402",
    name: "Davao City",
    type: "city",
    code: "1124020000",
    preferredLevel: "barangay",
    allowedLevels: ["barangay"]
  }
];

const state = {
  scopeId: "PH",
  level: "region",
  palette: "bay",
  classification: "equal",
  bins: 5,
  borderColor: "#ffffff",
  borderWidth: 1.5,
  missingColor: "#e8ebe6",
  highlightColor: "#f05a41",
  backgroundColor: "#f6f7f5",
  transparent: false,
  exportWidth: 1600,
  exportHeight: 2000,
  importedRows: [],
  columns: [],
  keyColumn: "psgc_code",
  valueColumn: "value",
  selectedCode: null,
  projectName: "Untitled demographic map"
};

const el = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  populateStaticControls();
  bindEvents();
  parseImportedCsv(SAMPLE_REGION_CSV, { scopeId: "PH", level: "region", projectName: "Regional sample map" });
  render();
}

function cacheElements() {
  [
    "scopeSelect",
    "levelSelect",
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
    "paletteSelect",
    "classificationSelect",
    "binsInput",
    "binsOutput",
    "borderColorInput",
    "borderWidthInput",
    "missingColorInput",
    "highlightColorInput",
    "backgroundColorInput",
    "transparentInput",
    "exportWidthInput",
    "exportHeightInput",
    "exportPngButton",
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
  el.saveProjectButton.addEventListener("click", saveProject);
  el.loadProjectButton.addEventListener("click", () => el.projectInput.click());
  el.projectInput.addEventListener("change", loadProject);
}

function parseImportedCsv(text, overrides = {}) {
  const parsed = parseCsv(text);
  Object.assign(state, overrides);
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

  syncColumnSelect(el.keyColumnSelect, state.keyColumn);
  syncColumnSelect(el.valueColumnSelect, state.valueColumn);

  el.paletteSelect.value = state.palette;
  el.classificationSelect.value = state.classification;
  el.binsInput.value = state.bins;
  el.binsOutput.value = String(state.bins);
  el.borderColorInput.value = state.borderColor;
  el.borderWidthInput.value = state.borderWidth;
  el.missingColorInput.value = state.missingColor;
  el.highlightColorInput.value = state.highlightColor;
  el.backgroundColorInput.value = state.backgroundColor;
  el.transparentInput.checked = state.transparent;
  el.exportWidthInput.value = state.exportWidth;
  el.exportHeightInput.value = state.exportHeight;
}

function syncColumnSelect(select, selected) {
  const options = state.columns.length ? state.columns : ["psgc_code", "value"];
  select.innerHTML = options.map((column) => `<option value="${escapeAttr(column)}">${escapeHtml(column)}</option>`).join("");
  if (options.includes(selected)) {
    select.value = selected;
  }
}

function renderHeader() {
  const scope = getScope();
  const levelLabel = LEVELS.find((level) => level.id === state.level)?.label || state.level;
  el.activePath.textContent = `${scope.name} / ${levelLabel}`;
  el.mapTitle.textContent = state.projectName || "Untitled demographic map";
  el.sourceStatus.textContent = "Sample boundary fixtures";

  const visibleCount = getVisibleFeatures().length;
  if (state.level === "barangay" && state.scopeId === "PH") {
    el.densityNote.textContent = "National barangay view is allowed here, but real production data should use vector tiles and focused scopes.";
  } else {
    el.densityNote.textContent = `${visibleCount} ${levelLabel.toLowerCase()} feature${visibleCount === 1 ? "" : "s"} visible.`;
  }
}

function renderMap() {
  const visibleFeatures = getVisibleFeatures();
  const join = buildJoin();
  const scale = buildScale(visibleFeatures, join.valueByCode);
  const bounds = boundsFromFeatures(visibleFeatures);
  const padding = Math.max(28, Math.min(bounds.width, bounds.height) * 0.08);
  const viewBox = [
    bounds.minX - padding,
    bounds.minY - padding,
    Math.max(1, bounds.width + padding * 2),
    Math.max(1, bounds.height + padding * 2)
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

  const shadow = createSvgElement("path", {
    d: visibleFeatures.flatMap((feature) => feature.polygons.map(pathFromPolygon)).join(" "),
    fill: "rgba(32, 35, 31, 0.08)",
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

    feature.polygons.forEach((polygon) => {
      const fill = getFeatureFill(feature, featureValue, scale);
      const path = createSvgElement("path", {
        d: pathFromPolygon(polygon),
        fill,
        stroke: selected ? state.highlightColor : state.borderColor,
        "stroke-width": selected ? state.borderWidth + 1.4 : state.borderWidth,
        "stroke-linejoin": "round",
        "vector-effect": "non-scaling-stroke"
      });
      group.appendChild(path);
    });

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
      <span>${formatNumber(Math.min(...values))}</span>
      <span>${formatNumber(Math.max(...values))}</span>
    </div>
  `;
}

function renderMatchSummary() {
  const join = buildJoin();
  el.matchSummary.innerHTML = [
    ["Rows", state.importedRows.length],
    ["Matched", join.matchedRows.length],
    ["Unmatched", join.unmatchedRows.length]
  ]
    .map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function renderReviewTable() {
  const join = buildJoin();
  const matched = join.matchedRows.slice(0, 4).map((item) => ({
    status: "Matched",
    code: item.code,
    name: item.feature.name
  }));
  const unmatched = join.unmatchedRows.slice(0, 4).map((row) => ({
    status: "Unmatched",
    code: normalizeCode(row[state.keyColumn]),
    name: row.name || row.Name || ""
  }));
  const rows = [...matched, ...unmatched];

  if (!state.importedRows.length) {
    el.reviewTable.innerHTML = `<p class="empty-state">No imported rows.</p>`;
    return;
  }

  if (!rows.length) {
    el.reviewTable.innerHTML = `<p class="empty-state">Imported rows do not match the selected map level.</p>`;
    return;
  }

  el.reviewTable.innerHTML = `
    <table class="review-table">
      <thead><tr><th>Status</th><th>PSGC</th><th>Name</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr><td>${row.status}</td><td><code>${escapeHtml(row.code || "-")}</code></td><td>${escapeHtml(row.name || "-")}</td></tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildJoin() {
  const levelFeatures = ADMIN_FEATURES.filter((feature) => feature.level === state.level);
  const byCode = new Map(levelFeatures.map((feature) => [feature.code, feature]));
  const valueByCode = new Map();
  const matchedRows = [];
  const unmatchedRows = [];
  const duplicates = [];

  state.importedRows.forEach((row) => {
    const code = normalizeCode(row[state.keyColumn]);
    const value = parseValue(row[state.valueColumn]);
    if (!code) {
      unmatchedRows.push(row);
      return;
    }
    const feature = byCode.get(code);
    if (!feature) {
      unmatchedRows.push(row);
      return;
    }
    if (valueByCode.has(code)) {
      duplicates.push(row);
    }
    valueByCode.set(code, value);
    matchedRows.push({ row, code, feature, value });
  });

  return { valueByCode, matchedRows, unmatchedRows, duplicates };
}

function getFeatureFill(feature, value, scale) {
  if (state.selectedCode === feature.code) {
    return state.highlightColor;
  }
  if (state.classification === "highlight") {
    return Number.isFinite(value) ? state.highlightColor : state.missingColor;
  }
  if (!Number.isFinite(value)) {
    return state.missingColor;
  }
  return scale.colorForValue(value);
}

function buildScale(features, valueByCode) {
  const values = features.map((feature) => valueByCode.get(feature.code)).filter(Number.isFinite).sort((a, b) => a - b);
  const palette = PALETTES[state.palette] || PALETTES.bay;
  const colorCount = state.classification === "continuous" ? palette.colors.length : state.bins;
  const colors = sampleColors(palette.colors, colorCount);

  if (!values.length) {
    return { colors, colorForValue: () => colors[0] };
  }

  const min = values[0];
  const max = values[values.length - 1];

  if (state.classification === "continuous") {
    return {
      colors,
      colorForValue(value) {
        const t = max === min ? 1 : (value - min) / (max - min);
        return interpolateRamp(palette.colors, clamp(t, 0, 1));
      }
    };
  }

  if (state.classification === "quantile") {
    const thresholds = colors.slice(1).map((_, index) => quantile(values, (index + 1) / colors.length));
    return {
      colors,
      colorForValue(value) {
        const bin = thresholds.findIndex((threshold) => value <= threshold);
        return colors[bin === -1 ? colors.length - 1 : bin];
      }
    };
  }

  return {
    colors,
    colorForValue(value) {
      if (max === min) return colors[colors.length - 1];
      const index = Math.min(colors.length - 1, Math.floor(((value - min) / (max - min)) * colors.length));
      return colors[index];
    }
  };
}

function getVisibleFeatures() {
  const scope = getScope();
  return ADMIN_FEATURES.filter((feature) => feature.level === state.level && featureInScope(feature, scope));
}

function featureInScope(feature, scope) {
  if (scope.type === "country") return true;
  if (scope.type === "region") {
    return feature.regionCode === scope.code || feature.code === scope.code;
  }
  if (scope.type === "province") {
    return feature.provinceCode === scope.code || feature.code === scope.code;
  }
  if (scope.type === "city") {
    return feature.cityCode === scope.code || feature.code === scope.code;
  }
  return true;
}

function featureByCode(code) {
  return ADMIN_FEATURES.find((feature) => feature.code === code);
}

function getScope() {
  return SCOPES.find((scope) => scope.id === state.scopeId) || SCOPES[0];
}

function boundsFromFeatures(features) {
  if (!features.length) {
    return { minX: 0, minY: 0, maxX: 900, maxY: 1100, width: 900, height: 1100 };
  }
  const points = features.flatMap((feature) => feature.polygons.flat());
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function pathFromPolygon(polygon) {
  const [first, ...rest] = polygon;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
}

function createSvgElement(tag, attrs) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function showTooltip(event, feature, value) {
  const rect = el.mapStage.getBoundingClientRect();
  el.mapTooltip.hidden = false;
  el.mapTooltip.style.left = `${event.clientX - rect.left + 12}px`;
  el.mapTooltip.style.top = `${event.clientY - rect.top + 12}px`;
  el.mapTooltip.innerHTML = `
    <strong>${escapeHtml(feature.name)}</strong><br>
    <code>${escapeHtml(feature.code)}</code><br>
    Value: ${Number.isFinite(value) ? formatNumber(value) : "Missing"}
  `;
}

function hideTooltip() {
  el.mapTooltip.hidden = true;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  const columns = (rows.shift() || []).map((cell) => cell.trim());
  return {
    columns,
    rows: rows.map((cells) =>
      Object.fromEntries(columns.map((column, index) => [column, (cells[index] || "").trim()]))
    )
  };
}

function chooseColumn(columns, candidates, fallback) {
  const lower = new Map(columns.map((column) => [column.toLowerCase(), column]));
  for (const candidate of candidates) {
    if (lower.has(candidate)) return lower.get(candidate);
  }
  return fallback;
}

function chooseNumericColumn(rows, columns) {
  const preferred = chooseColumn(columns, ["value", "count", "rate", "population", "households"], "");
  if (preferred) return preferred;
  return columns.find((column) => rows.some((row) => Number.isFinite(parseValue(row[column]))));
}

function normalizeCode(value) {
  return String(value || "").trim().replace(/[^0-9A-Za-z-]/g, "");
}

function parseValue(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const number = Number(String(value).replace(/,/g, "").replace(/%$/, ""));
  return Number.isFinite(number) ? number : NaN;
}

function sampleColors(colors, count) {
  if (count >= colors.length) return colors.slice();
  if (count <= 1) return [colors[colors.length - 1]];
  return Array.from({ length: count }, (_, index) => interpolateRamp(colors, index / (count - 1)));
}

function interpolateRamp(colors, t) {
  const scaled = t * (colors.length - 1);
  const left = Math.floor(scaled);
  const right = Math.min(colors.length - 1, Math.ceil(scaled));
  const localT = scaled - left;
  return mixHex(colors[left], colors[right], localT);
}

function mixHex(a, b, t) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  const mixed = left.map((channel, index) => Math.round(channel + (right[index] - channel) * t));
  return rgbToHex(mixed);
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
}

function rgbToHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) return NaN;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

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

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value) {
  return String(value || "demographic-map")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
