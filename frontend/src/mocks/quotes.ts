import type { Quote } from "../types";
import { mockInstruments } from "./instruments";

export const mockQuotes: Record<string, Quote> = Object.fromEntries(
  mockInstruments.map((instrument, index) => {
    const seed = (index % 9) - 4;
    const change = instrument.last_price * (seed / 100);
    const lastPrice = Number((instrument.last_price + change).toFixed(2));
    const previousClose = Number((lastPrice - change).toFixed(2));

    return [
      instrument.tradingsymbol,
      {
        instrument_token: instrument.instrument_token,
        tradingsymbol: instrument.tradingsymbol,
        last_price: lastPrice,
        change: Number(change.toFixed(2)),
        changePercent: previousClose ? Number(((change / previousClose) * 100).toFixed(2)) : 0,
        open: previousClose,
        high: Number((lastPrice * 1.02).toFixed(2)),
        low: Number((lastPrice * 0.98).toFixed(2)),
        close: previousClose,
        volume: 10000 + index * 95,
        oi: 5000 + index * 70,
      } satisfies Quote,
    ];
  }),
);
