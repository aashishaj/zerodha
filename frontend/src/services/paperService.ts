import apiClient from "./apiClient";

/** Paper-trading controls; the endpoint exists only on `run.py api --paper`. */
export const paperService = {
  /** Moves an instrument's simulated price, filling or triggering what it crosses. */
  async setPrice(instrumentToken: number, price: number): Promise<{ ok: boolean; last_price: number }> {
    const resp = await apiClient.post("/paper/price", { instrument_token: instrumentToken, price });
    return resp.data;
  },
};
