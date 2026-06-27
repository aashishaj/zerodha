import apiClient from "./apiClient";
import { mockQuotes } from "../mocks/quotes";
import type { Funds, Quote } from "../types";

const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

export const marketDataService = {
  async getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
    if (useMock) {
      return Object.fromEntries(symbols.map((symbol) => [symbol, mockQuotes[symbol]]).filter((entry) => entry[1]));
    }
    // Zerodha integration point:
    // Backend should call Kite quote API and flatten quote payloads for the frontend.
    const response = await apiClient.get<Record<string, Quote>>("/quote", {
      params: { symbols: symbols.join(",") },
    });
    return response.data;
  },
  async getProfile() {
    if (useMock) return { userId: "AB1234", name: "Mock Trader" };
    // Zerodha integration point:
    // Backend should manage access token server-side and return safe profile data here.
    const response = await apiClient.get("/profile");
    return response.data;
  },
  async getFunds(): Promise<Funds> {
    if (useMock) return { availableCash: 100000 };
    // Zerodha integration point:
    // Backend reads Kite margins server-side and returns the spendable equity cash.
    const response = await apiClient.get<Funds>("/funds");
    return response.data;
  },
};
