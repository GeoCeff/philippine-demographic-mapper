"use strict";

let featureIndex = null;

function getFeatureIndex() {
  const base = state.boundarySource === "generated" ? generatedAdminFeatures : ADMIN_FEATURES;
  const loaded = state.boundarySource === "generated" && state.level === "barangay" ? getLoadedGeneratedBarangays() : null;
  const barangays = loaded?.length ? loaded : null;
  if (featureIndex?.base === base && featureIndex.barangays === barangays) return featureIndex;
  const features = barangays ? base.concat(barangays) : base, byCode = new Map(), allByCode = new Map();
  for (const feature of features) {
    if (!byCode.has(feature.code)) byCode.set(feature.code, feature);
    allByCode.set(feature.code, feature);
  }
  // Boundary loads replace arrays; one current index avoids retaining evicted barangay chunks.
  featureIndex = { base, barangays, features, byCode, allByCode, levels: new Map(), visible: null };
  return featureIndex;
}

function getLevelFeatureIndex(level = state.level) {
  const index = getFeatureIndex();
  if (!index.levels.has(level)) {
    const features = index.features.filter((feature) => featureMatchesLevel(feature, level));
    index.levels.set(level, { features, byCode: new Map(features.map((feature) => [feature.code, feature])) });
  }
  return index.levels.get(level);
}

function buildJoin() {
  const scope = getScope();
  const { byCode } = getLevelFeatureIndex();
  const { allByCode } = getFeatureIndex();
  const codeCounts = countImportedCodes();
  const valueByCode = new Map();
  const mappedRowsByCode = new Map();
  const importedRowByCode = new Map();
  const matchedRows = [];
  const unmatchedRows = [];
  const duplicateRows = [];
  const invalidValueRows = [];
  const issueRows = [];

  state.importedRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const code = normalizeCode(row[state.keyColumn]);
    if (code) importedRowByCode.set(code, row);
    const value = parseValue(row[state.valueColumn]);
    const valueText = String(row[state.valueColumn] || "").trim();
    const duplicate = Boolean(code && codeCounts.get(code) > 1);

    if (!code) {
      const issue = createIssue({
        type: "missing_code",
        status: "Missing code",
        severity: "error",
        row,
        rowNumber,
        code,
        valueText,
        detail: `No PSGC code found in "${state.keyColumn}".`
      });
      unmatchedRows.push(issue);
      issueRows.push(issue);
      return;
    }

    const anyFeature = allByCode.get(code);
    if (anyFeature && !featureMatchesLevel(anyFeature, state.level)) {
      const issue = createIssue({
        type: "wrong_level",
        status: "Wrong level",
        severity: "error",
        row,
        rowNumber,
        code,
        valueText,
        matchedName: anyFeature.name,
        detail: `This code is ${levelLabel(anyFeature.level)}, but the map level is ${levelLabel(state.level)}.`
      });
      unmatchedRows.push(issue);
      issueRows.push(issue);
      return;
    }

    const feature = byCode.get(code);
    if (!feature) {
      const issue = createIssue({
        type: "unknown_code",
        status: "Unknown code",
        severity: "error",
        row,
        rowNumber,
        code,
        valueText,
        detail: "No mapped place has this code. Check the place code and boundary coverage."
      });
      unmatchedRows.push(issue);
      issueRows.push(issue);
      return;
    }

    if (!featureInScope(feature, scope)) {
      const issue = createIssue({
        type: "outside_scope",
        status: "Outside scope",
        severity: "error",
        row,
        rowNumber,
        code,
        valueText,
        matchedName: feature.name,
        detail: `${feature.name} belongs to ${featurePath(feature)}, not ${scope.name}.`
      });
      unmatchedRows.push(issue);
      issueRows.push(issue);
      return;
    }

    const item = { row, rowNumber, code, feature, value, valueText, duplicate };
    matchedRows.push(item);

    if (duplicate) {
      const issue = createIssue({
        type: "duplicate_code",
        status: "Duplicate",
        severity: "warn",
        row,
        rowNumber,
        code,
        valueText,
        matchedName: feature.name,
        detail: "This PSGC code appears more than once; the latest row is used on the map."
      });
      duplicateRows.push(issue);
      issueRows.push(issue);
    }

    if (!Number.isFinite(value)) {
      valueByCode.delete(code);
      mappedRowsByCode.delete(code);
      const issue = createIssue({
        type: "invalid_value",
        status: "Value issue",
        severity: "warn",
        row,
        rowNumber,
        code,
        valueText,
        matchedName: feature.name,
        detail: `Value in "${state.valueColumn}" is blank or non-numeric.`
      });
      invalidValueRows.push(issue);
      issueRows.push(issue);
      return;
    }

    valueByCode.set(code, value);
    mappedRowsByCode.set(code, item);
  });

  let manualCount = 0;
  for (const [code, override] of Object.entries(state.placeOverrides || {})) {
    const feature = byCode.get(code);
    if (!feature || !featureInScope(feature, scope)) continue;
    manualCount += 1;
    if (Object.hasOwn(override, "value")) {
      const value = parseValue(override.value);
      if (Number.isFinite(value)) {
        valueByCode.set(code, value);
        mappedRowsByCode.set(code, { code, feature, value, row: mappedRowsByCode.get(code)?.row || {} });
      } else {
        valueByCode.delete(code);
        mappedRowsByCode.delete(code);
      }
    }
  }
  return { valueByCode, matchedRows, mappedRows: [...mappedRowsByCode.values()], importedRowByCode, unmatchedRows, duplicateRows, invalidValueRows, issueRows, manualCount };
}

