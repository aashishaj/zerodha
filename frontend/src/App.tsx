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
  const [initError, setInitError] = useState<string | null>(null);

  // Resolve the app session (our username/password layer) on first load.
  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!appUser || !activeAccount) return;
    void init().catch((error: unknown) => {
      console.error("Dashboard init failed:", error);
      setInitError(error instanceof Error ? error.message : "Unknown initialization error");
    });
  }, [init, appUser, activeAccount]);

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
