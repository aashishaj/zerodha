import apiClient from "./apiClient";
import type { AccountSummary, AppUser, AppRole } from "../types";

/**
 * Zerodha account management + selection. Accounts are connected by a super
 * admin via the Zerodha OAuth flow; buyers/sellers pick from accounts assigned
 * to them. All routes are session-cookie protected through the `/api` proxy.
 */
export const accountsService = {
  async list(): Promise<AccountSummary[]> {
    const resp = await apiClient.get("/accounts");
    return resp.data.accounts as AccountSummary[];
  },

  async select(accountId: number): Promise<void> {
    await apiClient.post("/session/select-account", { accountId });
  },

  /** Super-admin: get the Zerodha OAuth URL to connect (or re-connect) an account. */
  async connectUrl(): Promise<string> {
    const resp = await apiClient.get("/auth/login-url");
    return resp.data.loginUrl as string;
  },

  // ── Super-admin: user + assignment management ──
  async listUsers(): Promise<AppUser[]> {
    const resp = await apiClient.get("/app/users");
    return resp.data.users as AppUser[];
  },

  async createUser(username: string, password: string, role: AppRole): Promise<AppUser> {
    const resp = await apiClient.post("/app/users", { username, password, role });
    return resp.data.user as AppUser;
  },

  async assignedUsers(accountId: number): Promise<AppUser[]> {
    const resp = await apiClient.get(`/accounts/${accountId}/users`);
    return resp.data.users as AppUser[];
  },

  async assign(accountId: number, userId: number): Promise<void> {
    await apiClient.post("/accounts/assign", { accountId, userId });
  },

  async unassign(accountId: number, userId: number): Promise<void> {
    await apiClient.post("/accounts/unassign", { accountId, userId });
  },
};
