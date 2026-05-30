export const formatPrice = (value: number | undefined | null) =>
  value == null ? "-" : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatCompact = (value: number | undefined | null) =>
  value == null ? "-" : value.toLocaleString("en-IN", { notation: "compact", maximumFractionDigits: 2 });

export const formatChange = (value: number | undefined | null) => {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPrice(value)}`;
};

export const formatPercent = (value: number | undefined | null) => {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export const movementClass = (value: number | undefined | null) => {
  if (value == null || value === 0) return "text-slate-500";
  return value > 0 ? "text-positive" : "text-negative";
};
