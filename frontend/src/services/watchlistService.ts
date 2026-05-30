import type { WatchlistItem } from "../types";

const KEY = "kite-inspired-watchlist";

export const watchlistService = {
  load(): WatchlistItem[] {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  save(items: WatchlistItem[]) {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  },
};
