import type { MarketDepth } from "../types";
import { mockInstruments } from "./instruments";
import { mockQuotes } from "./quotes";

export const mockDepth: Record<number, MarketDepth> = Object.fromEntries(
  mockInstruments.map((instrument, index) => {
    const quote = mockQuotes[instrument.tradingsymbol];
    const ltp = quote?.last_price ?? instrument.last_price ?? 100;
    const step = instrument.tick_size || 0.05;
    const bids = Array.from({ length: 5 }, (_, offset) => ({
      price: Number((ltp - step * (offset + 1)).toFixed(2)),
      quantity: 25 * (offset + 2) * Math.max(1, instrument.lot_size || 1),
      orders: offset + 1,
    }));
    const asks = Array.from({ length: 5 }, (_, offset) => ({
      price: Number((ltp + step * (offset + 1)).toFixed(2)),
      quantity: 20 * (offset + 2) * Math.max(1, instrument.lot_size || 1),
      orders: offset + 2,
    }));

    return [
      instrument.instrument_token,
      {
        instrument_token: instrument.instrument_token,
        tradingsymbol: instrument.tradingsymbol,
        last_price: ltp,
        bids,
        asks,
      } satisfies MarketDepth,
    ];
  }),
);
