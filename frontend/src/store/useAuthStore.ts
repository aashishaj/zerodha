import { create } from "zustand";
import { appAuthService } from "../services/appAuthService";
import { accountsService } from "../services/accountsService";
import type { AccountSummary, ActiveAccount, AppUser } from "../types";

interface AuthState {
  user: AppUser | null;
  /** True once the initial session check has completed. */
  checked: boolean;
  loggingIn: boolean;
  error: string | null;
  accounts: AccountSummary[];
  activeAccount: ActiveAccount | null;
  loadingAccounts: boolean;
  checkSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  selectAccount: (accountId: number) => Promise<void>;
  clearActiveAccount: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  checked: false,
  loggingIn: false,
  error: null,
  accounts: [],
  activeAccount: null,
  loadingAccounts: false,
  async checkSession() {
    const res = await appAuthService.me();
    set({
      user: res?.user ?? null,
      activeAccount: res?.activeAccount ?? null,
      checked: true,
    });
  },
  async login(username, password) {
    set({ loggingIn: true, error: null });
    try {
      const user = await appAuthService.login(username, password);
      set({ user, loggingIn: false });
      return true;
    } catch {
      set({ loggingIn: false, error: "Invalid username or password." });
      return false;
    }
  },
  async logout() {
    await appAuthService.logout().catch(() => {});
    set({ user: null, activeAccount: null, accounts: [] });
  },
  async loadAccounts() {
    set({ loadingAccounts: true });
    try {
      const accounts = await accountsService.list();
      set({ accounts, loadingAccounts: false });
    } catch {
      set({ accounts: [], loadingAccounts: false });
    }
  },
  async selectAccount(accountId) {
    await accountsService.select(accountId);
    const account = get().accounts.find((item) => item.id === accountId);
    set({ activeAccount: account ? { id: account.id, label: account.label } : null });
  },
  clearActiveAccount() {
    set({ activeAccount: null });
  },
}));
