import { useState } from "react";
import { useAuthStore } from "../../store/useAuthStore";

/**
 * App login gate (our own username/password layer). Sits in front of the
 * Zerodha OAuth connect flow — a user must sign in here before they can reach
 * the dashboard or connect a Zerodha account.
 */
export function AppLogin() {
  const login = useAuthStore((s) => s.login);
  const loggingIn = useAuthStore((s) => s.loggingIn);
  const error = useAuthStore((s) => s.error);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) return;
    void login(username, password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
            Z
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Zerodha Dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to continue.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Username</label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mb-4 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
          />

          <label className="mb-1.5 block text-[12px] font-medium text-slate-600">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-5 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
          />

          <button
            type="submit"
            disabled={loggingIn || !username || !password}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