function countImportedCodes() {
  const counts = new Map();
  state.importedRows.forEach((row) => {
    const code = normalizeCode(row[state.keyColumn]);
    if (!code) return;
    counts.set(code, (counts.get(code) || 0) + 1);
  });
  return counts;
}

function createIssue(config) {
  return {
    type: config.type,
    status: config.status,
    severity: config.severity,
    row: config.row,
    rowNumber: config.rowNumber,
    code: config.code,
    inputName: getImportedName(config.row),
    matchedName: config.matchedName || "",
    valueText: config.valueText,
    detail: config.detail
  };
}

function getImportedName(row) {
  return row.name || row.Name || row.area_name || row.AREA_NAME || row.location || row.Location || "";
}

function levelLabel(level) {
  return LEVELS.find((item) => item.id === level)?.label || level;
}

function featurePath(feature) {
  return placeParents(feature).map(([, name]) => name).join(" / ") || "Philippines";
}

function placeParents(feature) {
  const city = feature.level === "city" ? feature : feature.level === "barangay" ? featureByCode(feature.cityCode) : null;
  const independent = ["highly_urbanized_city", "independent_component_city"].includes(city?.adminType);
  return [
    ["Region", feature.level !== "region" ? feature.regionName : ""],
    ["Province", ["city", "barangay"].includes(feature.level) && !independent ? feature.provinceName : ""],
    ["City / municipality", feature.level === "barangay" ? feature.cityName : ""]
  ].filter(([, name]) => name);
}

function placeTypeLabel(feature) {
  return ({ municipality: "Municipality", component_city: "Component city", highly_urbanized_city: "Highly urbanized city",
    independent_component_city: "Independent component city" })[feature.adminType]
    || ({ region: "Region", province: "Province", city: "City / municipality", barangay: "Barangay" })[feature.level] || levelLabel(feature.level);
}
function getVisibleFeatures() {
  const scope = getScope(), index = getFeatureIndex(), level = getLevelFeatureIndex();
  if (scope.type === "country") return level.features;
  if (index.visible?.scope !== scope || index.visible.level !== state.level) {
    index.visible = { scope, level: state.level, features: level.features.filter((feature) => featureInScope(feature, scope)) };
  }
  return index.visible.features;
}

function featureMatchesLevel(feature, level) {
  return feature.level === level || (level === "province" && feature.level === "city" &&
    ["highly_urbanized_city", "independent_component_city"].includes(feature.adminType));
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
  return getFeatureIndex().byCode.get(code);
}

function getScope() {
  const scopes = getScopes();
  return scopes.find((scope) => scope.id === state.scopeId) || scopes[0];
}
