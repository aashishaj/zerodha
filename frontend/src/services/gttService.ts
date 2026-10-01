import apiClient from "./apiClient";
import type { Gtt, GttPlacePayload, GttPlan } from "../types";

export const gttService = {
  async getGtts(): Promise<{ ok: boolean; gtts: Gtt[] }> {
    const resp = await apiClient.get("/gtt");
    return resp.data;
  },

  /** Places the OCO GTT(s), or with `dry_run` only returns the plan. */
  async placeGtt(payload: GttPlacePayload): Promise<GttPlan> {
    const resp = await apiClient.post("/gtt", payload);
    return resp.data;
  },

  async deleteGtt(triggerId: number | string): Promise<{ ok: boolean; message: string }> {
    const resp = await apiClient.post("/gtt/delete", { trigger_id: String(triggerId) });
    return resp.data;
  },
};
