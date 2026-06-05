import axios from "axios";
import type { Order, OrderTicketPayload } from "../types";

const API_BASE = "http://127.0.0.1:8080";

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
    const resp = await axios.post(`${API_BASE}/api/orders`, payload);
    return resp.data;
  },

  async getOrders(): Promise<{ ok: boolean; orders: Order[] }> {
    const resp = await axios.get(`${API_BASE}/api/orders/list`);
    return resp.data;
  },
};
