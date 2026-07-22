import { useEffect } from "react";
import { LineChart, AlertCircle } from "lucide-react";
import { formatPrice, formatPercent } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

const pnlColor = (value: number) => (value >= 0 ? "#16a34a" : "#dc2626");

// Day change % of the underlying instrument, from previous close to LTP.
const dayChangePct = (last: number, close: number) =>
  close ? ((last - close) / close) * 100 : 0;

export function PositionsTab() {
  const { positions, fetchPositions, positionsError } = useTradingStore();

  useEffect(() => {
    void fetchPositions();
  }, [fetchPositions]);

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Heading row */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-[22px] font-medium text-[#444]">
          Positions {positions.length > 0 && <span className="text-[#9aa3af]">({positions.length})</span>}
        </h1>
      </div>

      {positionsError ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="h-14 w-14 text-[#e5793b]" strokeWidth={1.25} />
          <p className="mt-5 max-w-md text-[15px] leading-6 text-[#444]">
            Couldn't load positions. Your Zerodha session may have expired — reconnect the account and try again.
          </p>
        </div>
      ) : positions.length > 0 ? (
        <div className="flex-1 overflow-auto px-6 pb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#e8edf3] text-[11px] font-semibold uppercase tracking-wider text-[#9aa3af]">
                <th className="px-3 py-2.5 text-left">Product</th>
                <th className="px-3 py-2.5 text-left">Instrument</th>
                <th className="px-3 py-2.5 text-right">Qty.</th>
                <th className="px-3 py-2.5 text-right">Avg.</th>
                <th className="px-3 py-2.5 text-right">LTP</th>
                <th className="px-3 py-2.5 text-right">P&amp;L</th>
                <th className="px-3 py-2.5 text-right">Chg.</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => {
                const chg = dayChangePct(p.last_price, p.close_price);
                return (
                  <tr key={i} className="border-b border-[#f0f2f5] hover:bg-[#f7f8fa]">
                    <td className="px-3 py-2.5 text-[11px] font-medium uppercase text-[#9aa3af]">{p.product}</td>
                    <td className="px-3 py-2.5 text-[12px] font-medium text-[#222]">{p.tradingsymbol}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{p.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(p.average_price)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(p.last_price)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: pnlColor(p.pnl) }}>
                      {formatPrice(p.pnl)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] font-medium" style={{ color: pnlColor(chg) }}>
                      {formatPercent(chg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#e8edf3]">
                <td colSpan={5} className="px-3 py-3 text-right text-[13px] text-[#6b7280]">
                  Total P&amp;L
                </td>
                <td className="px-3 py-3 text-right text-[14px] font-semibold" style={{ color: pnlColor(totalPnl) }}>
                  {formatPrice(totalPnl)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <LineChart className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
          <p className="mt-6 text-[15px] text-[#444]">You don't have any open positions</p>
        </div>
      )}
    </div>
  );
}
