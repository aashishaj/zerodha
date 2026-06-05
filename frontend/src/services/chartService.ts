import apiClient from "./apiClient";
import { mockCandles } from "../mocks/candles";
import type { Candle, Timeframe } from "../types";

const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

const intervalMap: Record<Timeframe, string> = {
  "5s": "5second",
  "10s": "10second",
  "15s": "15second",
  "30s": "30second",
  "1m": "minute",
  "2m": "2minute",
  "3m": "3minute",
  "4m": "4minute",
  "5m": "5minute",
  "10m": "10minute",
  "15m": "15minute",
  "30m": "30minute",
  "1h": "60minute",
  "1d": "day",
  "1w": "week",
};

export const chartService = {
  async getCandles(instrumentToken: number, timeframe: Timeframe, from?: string): Promise<Candle[]> {
    if (useMock) {
      return mockCandles[String(instrumentToken)]?.[timeframe] ?? [];
    }
    // Zerodha integration point:
    // Backend should resolve and call Kite historical candles API.
    // Historical fetch must work even when the market is closed, returning latest available bars.
    const response = await apiClient.get<Candle[]>(`/historical/${instrumentToken}`, {
      params: {
        interval: intervalMap[timeframe],
        ...(from ? { from } : {}),
      },
    });
    return response.data;
  },
};
