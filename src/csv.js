"use strict";

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      if (inQuotes) { inQuotes = false; closedQuote = true; }
      else {
        if (current.trim() || closedQuote) throw new Error("CSV contains a quote inside an unquoted field.");
        current = "";
        inQuotes = true;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      closedQuote = false;
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      current = "";
      closedQuote = false;
    } else {
      if (closedQuote && char.trim()) throw new Error("CSV contains text after a closing quote.");
      current += char;
    }
  }
  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");
  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);

  const columns = (rows.shift() || []).map((cell) => cell.trim());
  if (columns.some((column) => !column)) throw new Error("CSV column names must not be blank.");
  if (new Set(columns.map((column) => column.toLowerCase())).size !== columns.length) throw new Error("CSV column names must be unique.");
  rows.forEach((cells, index) => {
    if (cells.length !== columns.length) throw new Error(`CSV data row ${index + 1} has ${cells.length} fields; expected ${columns.length}. Quote values containing commas.`);
  });
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

function chooseNumericColumn(rows, columns, keyColumn = chooseColumn(columns, ["psgc_code", "psgc", "code"], columns[0])) {
  const candidates = columns.filter((column) => column !== keyColumn && !/^(?:psgc(?:_code)?|code|id|.*_(?:code|id))$/i.test(column));
  const preferred = chooseColumn(candidates, ["value", "count", "rate", "population", "households"], "");
  if (preferred) return preferred;
  return candidates.find((column) => rows.some((row) => Number.isFinite(parseValue(row[column]))));
}

function normalizeCode(value) {
  return String(value || "").trim().replace(/[^0-9A-Za-z_-]/g, "");
}

function parseValue(value) {
  const text = String(value ?? "").trim().replace(/,/g, "").replace(/%$/, "");
  if (!text.trim()) return NaN;
  const number = Number(text);
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
