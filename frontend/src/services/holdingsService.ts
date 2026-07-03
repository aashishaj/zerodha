import apiClient from "./apiClient";
import type { Holding } from "../types";

export const holdingsService = {
  async getHoldings(): Promise<{ ok: boolean; holdings: Holding[] }> {
    const resp = await apiClient.get("/holdings");
    return resp.data;
  },
};
