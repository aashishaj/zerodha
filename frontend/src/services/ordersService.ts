import apiClient from "./apiClient";
import type { OrderTicketPayload } from "../types";

const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

export const ordersService = {
  async placeOrder(payload: OrderTicketPayload): Promise<{ ok: boolean; message: string; order_id?: string }> {
    if (useMock) {
      return {
        ok: true,
        message: `${payload.side} order prepared for ${payload.tradingsymbol} in mock mode.`,
        order_id: `mock-${payload.instrument_token}-${payload.side.toLowerCase()}`,
      };
    }

    // Zerodha integration point:
    // Orders are sent only to the backend. The backend owns access tokens and talks to Kite Connect.
    const response = await apiClient.post<{ ok: boolean; message: string; order_id?: string }>("/orders", payload);
    return response.data;
  },
};
