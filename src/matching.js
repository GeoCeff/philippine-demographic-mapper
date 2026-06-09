"use strict";

function buildJoin() {
  const scope = getScope();
  const levelFeatures = ADMIN_FEATURES.filter((feature) => feature.level === state.level);
  const byCode = new Map(levelFeatures.map((feature) => [feature.code, feature]));
  const allByCode = new Map(ADMIN_FEATURES.map((feature) => [feature.code, feature]));
  const codeCounts = countImportedCodes();
  const valueByCode = new Map();
  const mappedRowsByCode = new Map();
  const matchedRows = [];
  const unmatchedRows = [];
  const duplicateRows = [];
  const invalidValueRows = [];
  const issueRows = [];

  state.importedRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const code = normalizeCode(row[state.keyColumn]);
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
    if (anyFeature && anyFeature.level !== state.level) {
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
        detail: "No geography fixture has this PSGC code."
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

  return { valueByCode, matchedRows, mappedRows: [...mappedRowsByCode.values()], unmatchedRows, duplicateRows, invalidValueRows, issueRows };
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
  return [feature.regionName, feature.provinceName, feature.cityName].filter(Boolean).join(" / ") || "Philippines";
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
