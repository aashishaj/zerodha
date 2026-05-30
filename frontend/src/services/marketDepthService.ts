import apiClient from "./apiClient";
import { mockDepth } from "../mocks/depth";
import type { MarketDepth } from "../types";

const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

export const marketDepthService = {
  async getDepth(instrumentToken: number): Promise<MarketDepth> {
    if (useMock) {
      const payload = mockDepth[instrumentToken];
      if (!payload) {
        throw new Error("Mock market depth not found.");
      }
      return payload;
    }

    // Zerodha integration point:
    // Backend resolves depth from Kite quote/depth APIs and returns a flattened payload here.
    const response = await apiClient.get<MarketDepth>("/depth", {
      params: { instrumentToken },
    });
    return response.data;
  },
};
