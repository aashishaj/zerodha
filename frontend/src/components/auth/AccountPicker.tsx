import { useEffect, useState } from "react";
import { LogOut, Plus, ShieldCheck } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { accountsService } from "../../services/accountsService";
import type { AppRole, AppUser } from "../../types";

function initials(label: string): string {
  const parts = label.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AccountPicker() {
  const user = useAuthStore((s) => s.user);
  const accounts = useAuthStore((s) => s.accounts);
  const loadingAccounts = useAuthStore((s) => s.loadingAccounts);
  const loadAccounts = useAuthStore((s) => s.loadAccounts);
  const selectAccount = useAuthStore((s) => s.selectAccount);
  const logout = useAuthStore((s) => s.logout);

  const isAdmin = user?.role === "super_admin";
  const [error, setError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  // On mount: clean up any ?auth= redirect param, then load accounts.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    if (authResult) {
      window.history.replaceState({}, "", window.location.pathname);
      if (authResult === "error") setError("Zerodha connection failed. Please try again.");
    }
    void loadAccounts();
  }, [loadAccounts]);

  const handleConnect = async () => {
    setError(null);
    try {
      const url = await accountsService.connectUrl();
      window.location.href = url;
    } catch {
      setError("Could not start the Zerodha connection.");
    }
  };

  const handlePick = async (accountId: number) => {
    setError(null);
    try {
      await selectAccount(accountId);
    } catch {
      setError("Could not select that account.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white">
            Z
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Choose an account</h1>
          <p className="mt-2 text-sm text-slate-500">
            Signed in as <span className="font-medium">{user?.username}</span> · {user?.role}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600">{error}</div>
        )}

        {loadingAccounts ? (
          <p className="text-center text-sm text-slate-400">Loading accounts…</p>
        ) : accounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="text-sm text-slate-500">
              {isAdmin
                ? "No accounts yet. Connect a Zerodha account to get started."
                : "No accounts have been assigned to you yet. Ask an admin."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => account.connected && void handlePick(account.id)}
                disabled={!account.connected}
                className={`flex flex-col items-center rounded-2xl border bg-white p-5 text-center transition ${
                  account.connected
                    ? "border-slate-200 hover:border-blue-400 hover:shadow-sm"
                    : "cursor-not-allowed border-slate-100 opacity-60"
                }`}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-600">
                  {initials(account.label)}
                </div>
                <div className="text-sm font-semibold text-slate-900">{account.label}</div>
                <div className="text-[11px] text-slate-400">{account.zerodha_user_id}</div>
                <div
                  className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    account.connected ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {account.connected ? "Connected" : "Not connected"}
                </div>
              </button>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={() => void handleConnect()}
              className="flex items-center gap-2 rounded-lg bg-[#e5382f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c9302a]"
            >
              <Plus className="h-4 w-4" /> Connect account
            </button>
            <button
              onClick={() => setShowAdmin((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white"
            >
              <ShieldCheck className="h-4 w-4" /> Manage access
            </button>
          </div>
        )}

        {isAdmin && showAdmin && <AdminPanel />}

        <div className="mt-10 text-center">
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/** Super-admin only: create buyer/seller users and assign accounts to them. */
function AdminPanel() {
  const accounts = useAuthStore((s) => s.accounts);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("buyer");
  const [accountId, setAccountId] = useState<number | "">("");
  const [userId, setUserId] = useState<number | "">("");
  const [msg, setMsg] = useState<string | null>(null);

  const refreshUsers = () => {
    void accountsService.listUsers().then(setUsers).catch(() => setUsers([]));
  };
  useEffect(refreshUsers, []);

  const assignable = users.filter((u) => u.role !== "super_admin");

  const handleCreate = async () => {
    setMsg(null);
    if (!username || !password) return;
    try {
      await accountsService.createUser(username, password, role);
      setUsername("");
      setPassword("");
      setMsg(`Created ${role} "${username}".`);
      refreshUsers();
    } catch {
      setMsg("Could not create user (name may already exist).");
    }
  };

  const handleAssign = async (unassign: boolean) => {
    setMsg(null);
    if (accountId === "" || userId === "") return;
    try {
      if (unassign) await accountsService.unassign(Number(accountId), Number(userId));
      else await accountsService.assign(Number(accountId), Number(userId));
      setMsg(unassign ? "Unassigned." : "Assigned.");
    } catch {
      setMsg("Assignment failed.");
    }
  };

  const field =
    "h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      {msg && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</div>}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Create user</h3>
          <div className="space-y-2">
            <input className={field} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <select className={field} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <option value="buyer">Buyer (buy only)</option>
              <option value="seller">Seller (sell only)</option>
            </select>
            <button onClick={() => void handleCreate()} className="h-9 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">
              Create user
            </button>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Assign account access</h3>
          <div className="space-y-2">
            <select className={field} value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.label} ({a.zerodha_user_id})</option>
              ))}
            </select>
            <select className={field} value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select user…</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={() => void handleAssign(false)} className="h-9 flex-1 rounded-lg bg-slate-800 text-sm font-semibold text-white transition hover:bg-slate-900">
                Assign
              </button>
              <button onClick={() => void handleAssign(true)} className="h-9 flex-1 rounded-lg border border-slate-300 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
                Unassign
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
