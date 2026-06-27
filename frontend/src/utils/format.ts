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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const ordinalDay = (day: number) => {
  const v = day % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${day}${suffix}`;
};

interface InstrumentLabelParts {
  tradingsymbol: string;
  name?: string;
  expiry?: string | null;
  strike?: number | null;
  instrument_type?: string;
}

/**
 * Human-readable label for an instrument. Options (CE/PE) render as
 * "NIFTY 16th JUN 24000 CE" using the structured expiry/strike fields instead
 * of the cryptic Zerodha tradingsymbol (e.g. "NIFTY2661624000CE"). Everything
 * else falls back to the tradingsymbol unchanged.
 */
export const formatInstrumentLabel = (instrument: InstrumentLabelParts): string => {
  const type = instrument.instrument_type;
  if ((type === "CE" || type === "PE") && instrument.expiry && instrument.strike != null) {
    const [, month, day] = instrument.expiry.split("-").map(Number);
    if (month >= 1 && month <= 12 && day) {
      const name = instrument.name || instrument.tradingsymbol;
      return `${name} ${ordinalDay(day)} ${MONTHS[month - 1]} ${instrument.strike} ${type}`;
    }
  }
  return instrument.tradingsymbol;
};
