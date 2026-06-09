"use strict";

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

function rowsToCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}
