import apiClient from "./apiClient";
import { mockInstruments } from "../mocks/instruments";
import type { Instrument } from "../types";
import { searchInstruments } from "../utils/search";

const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

export const instrumentsService = {
  async getInstruments(): Promise<Instrument[]> {
    if (useMock) return mockInstruments;
    // Zerodha integration point:
    // This endpoint should proxy Kite Connect instruments dump via your backend.
    const response = await apiClient.get<Instrument[]>("/instruments");
    return response.data;
  },
  async search(query: string, instruments: Instrument[]) {
    return searchInstruments(instruments, query);
  },
};
