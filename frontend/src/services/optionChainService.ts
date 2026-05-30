import apiClient from "./apiClient";
import type { Instrument, OptionChainRow, Quote } from "../types";

export const buildOptionChain = (
  underlying: string,
  expiry: string,
  instruments: Instrument[],
  quotes: Record<string, Quote>,
): OptionChainRow[] => {
  const rows = new Map<number, OptionChainRow>();
  const filtered = instruments.filter(
    (instrument) =>
      instrument.name === underlying &&
      instrument.segment === "NFO-OPT" &&
      instrument.expiry === expiry,
  );

  filtered.forEach((instrument) => {
    const key = instrument.strike ?? 0;
    const quote = quotes[instrument.tradingsymbol];
    const existing = rows.get(key) ?? { strike: key, ceInstrument: null, peInstrument: null };
    if (instrument.instrument_type === "CE") {
      existing.ceInstrument = instrument;
      existing.ceLtp = quote?.last_price;
      existing.ceOi = quote?.oi;
      existing.ceVolume = quote?.volume;
      existing.ceChange = quote?.change;
    } else if (instrument.instrument_type === "PE") {
      existing.peInstrument = instrument;
      existing.peLtp = quote?.last_price;
      existing.peOi = quote?.oi;
      existing.peVolume = quote?.volume;
      existing.peChange = quote?.change;
    }
    rows.set(key, existing);
  });

  return Array.from(rows.values()).sort((left, right) => left.strike - right.strike);
};

export const optionChainService = {
  async getChain(underlying: string, expiry: string, instruments: Instrument[], quotes: Record<string, Quote>) {
    if (import.meta.env.VITE_USE_MOCK_DATA === "true") {
      return buildOptionChain(underlying, expiry, instruments, quotes);
    }
    // Zerodha integration point:
    // Your backend can either return a ready-made option chain table or raw quotes to assemble here.
    const response = await apiClient.get<OptionChainRow[]>("/option-chain", {
      params: { underlying, expiry },
    });
    return response.data;
  },
};
