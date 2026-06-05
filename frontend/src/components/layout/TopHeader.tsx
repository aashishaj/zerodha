import { Bell, ShoppingCart, UserCircle2 } from "lucide-react";
import { useState } from "react";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";
import { ProfileSettingsModal } from "./ProfileSettingsModal";

const navItems = ["Dashboard", "Orders", "Holdings", "Positions", "Bids", "Funds"];

export function TopHeader() {
  const profile = useTradingStore((state) => state.profile);
  const quotes  = useTradingStore((state) => state.quotes);
  const mainTab = useTradingStore((state) => state.mainTab);
  const setMainTab = useTradingStore((state) => state.setMainTab);
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
            const isActive =
              (item === "Dashboard" && mainTab === "chart") ||
              (item === "Orders" && mainTab === "orders");
            return (
              <button
                key={item}
                onClick={() => {
                  if (item === "Dashboard") setMainTab("chart");
                  else if (item === "Orders") setMainTab("orders");
                }}
                className={`border-0 bg-transparent p-0 text-[13px] ${
                  isActive ? "font-medium text-[#222]" : "text-[#6b7280]"
                }`}
              >
                {item}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2">
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
        </button>
      </div>

      {settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
