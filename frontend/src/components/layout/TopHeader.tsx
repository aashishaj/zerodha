import { Bell, ExternalLink, LogOut, ShoppingCart, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";
import { useAuthStore } from "../../store/useAuthStore";
import { ProfileSettingsModal } from "./ProfileSettingsModal";
import { openViewInNewTab } from "../../utils/views";
import type { MainTab } from "../../types";

// Nav items and, where they map to a standalone view, the MainTab that view
// opens as (used both for in-place switching and "open in new tab").
const navItems: Array<{ label: string; view: MainTab | null }> = [
  { label: "Dashboard", view: "chart" },
  { label: "Orders", view: "orders" },
  { label: "Holdings", view: "holdings" },
  { label: "Positions", view: "positions" },
  { label: "Bids", view: null },
  { label: "Funds", view: null },
];

export function TopHeader() {
  const profile = useTradingStore((state) => state.profile);
  const quotes  = useTradingStore((state) => state.quotes);
  const mainTab = useTradingStore((state) => state.mainTab);
  const setMainTab = useTradingStore((state) => state.setMainTab);
  const appUser = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const activeAccount = useAuthStore((state) => state.activeAccount);
  const clearActiveAccount = useAuthStore((state) => state.clearActiveAccount);
  const paperTrading = useAuthStore((state) => state.paperTrading);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const indices = ["NIFTY 50", "SENSEX"].filter((symbol) => quotes[symbol]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-[#e8edf3] bg-white px-5 text-[13px] text-[#4b5563]">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-6">
          {indices.map((symbol) => {
            const quote = quotes[symbol];
            return (
              <div key={symbol} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-medium text-[#222]">{symbol}</span>
                <span className={movementClass(quote.change)}>{formatPrice(quote.last_price)}</span>
                <span className={movementClass(quote.change)}>{formatChange(quote.change)}</span>
                <span className={movementClass(quote.change)}>{formatPercent(quote.changePercent)}</span>
              </div>
            );
          })}
        </div>

        <nav className="flex items-center gap-7">
          {navItems.map((item) => {
            const isActive = item.view != null && mainTab === item.view;
            // Orders/Holdings/Positions can be popped into their own browser
            // tab; Dashboard (the chart) and the placeholders cannot.
            const canPopOut = item.view != null && item.view !== "chart";
            return (
              <span key={item.label} className="group flex items-center gap-1">
                <button
                  onClick={() => { if (item.view) setMainTab(item.view); }}
                  className={`border-0 bg-transparent p-0 text-[13px] ${
                    isActive ? "font-medium text-[#222]" : "text-[#6b7280]"
                  }`}
                >
                  {item.label}
                </button>
                {canPopOut && (
                  <button
                    onClick={() => item.view && openViewInNewTab(item.view)}
                    title={`Open ${item.label} in a new tab`}
                    aria-label={`Open ${item.label} in a new tab`}
                    className="flex h-4 w-4 items-center justify-center rounded-sm text-[#c2c8d0] opacity-0 transition group-hover:opacity-100 hover:text-[#4b5563]"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        {paperTrading && (
          <span
            title="Orders, GTTs and prices are simulated; nothing reaches Zerodha"
            className="mr-1 rounded-sm bg-[#9b59b6] px-2 py-1 text-[11px] font-bold tracking-wide text-white"
          >
            PAPER TRADING
          </span>
        )}
        {activeAccount && (
          <button
            onClick={clearActiveAccount}
            title="Switch account"
            className="mr-1 flex items-center gap-1.5 rounded-sm border border-[#e0e0e0] px-2 py-1 text-[12px] text-[#444] transition hover:bg-[#f7f8fa]"
          >
            <span className="font-medium">{activeAccount.label}</span>
            <span className="text-[10px] text-[#9aa3af]">Switch</span>
          </button>
        )}
        <button className="flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-[#7b8594] transition hover:bg-[#f7f8fa]">
          <ShoppingCart className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-[#7b8594] transition hover:bg-[#f7f8fa]">
          <Bell className="h-4 w-4" />
        </button>
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="ml-1 flex items-center gap-2 rounded-sm px-2 py-1 text-[13px] text-[#444] transition-colors hover:bg-[#f7f8fa]"
        >
          <UserCircle2 className="h-5 w-5 text-[#9aa3af]" />
          <span className="font-medium">{profile?.name ?? profile?.userId ?? "User"}</span>
          {appUser && <span className="text-[11px] text-[#9aa3af]">({appUser.username})</span>}
        </button>
        <button
          title="Log out"
          onClick={() => void logout()}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-[#7b8594] transition hover:bg-[#f7f8fa]"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
