import { BarChart2 } from "lucide-react";
import type { OptionChainRow } from "../../types";
import { formatCompact, formatPrice, movementClass } from "../../utils/format";
import { useAllowedSides } from "../../store/useAuthStore";

interface OptionChainTableProps {
  rows: OptionChainRow[];
  atmStrike?: number;
  onOpenInstrument: (token: number) => void;
  onAddWatchlist: (token: number) => void;
  onBuy: (token: number) => void;
  onSell: (token: number) => void;
  compact?: boolean;
}

const percentChange = (ltp?: number, change?: number) => {
  if (ltp == null || change == null) return null;
  const previous = ltp - change;
  if (!previous) return 0;
  return Number(((change / previous) * 100).toFixed(2));
};

const formatPct = (value: number | null | undefined) => {
  if (value == null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

export function OptionChainTable({
  rows,
  atmStrike,
  onOpenInstrument,
  onBuy,
  onSell,
  compact = false,
}: OptionChainTableProps) {
  const { canBuy, canSell } = useAllowedSides();
  const totalCeOi = rows.reduce((s, r) => s + (r.ceOi ?? 0), 0);
  const totalPeOi = rows.reduce((s, r) => s + (r.peOi ?? 0), 0);
  const maxCeOi = Math.max(...rows.map((r) => r.ceOi ?? 0), 1);
  const maxPeOi = Math.max(...rows.map((r) => r.peOi ?? 0), 1);

  const oiShare = (val?: number, total?: number) => {
    if (val == null || !total) return 0;
    return Number(((val / total) * 100).toFixed(2));
  };

  const fontSize = compact ? "text-[11px]" : "text-[12px]";

  return (
    <table className={`min-w-full border-collapse ${fontSize}`}>
      <thead className="sticky top-0 z-10 bg-[#fafbfd]">
        <tr className="border-b border-[#e8edf3]">
          {/* Call side */}
          <th className="w-[8%] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">OI %</th>
          <th className="w-[8%] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">OI</th>
          <th className="w-[8%] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">Chg %</th>
          <th className="w-[12%] px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">Call LTP</th>
          {/* Strike center */}
          <th className="w-[8%] px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">Strike</th>
          {/* Put side */}
          <th className="w-[12%] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">Put LTP</th>
          <th className="w-[8%] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">Chg %</th>
          <th className="w-[8%] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">OI</th>
          <th className="w-[8%] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#76839a]">OI %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const ceChangePct = percentChange(row.ceLtp, row.ceChange);
          const peChangePct = percentChange(row.peLtp, row.peChange);
          const ceOiPct = oiShare(row.ceOi, totalCeOi);
          const peOiPct = oiShare(row.peOi, totalPeOi);
          const ceOiBarW = Math.round(((row.ceOi ?? 0) / maxCeOi) * 100);
          const peOiBarW = Math.round(((row.peOi ?? 0) / maxPeOi) * 100);
          const isAtm = atmStrike != null && row.strike === atmStrike;

          const ceToken = row.ceInstrument?.instrument_token;
          const peToken = row.peInstrument?.instrument_token;

          return (
            <tr
              key={row.strike}
              className={`group h-10 border-b border-[#f0f3f7] transition-colors hover:bg-[#f7f9fb] ${
                isAtm ? "bg-[#fffbf0]" : "bg-white"
              }`}
            >
              {/* ── Call OI % ── */}
              <td className="relative px-3 py-2 text-right">
                {/* OI bar grows left from right edge */}
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#dcecf9] opacity-50"
                  style={{ width: `${ceOiBarW}%` }}
                />
                <span className={`relative ${movementClass(ceOiPct)}`}>{formatPct(ceOiPct)}</span>
              </td>

              {/* ── Call OI ── */}
              <td className="relative px-3 py-2 text-right">
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#dcecf9] opacity-50"
                  style={{ width: `${ceOiBarW}%` }}
                />
                <span className="relative text-[#445064]">{formatCompact(row.ceOi)}</span>
              </td>

              {/* ── Call Chg % ── */}
              <td className={`px-3 py-2 text-right ${movementClass(ceChangePct)}`}>
                {formatPct(ceChangePct)}
              </td>

              {/* ── Call LTP + hover B/S ── */}
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  {/* Hover actions — opacity only, no layout shift */}
                  {ceToken != null && (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {canBuy && (
                        <button
                          onClick={() => onBuy(ceToken)}
                          className="rounded bg-[#387ed1] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        >B</button>
                      )}
                      {canSell && (
                        <button
                          onClick={() => onSell(ceToken)}
                          className="rounded bg-[#e74c3c] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        >S</button>
                      )}
                      <button
                        onClick={() => onOpenInstrument(ceToken)}
                        title="Open chart"
                        className="rounded p-0.5 text-[#6b7280] hover:text-[#374151]"
                      >
                        <BarChart2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <span className="font-semibold text-[#273449]">
                    {row.ceLtp != null ? formatPrice(row.ceLtp) : <span className="text-[#9aa3af]">-</span>}
                  </span>
                </div>
              </td>

              {/* ── Strike ── */}
              <td className="px-3 py-2 text-center">
                <span
                  className={`inline-flex min-w-[52px] items-center justify-center rounded px-2 py-0.5 font-semibold ${
                    isAtm ? "bg-[#444c5c] text-white" : "text-[#273449]"
                  }`}
                >
                  {row.strike}
                </span>
              </td>

              {/* ── Put LTP + hover B/S ── */}
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[#273449]">
                    {row.peLtp != null ? formatPrice(row.peLtp) : <span className="text-[#9aa3af]">-</span>}
                  </span>
                  {peToken != null && (
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {canBuy && (
                        <button
                          onClick={() => onBuy(peToken)}
                          className="rounded bg-[#387ed1] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        >B</button>
                      )}
                      {canSell && (
                        <button
                          onClick={() => onSell(peToken)}
                          className="rounded bg-[#e74c3c] px-1.5 py-0.5 text-[10px] font-semibold text-white"
                        >S</button>
                      )}
                      <button
                        onClick={() => onOpenInstrument(peToken)}
                        title="Open chart"
                        className="rounded p-0.5 text-[#6b7280] hover:text-[#374151]"
                      >
                        <BarChart2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </td>

              {/* ── Put Chg % ── */}
              <td className={`px-3 py-2 text-left ${movementClass(peChangePct)}`}>
                {formatPct(peChangePct)}
              </td>

              {/* ── Put OI ── */}
              <td className="relative px-3 py-2 text-left">
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-[#fde8e8] opacity-50"
                  style={{ width: `${peOiBarW}%` }}
                />
                <span className="relative text-[#445064]">{formatCompact(row.peOi)}</span>
              </td>

              {/* ── Put OI % ── */}
              <td className="relative px-3 py-2 text-left">
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-[#fde8e8] opacity-50"
                  style={{ width: `${peOiBarW}%` }}
                />
                <span className={`relative ${movementClass(peOiPct)}`}>{formatPct(peOiPct)}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
