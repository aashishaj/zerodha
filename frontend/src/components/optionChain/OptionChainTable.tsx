import type { OptionChainRow } from "../../types";
import { formatCompact, formatPrice, movementClass } from "../../utils/format";

interface OptionChainTableProps {
  rows: OptionChainRow[];
  atmStrike?: number;
  onOpenInstrument: (token: number) => void;
  onAddWatchlist: (token: number) => void;
  compact?: boolean;
}

const percentChange = (ltp?: number, change?: number) => {
  if (ltp == null || change == null) return null;
  const previous = ltp - change;
  if (!previous) return 0;
  return Number(((change / previous) * 100).toFixed(2));
};

const oiShare = (value?: number, total?: number) => {
  if (value == null || !total) return 0;
  return Number(((value / total) * 100).toFixed(2));
};

const formatPercentCell = (value: number | null | undefined) => {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export function OptionChainTable({
  rows,
  atmStrike,
  onOpenInstrument,
  onAddWatchlist,
  compact = false,
}: OptionChainTableProps) {
  const totalCeOi = rows.reduce((sum, row) => sum + (row.ceOi ?? 0), 0);
  const totalPeOi = rows.reduce((sum, row) => sum + (row.peOi ?? 0), 0);

  const renderLtpCell = (
    side: "ce" | "pe",
    row: OptionChainRow,
    instrument = side === "ce" ? row.ceInstrument : row.peInstrument,
    ltp = side === "ce" ? row.ceLtp : row.peLtp,
  ) => {
    if (!instrument) return <span className="text-[#9aa3af]">-</span>;

    return (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="font-semibold text-[#273449]"
          onClick={() => onOpenInstrument(instrument.instrument_token)}
        >
          {formatPrice(ltp)}
        </button>
        <button
          type="button"
          className="rounded-[3px] border border-[#d9e1e8] bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#536277]"
          onClick={() => onAddWatchlist(instrument.instrument_token)}
        >
          Watch
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-0 overflow-hidden bg-white">
      <table className={`min-w-full ${compact ? "text-[12px]" : "text-[13px]"}`}>
        <thead className="sticky top-0 z-10 bg-[#fafbfd] uppercase tracking-[0.14em] text-[#76839a]">
          <tr>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Call OI %</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Call OI</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Call Change %</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Call LTP</th>
            <th className="px-4 py-3 text-center text-[10px] font-semibold">Strike</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Put LTP</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Put Change %</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Put OI</th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold">Put OI %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ceChangePct = percentChange(row.ceLtp, row.ceChange);
            const peChangePct = percentChange(row.peLtp, row.peChange);
            const ceOiPct = oiShare(row.ceOi, totalCeOi);
            const peOiPct = oiShare(row.peOi, totalPeOi);
            const isAtm = atmStrike != null && row.strike === atmStrike;

            return (
              <tr key={row.strike} className="h-11 border-t border-[#edf1f5] bg-white">
                <td className={`px-4 py-2.5 ${movementClass(ceOiPct)}`}>{formatPercentCell(ceOiPct)}</td>
                <td className="px-4 py-2.5 text-[#445064]">{formatCompact(row.ceOi)}</td>
                <td className={`px-4 py-2.5 ${movementClass(ceChangePct)}`}>{formatPercentCell(ceChangePct)}</td>
                <td className="px-4 py-2.5">{renderLtpCell("ce", row)}</td>
                <td className="px-4 py-2.5 text-center">
                  <span
                    className={`inline-flex min-w-[54px] items-center justify-center rounded-md px-2 py-1 font-semibold ${
                      isAtm ? "bg-[#4b4f58] text-white" : "text-[#273449]"
                    }`}
                  >
                    {row.strike}
                  </span>
                </td>
                <td className="px-4 py-2.5">{renderLtpCell("pe", row)}</td>
                <td className={`px-4 py-2.5 ${movementClass(peChangePct)}`}>{formatPercentCell(peChangePct)}</td>
                <td className="px-4 py-2.5 text-[#445064]">{formatCompact(row.peOi)}</td>
                <td className={`px-4 py-2.5 ${movementClass(peOiPct)}`}>{formatPercentCell(peOiPct)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
