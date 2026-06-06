import type { IndicatorInstance } from "../../types";

// Editable subset of an indicator — what the settings modal can change
export type IndicatorDraft = Pick<
  IndicatorInstance,
  | "color"
  | "lineWidth"
  | "lineStyle"
  | "showPriceLine"
  | "showLastValue"
  | "length"
  | "source"
  | "anchorPeriod"
  | "showOnAllIntervals"
  | "intervals"
>;

// Built-in factory defaults per indicator type
export function builtInDefaults(type: IndicatorInstance["type"]): IndicatorDraft {
  if (type === "VWAP") {
    return {
      color: "#2196f3",
      lineWidth: 2,
      lineStyle: "solid",
      showPriceLine: true,
      showLastValue: true,
      source: "hlc3",
      anchorPeriod: "Session",
      showOnAllIntervals: true,
      intervals: [],
    };
  }
  return {
    color: "#8e44ad",
    lineWidth: 2,
    lineStyle: "solid",
    showPriceLine: true,
    showLastValue: true,
    length: 7,
    source: "close",
    showOnAllIntervals: true,
    intervals: [],
  };
}

const keyFor = (type: IndicatorInstance["type"]) => `indicatorDefaults:${type}`;

// User-saved defaults take precedence over built-in when present
export function loadDefaults(type: IndicatorInstance["type"]): IndicatorDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(keyFor(type)) ?? "null") as IndicatorDraft | null;
    if (stored) return { ...builtInDefaults(type), ...stored };
  } catch {
    // ignore malformed storage
  }
  return builtInDefaults(type);
}

export function saveDefaults(type: IndicatorInstance["type"], draft: IndicatorDraft): void {
  try {
    localStorage.setItem(keyFor(type), JSON.stringify(draft));
  } catch {
    // storage may be unavailable — fail safely
  }
}
