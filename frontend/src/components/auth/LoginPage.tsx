import { useEffect, useState } from "react";

interface LoginPageProps {
  onLoginSuccess: () => void;
}

type Status = "checking" | "unauthenticated" | "error";

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [loading, setLoading] = useState(false);

  // ── On mount: handle ?auth=success redirect OR check existing token ──────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");

    if (authResult === "success") {
      // Clean up the URL, then proceed to dashboard
      window.history.replaceState({}, "", window.location.pathname);
      onLoginSuccess();
      return;
    }

    if (authResult === "error") {
      window.history.replaceState({}, "", window.location.pathname);
      setStatus("error");
      return;
    }

    // Check if already authenticated (cached token from earlier today)
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data: { authenticated: boolean }) => {
        if (data.authenticated) {
          onLoginSuccess();
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => setStatus("unauthenticated"));
  }, [onLoginSuccess]);

  // ── Redirect to Zerodha login ────────────────────────────────────────────
  async function handleLogin() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-url");
      const data: { loginUrl: string } = await res.json();
      window.location.href = data.loginUrl;
    } catch {
      setLoading(false);
      setStatus("error");
    }
  }

  // ── Loading / checking auth ──────────────────────────────────────────────
  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          <p className="text-sm text-slate-500">Checking session…</p>
        </div>
      </div>
    );
  }

  // ── Landing page ─────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-xl mb-4">
            Z
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Zerodha Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in with your Zerodha account to continue.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {status === "error" && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              Login failed. Please try again.
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#e5382f] py-3 text-sm font-semibold text-white transition hover:bg-[#c9302a] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Redirecting…
              </>
            ) : (
              <>
                {/* Zerodha-style icon */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                </svg>
                Login with Zerodha
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-slate-400">
            You'll be redirected to Zerodha's secure login page.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Having trouble?{" "}
          <a href="https://support.zerodha.com" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
            Contact Zerodha support
          </a>
        </p>
      </div>
    </div>
  );
}
