import { Bell, ShoppingCart } from "lucide-react";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

const navItems = ["Dashboard", "Orders", "Holdings", "Positions", "Bids", "Funds"];

export function TopNav() {
  const profile = useTradingStore((state) => state.profile);
  const quotes = useTradingStore((state) => state.quotes);
  const indices = ["NIFTY 50", "SENSEX", "BANKNIFTY"].filter((symbol) => quotes[symbol]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-5">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-sm">
          {indices.map((symbol) => {
            const quote = quotes[symbol];
            return (
              <div key={symbol} className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">{symbol}</span>
                <span className={movementClass(quote.change)}>{formatPrice(quote.last_price)}</span>
                <span className={movementClass(quote.change)}>{formatChange(quote.change)}</span>
                <span className={movementClass(quote.change)}>{formatPercent(quote.changePercent)}</span>
              </div>
            );
          })}
        </div>
        <nav className="flex items-center gap-6 text-sm text-slate-500">
          {navItems.map((item) => (
            <button key={item} className={`border-0 bg-transparent p-0 ${item === "Dashboard" ? "font-semibold text-slate-900" : ""}`}>
              {item}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-slate-200 p-2">
          <ShoppingCart className="h-4 w-4" />
        </div>
        <div className="rounded-xl border border-slate-200 p-2">
          <Bell className="h-4 w-4" />
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
          {profile?.userId ?? "USER"}
        </div>
      </div>
    </header>
  );
}
