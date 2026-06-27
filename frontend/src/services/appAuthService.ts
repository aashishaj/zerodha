import apiClient from "./apiClient";
import type { ActiveAccount, AppUser } from "../types";

/**
 * App-level authentication (our username/password layer, distinct from the
 * Zerodha OAuth login). All calls go through the same-origin `/api` proxy, so
 * the HttpOnly session cookie is sent automatically.
 */
export const appAuthService = {
  async login(username: string, password: string): Promise<AppUser> {
    const resp = await apiClient.post("/app/login", { username, password });
    return resp.data.user as AppUser;
  },

  async me(): Promise<{ user: AppUser; activeAccount: ActiveAccount | null } | null> {
    try {
      const resp = await apiClient.get("/app/me");
      return {
        user: resp.data.user as AppUser,
        activeAccount: (resp.data.activeAccount ?? null) as ActiveAccount | null,
      };
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await apiClient.post("/app/logout");
  },
};
