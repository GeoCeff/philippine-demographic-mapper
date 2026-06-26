"use strict";

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
  const customThresholds = parseThresholds(state.customThresholds);
  const colorCount = state.classification === "continuous" ? palette.colors.length : state.classification === "custom" && customThresholds.length ? customThresholds.length + 1 : state.bins;
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
      labels: legendLabels(min, max, thresholds),
      colorForValue(value) {
        const bin = thresholds.findIndex((threshold) => value <= threshold);
        return colors[bin === -1 ? colors.length - 1 : bin];
      }
    };
  }

  if (state.classification === "custom" && customThresholds.length) {
    return {
      colors,
      labels: legendLabels(min, max, customThresholds),
      colorForValue(value) {
        const bin = customThresholds.findIndex((threshold) => value <= threshold);
        return colors[bin === -1 ? colors.length - 1 : bin];
      }
    };
  }

  const thresholds = colors.slice(1).map((_, index) => min + ((max - min) * (index + 1)) / colors.length);
  return {
    colors,
    labels: legendLabels(min, max, thresholds),
    colorForValue(value) {
      if (max === min) return colors[colors.length - 1];
      const index = Math.min(colors.length - 1, Math.floor(((value - min) / (max - min)) * colors.length));
      return colors[index];
    }
  };
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

function parseThresholds(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

function legendLabels(min, max, thresholds) {
  return [min, ...thresholds, max].map(formatNumber);
}
