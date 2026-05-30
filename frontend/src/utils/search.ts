import type { Instrument, SearchQueryMeta } from "../types";

const optionMatcher = /\b(CE|PE)\b/i;
const strikeMatcher = /\b\d{4,6}\b/;
const underlyings = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;

export const parseSearchQuery = (query: string): SearchQueryMeta & { tokens: string[] } => {
  const normalized = query.trim().toUpperCase();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const strike = normalized.match(strikeMatcher)?.[0];
  const optionType = normalized.match(optionMatcher)?.[1]?.toUpperCase() as "CE" | "PE" | undefined;

  let underlying = tokens.find((token) => underlyings.includes(token as (typeof underlyings)[number]));
  if (!underlying && strike && tokens.length === 1) {
    underlying = "NIFTY";
  }

  return {
    tokens,
    underlying,
    strike: strike ? Number(strike) : undefined,
    optionType,
  };
};

const matchesUnderlying = (instrument: Instrument, underlying?: string) => {
  if (!underlying) return true;
  return instrument.name.toUpperCase() === underlying || instrument.tradingsymbol.toUpperCase() === underlying;
};

const tokenMatches = (instrument: Instrument, token: string) => {
  if (underlyings.includes(token as (typeof underlyings)[number])) {
    return matchesUnderlying(instrument, token);
  }

  if (token === "CE" || token === "PE") {
    return instrument.instrument_type.toUpperCase() === token;
  }

  if (/^\d{4,6}$/.test(token)) {
    return instrument.strike === Number(token);
  }

  const haystack = [
    instrument.tradingsymbol,
    instrument.name,
    instrument.segment,
    instrument.exchange,
    instrument.instrument_type,
    instrument.expiry ?? "",
  ].map((value) => value.toUpperCase());

  return haystack.some((value) => value.includes(token));
};

const scoreInstrument = (instrument: Instrument, query: string, meta: ReturnType<typeof parseSearchQuery>) => {
  const normalized = query.toUpperCase();
  let score = 0;

  if (instrument.tradingsymbol === normalized) score += 1000;
  if (instrument.name === meta.underlying) score += 500;
  if (meta.underlying && instrument.segment === "NFO-OPT") score += 140;
  if (meta.underlying && instrument.segment === "NFO-FUT") score += 100;
  if (instrument.tradingsymbol.includes(normalized)) score += 320;
  if (meta.strike && instrument.strike === meta.strike) score += 250;
  if (meta.optionType && instrument.instrument_type === meta.optionType) score += 120;
  if (instrument.segment === "NFO-OPT") score += 80;
  if (instrument.segment === "NFO-FUT") score += 50;
  if (instrument.segment.includes("INDEX")) score += 30;
  if (instrument.expiry) {
    const daysUntilExpiry = Math.floor((Date.parse(instrument.expiry) - Date.now()) / 86_400_000);
    score += Math.max(0, 25 - Math.abs(daysUntilExpiry));
  }
  if (instrument.instrument_type === "CE") score += 5;
  return score;
};

export const searchInstruments = (instruments: Instrument[], query: string) => {
  const meta = parseSearchQuery(query);
  const normalized = query.trim().toUpperCase();
  if (!normalized) return [] as Instrument[];

  const filtered = instruments.filter((instrument) => {
    if (!matchesUnderlying(instrument, meta.underlying)) {
      return false;
    }
    if (meta.strike && instrument.strike !== meta.strike) {
      return false;
    }
    if (meta.optionType && instrument.instrument_type !== meta.optionType) {
      return false;
    }

    if (meta.strike && meta.underlying) {
      return (
        instrument.segment === "NFO-OPT" ||
        instrument.segment === "NFO-FUT" ||
        instrument.segment.includes("INDEX")
      );
    }

    return meta.tokens.every((token) => tokenMatches(instrument, token));
  });

  return filtered.sort((left, right) => scoreInstrument(right, normalized, meta) - scoreInstrument(left, normalized, meta));
};
