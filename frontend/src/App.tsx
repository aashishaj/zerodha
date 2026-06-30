import { useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { Loader } from "./components/common/Loader";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { AppLogin } from "./components/auth/AppLogin";
import { AccountPicker } from "./components/auth/AccountPicker";
import { useTradingStore } from "./store/useTradingStore";
import { useAuthStore } from "./store/useAuthStore";

export default function App() {
  const init = useTradingStore((state) => state.init);
  const isReady = useTradingStore((state) => state.isReady);
  const appUser = useAuthStore((state) => state.user);
  const appChecked = useAuthStore((state) => state.checked);
  const activeAccount = useAuthStore((state) => state.activeAccount);
  const checkSession = useAuthStore((state) => state.checkSession);
  const clearActiveAccount = useAuthStore((state) => state.clearActiveAccount);
  const logout = useAuthStore((state) => state.logout);
  const [initError, setInitError] = useState<string | null>(null);

  // Resolve the app session (our username/password layer) on first load.
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!appUser || !activeAccount) return;
    void init().catch((error: unknown) => {
      console.error("Dashboard init failed:", error);
      const resp = (error as { response?: { status?: number; data?: { code?: string } } }).response;
      if (resp?.status === 409 || resp?.data?.code === "TOKEN_INVALID") {
        // The selected account's Zerodha token is gone — bounce back to the
        // picker so an admin can reconnect it.
        setInitError(null);
        clearActiveAccount();
        return;
      }
      setInitError(error instanceof Error ? error.message : "Unknown initialization error");
    });
  }, [init, appUser, activeAccount, clearActiveAccount]);

  // Wait for the session check before deciding which gate to show.
  if (!appChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader label="Checking session..." />
      </div>
    );
  }

  // Gate 1: our app login (username/password).
  if (!appUser) {
    return <AppLogin />;
  }

  // Gate 2: pick a connected Zerodha account (super admin connects them).
  if (!activeAccount) {
    return <AccountPicker />;
  }

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="max-w-xl border border-amber-200 bg-white p-6">
          <div className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-600">Startup Error</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">The dashboard could not finish booting</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This usually means one of the mock services or the local state setup failed. Share the message below and
            we can fix it quickly.
          </p>
          <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950/95 p-4 text-sm text-slate-100">{initError}</pre>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setInitError(null);
                clearActiveAccount();
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Back to accounts
            </button>
            <button
              onClick={() => void logout()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader label="Booting derivatives dashboard..." />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
