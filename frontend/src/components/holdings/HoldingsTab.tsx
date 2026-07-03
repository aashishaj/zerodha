import { useEffect } from "react";
import { Briefcase, BarChart3, ChevronDown } from "lucide-react";
import { formatPrice, formatPercent } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

const pnlColor = (value: number) => (value >= 0 ? "#16a34a" : "#dc2626");

export function HoldingsTab() {
  const { holdings, fetchHoldings } = useTradingStore();

  useEffect(() => {
    void fetchHoldings();
  }, [fetchHoldings]);

  const totalInvested = holdings.reduce((sum, h) => sum + h.average_price * h.quantity, 0);
  const currentValue = holdings.reduce((sum, h) => sum + h.last_price * h.quantity, 0);
  const totalPnl = currentValue - totalInvested;
  const totalPnlPct = totalInvested ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Secondary tab bar — single active "Equity" tab with the orange underline. */}
      <div className="flex h-10 items-end gap-6 border-b border-[#e8edf3] bg-white px-6">
        <button className="relative h-full border-0 bg-transparent pb-2 text-[13px] font-medium text-[#222]">
          Equity
          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff5722]" />
        </button>
      </div>

      {/* Heading row */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-[22px] font-medium text-[#444]">
          Holdings {holdings.length > 0 && <span className="text-[#9aa3af]">({holdings.length})</span>}
        </h1>
        <button className="inline-flex items-center gap-1.5 rounded-sm border border-[#e0e0e0] px-3 py-1.5 text-[13px] text-[#444] transition hover:bg-[#f7f8fa]">
          All equity
          <ChevronDown className="h-4 w-4 text-[#9aa3af]" />
        </button>
      </div>

      {holdings.length > 0 ? (
        <div className="flex-1 overflow-auto px-6 pb-6">
          {/* Summary cards */}
          <div className="mb-5 flex gap-10 border-y border-[#e8edf3] py-4">
            <div>
              <div className="text-[12px] text-[#9aa3af]">Total investment</div>
              <div className="mt-1 text-[18px] font-medium text-[#222]">{formatPrice(totalInvested)}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#9aa3af]">Current value</div>
              <div className="mt-1 text-[18px] font-medium text-[#222]">{formatPrice(currentValue)}</div>
            </div>
            <div>
              <div className="text-[12px] text-[#9aa3af]">P&amp;L</div>
              <div className="mt-1 text-[18px] font-medium" style={{ color: pnlColor(totalPnl) }}>
                {formatPrice(totalPnl)} ({formatPercent(totalPnlPct)})
              </div>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#e8edf3] text-[11px] font-semibold uppercase tracking-wider text-[#9aa3af]">
                <th className="px-3 py-2.5 text-left">Instrument</th>
                <th className="px-3 py-2.5 text-right">Qty.</th>
                <th className="px-3 py-2.5 text-right">Avg. cost</th>
                <th className="px-3 py-2.5 text-right">LTP</th>
                <th className="px-3 py-2.5 text-right">Cur. val</th>
                <th className="px-3 py-2.5 text-right">P&amp;L</th>
                <th className="px-3 py-2.5 text-right">Day chg.</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => {
                const curVal = h.last_price * h.quantity;
                const invested = h.average_price * h.quantity;
                const pnl = curVal - invested;
                const pnlPct = invested ? (pnl / invested) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-[#f0f2f5] hover:bg-[#f7f8fa]">
                    <td className="px-3 py-2.5 text-[12px] font-medium text-[#222]">{h.tradingsymbol}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{h.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(h.average_price)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(h.last_price)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(curVal)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: pnlColor(pnl) }}>
                      {formatPrice(pnl)} ({formatPercent(pnlPct)})
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: pnlColor(h.day_change_percentage) }}>
                      {formatPercent(h.day_change_percentage)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Briefcase className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
          <p className="mt-6 max-w-md text-[15px] leading-6 text-[#444]">
            You don't have any stocks in your DEMAT yet. Get started with absolutely free equity
            investments.
          </p>
          <button className="mt-6 rounded-sm bg-[#4184f3] px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#3574e0]">
            Get started
          </button>
          <button className="mt-5 inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px] text-[#4184f3]">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#4184f3]">
              <BarChart3 className="h-2.5 w-2.5" strokeWidth={2} />
            </span>
            Analytics
          </button>
        </div>
      )}
    </div>
  );
}
