import type { Candle, Timeframe } from "../types";
import { mockInstruments } from "./instruments";

const stepUnits: Record<Timeframe, number> = {
  "5s": 5,
  "10s": 10,
  "15s": 15,
  "30s": 30,
  "1m": 1,
  "2m": 2,
  "3m": 3,
  "4m": 4,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "1d": 24 * 60,
  "1w": 7 * 24 * 60,
};

const generateSeries = (basePrice: number, timeframe: Timeframe): Candle[] => {
  const step = stepUnits[timeframe];
  const intervalMs = timeframe.endsWith("s") ? step * 1000 : step * 60_000;
  const points =
    timeframe === "1w"
      ? 80
      : timeframe === "1d"
        ? 120
        : timeframe.endsWith("s")
          ? 240
          : 180;
  const start = new Date("2026-05-15T09:15:00+05:30").getTime();
  let price = basePrice;

  return Array.from({ length: points }, (_, index) => {
    const drift = Math.sin(index / 7) * basePrice * 0.002 + Math.cos(index / 11) * basePrice * 0.001;
    const open = price;
    const close = Math.max(1, open + drift);
    const high = Math.max(open, close) + basePrice * 0.0015;
    const low = Math.min(open, close) - basePrice * 0.0013;
    price = close;

    return {
      time: new Date(start + index * intervalMs).toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 1000 + index * 15,
    };
  });
};

export const mockCandles: Record<string, Record<Timeframe, Candle[]>> = Object.fromEntries(
  mockInstruments.map((instrument) => [
    String(instrument.instrument_token),
    {
      "5s": generateSeries(instrument.last_price || 100, "5s"),
      "10s": generateSeries(instrument.last_price || 100, "10s"),
      "15s": generateSeries(instrument.last_price || 100, "15s"),
      "30s": generateSeries(instrument.last_price || 100, "30s"),
      "1m": generateSeries(instrument.last_price || 100, "1m"),
      "2m": generateSeries(instrument.last_price || 100, "2m"),
      "3m": generateSeries(instrument.last_price || 100, "3m"),
      "4m": generateSeries(instrument.last_price || 100, "4m"),
      "5m": generateSeries(instrument.last_price || 100, "5m"),
      "10m": generateSeries(instrument.last_price || 100, "10m"),
      "15m": generateSeries(instrument.last_price || 100, "15m"),
      "30m": generateSeries(instrument.last_price || 100, "30m"),
      "1h": generateSeries(instrument.last_price || 100, "1h"),
      "1d": generateSeries(instrument.last_price || 100, "1d"),
      "1w": generateSeries(instrument.last_price || 100, "1w"),
    },
  ]),
);
