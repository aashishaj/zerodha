import apiClient from "./apiClient";
import type { Order } from "../types";

export const orderService = {
  async placeOrder(payload: {
    side: "BUY" | "SELL";
    exchange: string;
    tradingsymbol: string;
    product: string;
    order_type: string;
    validity: string;
    quantity: number;
    price?: number;
    trigger_price?: number;
  }): Promise<{ ok: boolean; order_id: string; message: string }> {
    const resp = await apiClient.post("/orders", payload);
    return resp.data;
  },

  async getOrders(): Promise<{ ok: boolean; orders: Order[] }> {
    const resp = await apiClient.get("/orders/list");
    return resp.data;
  },
};
