"use strict";

function formatNumber(value, precision = typeof state === "undefined" ? "auto" : state.numberPrecision ?? "auto") {
  const digits = typeof precision === "string" && /^[0-8]$/.test(precision) ? Number(precision) : precision;
  const options = Number.isInteger(digits) && digits >= 0 && digits <= 8
    ? { maximumFractionDigits: digits }
    : Number.isInteger(value) ? { maximumFractionDigits: 0 }
      : { maximumSignificantDigits: 12, ...(value && Math.abs(value) < 0.000001 ? { notation: "scientific" } : {}) };
  return new Intl.NumberFormat("en-US", options).format(value);
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

function contrastRatio(left, right) {
  const a = relativeLuminance(hexToChannels(left));
  const b = relativeLuminance(hexToChannels(right));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hexToChannels(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return [0, 0, 0];
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16) / 255);
}

function relativeLuminance(channels) {
  return channels
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}
