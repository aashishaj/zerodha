import type { OptionChainRow } from "../../types";
import { formatPrice } from "../../utils/format";

export function OptionSummaryBar({ rows, atmStrike }: { rows: OptionChainRow[]; atmStrike?: number }) {
  const totalCeOi = rows.reduce((sum, row) => sum + (row.ceOi ?? 0), 0);
  const totalPeOi = rows.reduce((sum, row) => sum + (row.peOi ?? 0), 0);
  const pcr = totalCeOi ? totalPeOi / totalCeOi : 0;

  const maxPainRow =
    rows.reduce<OptionChainRow | null>((best, row) => {
      const rowOi = (row.ceOi ?? 0) + (row.peOi ?? 0);
      const bestOi = (best?.ceOi ?? 0) + (best?.peOi ?? 0);
      return rowOi > bestOi ? row : best;
    }, null) ?? null;

  const atmRow = rows.find((row) => row.strike === atmStrike) ?? rows[Math.floor(rows.length / 2)];
  const atmIv = atmRow ? (((atmRow.ceLtp ?? 0) + (atmRow.peLtp ?? 0)) / Math.max(atmRow.strike, 1)) * 100 : 0;
  const ivPercentile = Math.min(100, Math.max(0, Math.round((atmIv / 40) * 100)));

  const items = [
    { label: "PCR", value: pcr.toFixed(2) },
    { label: "Max Pain", value: maxPainRow ? formatPrice(maxPainRow.strike) : "-" },
    { label: "ATM IV", value: `${atmIv.toFixed(2)}` },
    { label: "IV Percentile", value: `${ivPercentile}.00 - High` },
  ];

  return (
    <div className="sticky bottom-0 grid grid-cols-4 border-t border-[#e8edf3] bg-white">
      {items.map((item) => (
        <div key={item.label} className="px-6 py-3">
          <div className="text-[12px] text-[#8b94a5]">{item.label}</div>
          <div className="mt-1 text-[15px] font-semibold text-[#2a3342]">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
