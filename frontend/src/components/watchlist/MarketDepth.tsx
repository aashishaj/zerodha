import { ModalShell } from "../common/ModalShell";
import type { MarketDepth as MarketDepthType } from "../../types";

interface MarketDepthProps {
  open: boolean;
  depth: MarketDepthType | null;
  onClose: () => void;
}

export function MarketDepth({ open, depth, onClose }: MarketDepthProps) {
  return (
    <ModalShell open={open} title="Market Depth" onClose={onClose}>
      {depth ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{depth.tradingsymbol}</div>
            <div className="mt-1 text-xs text-slate-500">LTP {depth.last_price.toFixed(2)}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DepthTable title="Bids" rows={depth.bids} tone="text-emerald-700" />
            <DepthTable title="Asks" rows={depth.asks} tone="text-rose-700" />
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

function DepthTable({ title, rows, tone }: { title: string; rows: { price: number; quantity: number; orders: number }[]; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="grid grid-cols-3 gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        <div>Price</div>
        <div>Qty</div>
        <div>Orders</div>
      </div>
      {rows.map((row, index) => (
        <div key={`${title}-${index}`} className="grid grid-cols-3 gap-2 border-t border-slate-100 px-4 py-2 text-sm">
          <div className={tone}>{row.price.toFixed(2)}</div>
          <div>{row.quantity}</div>
          <div>{row.orders}</div>
        </div>
      ))}
    </div>
  );
}
