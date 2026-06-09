"use strict";

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
