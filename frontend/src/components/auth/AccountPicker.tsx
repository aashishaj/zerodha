import { useEffect, useState } from "react";
import { LogOut, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import { accountsService } from "../../services/accountsService";
import type { AccountSummary, AppRole, AppUser } from "../../types";

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

  const handleDeleteAccount = async (account: { id: number; label: string; zerodha_user_id: string }) => {
    if (
      !window.confirm(
        `Remove account "${account.label}" (${account.zerodha_user_id})? This deletes it and all its user assignments.`,
      )
    )
      return;
    setError(null);
    try {
      await accountsService.deleteAccount(account.id);
      await loadAccounts();
    } catch {
      setError("Could not remove the account.");
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
              <div key={account.id} className="relative">
                <div
                  onClick={() => account.connected && void handlePick(account.id)}
                  className={`flex w-full flex-col items-center rounded-2xl border bg-white p-5 text-center transition ${
                    account.connected
                      ? "cursor-pointer border-slate-200 hover:border-blue-400 hover:shadow-sm"
                      : "border-slate-100"
                  }`}
                >
                  <div className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-600 ${account.connected ? "" : "opacity-60"}`}>
                    {initials(account.label)}
                  </div>
                  <div className={`text-sm font-semibold text-slate-900 ${account.connected ? "" : "opacity-60"}`}>{account.label}</div>
                  <div className={`text-[11px] text-slate-400 ${account.connected ? "" : "opacity-60"}`}>{account.zerodha_user_id}</div>
                  {account.connected ? (
                    <div className="mt-2 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600">
                      Connected
                    </div>
                  ) : isAdmin ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleConnect();
                      }}
                      className="mt-2 rounded-lg bg-[#e5382f] px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-[#c9302a]"
                    >
                      Connect
                    </button>
                  ) : (
                    <div className="mt-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                      Not connected
                    </div>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => void handleDeleteAccount(account)}
                    title="Remove account"
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm transition hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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
  const [editUserId, setEditUserId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshUsers = () =>
    accountsService.listUsers().then(setUsers).catch(() => setUsers([]));
  useEffect(() => {
    void refreshUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editUser = users.find((u) => u.id === editUserId) ?? null;

  const handleCreate = async () => {
    setMsg(null);
    if (!username || !password) return;
    try {
      await accountsService.createUser(username, password, role);
      setUsername("");
      setPassword("");
      setMsg(`Created ${role} "${username}". Click them in the Users list below to assign accounts.`);
      await refreshUsers();
    } catch {
      setMsg("Could not create user (name may already exist).");
    }
  };

  const field =
    "h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      {msg && <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</div>}

      <div className="max-w-sm">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Create user</h3>
          <div className="space-y-2">
            <input className={field} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input className={field} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <select className={field} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <option value="buyer">Buyer (buy only)</option>
              <option value="seller">Seller (sell only)</option>
              <option value="trader">Trader (buy &amp; sell)</option>
            </select>
            <button onClick={() => void handleCreate()} className="h-9 w-full rounded-lg bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-700">
              Create user
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        <p className="mb-2 text-[11px] text-slate-400">Click a buyer/seller to edit role, password, access, or remove them.</p>
        {users.length === 0 ? (
          <p className="text-xs text-slate-400">No users yet.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {users.map((u) => {
              const isAdmin = u.role === "super_admin";
              const selected = u.id === editUserId;
              return (
                <li key={u.id}>
                  <button
                    disabled={isAdmin}
                    onClick={() => setEditUserId(selected ? null : u.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left transition ${
                      selected ? "bg-blue-50 ring-1 ring-blue-300" : "bg-slate-50 hover:bg-slate-100"
                    } ${isAdmin ? "cursor-default opacity-70" : ""}`}
                  >
                    <span className="text-xs font-medium text-slate-700">
                      {u.username}
                      {u.active === false && <span className="ml-1 text-[10px] text-red-500">(disabled)</span>}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
                      {u.role}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {editUser && (
          <UserEditor
            user={editUser}
            accounts={accounts}
            onChanged={refreshUsers}
            onDeleted={() => {
              setEditUserId(null);
              refreshUsers();
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Super-admin: edit one existing buyer/seller (role, password, active, accounts, delete). */
function UserEditor({
  user,
  accounts,
  onChanged,
  onDeleted,
}: {
  user: AppUser;
  accounts: AccountSummary[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [role, setRole] = useState<AppRole>(user.role);
  const [newPassword, setNewPassword] = useState("");
  const [addAccountId, setAddAccountId] = useState<number | "">("");
  const [userAccts, setUserAccts] = useState<AccountSummary[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshAccts = () => {
    void accountsService.userAccounts(user.id).then(setUserAccts).catch(() => setUserAccts([]));
  };
  useEffect(() => {
    setRole(user.role);
    setNewPassword("");
    refreshAccts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
    } catch {
      setMsg("Action failed.");
    }
  };

  const field =
    "h-9 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none";
  const unassigned = accounts.filter((a) => !userAccts.some((x) => x.id === a.id));

  return (
    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="mb-3 text-sm font-semibold text-slate-800">Edit {user.username}</div>
      {msg && <div className="mb-3 rounded-md bg-white px-3 py-1.5 text-xs text-slate-600">{msg}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-[11px] font-medium text-slate-500">Role</label>
          <div className="flex gap-2">
            <select className={field} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              <option value="buyer">Buyer (buy only)</option>
              <option value="seller">Seller (sell only)</option>
              <option value="trader">Trader (buy &amp; sell)</option>
            </select>
            <button
              onClick={() => void run(() => accountsService.setUserRole(user.id, role).then(onChanged), "Role updated.")}
              className="h-9 shrink-0 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Save
            </button>
          </div>

          <label className="block pt-1 text-[11px] font-medium text-slate-500">Reset password</label>
          <div className="flex gap-2">
            <input
              type="password"
              className={field}
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <button
              disabled={!newPassword}
              onClick={() =>
                void run(() => accountsService.resetPassword(user.id, newPassword), "Password reset.").then(() =>
                  setNewPassword(""),
                )
              }
              className="h-9 shrink-0 rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              Set
            </button>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() =>
                void run(() => accountsService.setUserActive(user.id, user.active === false).then(onChanged), "Updated.")
              }
              className="h-9 flex-1 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white"
            >
              {user.active === false ? "Enable" : "Disable"}
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Delete user "${user.username}"?`))
                  void run(() => accountsService.deleteUser(user.id).then(onDeleted), "Deleted.");
              }}
              className="h-9 flex-1 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500">Accounts</label>
          <div className="mb-2 mt-1 flex flex-wrap gap-1.5">
            {userAccts.length === 0 ? (
              <span className="text-xs text-slate-400">No accounts.</span>
            ) : (
              userAccts.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {a.label}
                  <button
                    title="Remove"
                    onClick={() => void accountsService.unassign(a.id, user.id).then(refreshAccts)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <select
              className={field}
              value={addAccountId}
              onChange={(e) => setAddAccountId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Add account…</option>
              {unassigned.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.zerodha_user_id})
                </option>
              ))}
            </select>
            <button
              disabled={addAccountId === ""}
              onClick={() => {
                if (addAccountId !== "")
                  void accountsService.assign(Number(addAccountId), user.id).then(() => {
                    setAddAccountId("");
                    refreshAccts();
                  });
              }}
              className="h-9 shrink-0 rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
