import apiClient from "./apiClient";
import type { Position } from "../types";

export const positionsService = {
  async getPositions(): Promise<{ ok: boolean; positions: Position[] }> {
    const resp = await apiClient.get("/positions");
    return resp.data;
  },
};
