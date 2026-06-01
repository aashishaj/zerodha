import apiClient from "./apiClient";
import type { WatchlistItem } from "../types";

const LS_KEY = "kite-inspired-watchlist";

export const watchlistService = {
  /** Load from backend (file on disk). Falls back to localStorage if API fails. */
  async load(): Promise<WatchlistItem[]> {
    try {
      const { data } = await apiClient.get<WatchlistItem[]>("/watchlist");
      if (Array.isArray(data)) {
        // Keep localStorage in sync so offline fallback stays fresh
        localStorage.setItem(LS_KEY, JSON.stringify(data));
        return data;
      }
    } catch {
      // API unavailable — fall back to localStorage
    }
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  /** Persist to backend (file on disk) + localStorage cache. */
  save(items: WatchlistItem[]) {
    // Write to localStorage immediately (synchronous, used as fast cache)
    localStorage.setItem(LS_KEY, JSON.stringify(items));
    // Fire-and-forget to backend — no need to await in hot paths
    apiClient.post("/watchlist", items).catch(() => {
      // Silently ignore if backend is down; localStorage copy is still valid
    });
  },
};
