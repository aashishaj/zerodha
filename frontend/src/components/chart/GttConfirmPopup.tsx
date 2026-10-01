import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { GttPlan, Instrument, Order } from "../../types";
import { useTradingStore } from "../../store/useTradingStore";
import { computeGttLegs } from "../../utils/gtt";
import { formatPrice } from "../../utils/format";

interface Props {
  instrument: Instrument;
  /** The executed entry the OCO exits. Its price is the base for both legs. */
  entry: Order;
  onClose: () => void;
}

function serverError(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message ?? (err instanceof Error ? err.message : fallback);
}

/**
 * Compact confirm for an OCO GTT exit. On open it asks the server for a dry
 * run, which validates the prices against the last price and returns how the
 * quantity splits at the freeze limit, so what is shown is what will be placed.
 */
export function GttConfirmPopup({ instrument, entry, onClose }: Props) {
  const slSettings = useTradingStore((s) => s.slSettings);
  const placeGtt   = useTradingStore((s) => s.placeGtt);

  const entryPrice = entry.price || entry.average_price || 0;
  const quantity = entry.filled_quantity || entry.quantity;
  const legs = useMemo(
    () => computeGttLegs(entry.transaction_type, entryPrice, slSettings, instrument.tick_size),
    [entry.transaction_type, entryPrice, slSettings, instrument.tick_size],
  );
  const payload = useMemo(
    () => ({
      instrument_token: instrument.instrument_token,
      exit_side: legs.exitSide,
      quantity,
      product: entry.product,
      stop: legs.stop,
      target: legs.target,
    }),
    [instrument.instrument_token, legs, quantity, entry.product],
  );

  const [plan, setPlan] = useState<GttPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setError(null);
    placeGtt({ ...payload, dry_run: true })
      .then((result) => { if (!cancelled) setPlan(result); })
      .catch((err) => { if (!cancelled) setError(serverError(err, "Could not check the GTT.")); });
    return () => { cancelled = true; };
  }, [payload, placeGtt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePlace = async () => {
    setPlacing(true);
    setError(null);
    try {
      const result = await placeGtt(payload);
      setDone(result.message ?? "GTT placed.");
    } catch (err) {
      setError(serverError(err, "Could not place the GTT."));
    } finally {
      setPlacing(false);
    }
  };

  const sideColor = legs.exitSide === "BUY" ? "#387ed1" : "#e5793b";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="w-80 rounded-[3px] border border-[#e5e7eb] bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-[#e8edf3] px-4 py-3">
          <span className="text-[13px] font-semibold text-[#222]">
            GTT (OCO) ·{" "}
            <span style={{ color: sideColor }}>{legs.exitSide}</span> {instrument.tradingsymbol}
          </span>
          <button onClick={onClose} className="text-[#9aa3af] hover:text-[#444]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3 text-[12px] text-[#444]">
          <div className="text-[11px] text-[#6b7280]">
            Exits the {entry.transaction_type} @ {formatPrice(entryPrice)}. Whichever leg triggers first fires; Kite cancels the other.
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[#9aa3af]">
                <th className="py-1 text-left font-semibold">Leg</th>
                <th className="py-1 text-right font-semibold">Trigger</th>
                <th className="py-1 text-right font-semibold">Limit</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 font-medium text-[#d64545]">Stop loss</td>
                <td className="py-1 text-right">{formatPrice(legs.stop.trigger)}</td>
                <td className="py-1 text-right">{formatPrice(legs.stop.price)}</td>
              </tr>
              <tr>
                <td className="py-1 font-medium text-[#16a34a]">Target</td>
                <td className="py-1 text-right">{formatPrice(legs.target.trigger)}</td>
                <td className="py-1 text-right">{formatPrice(legs.target.price)}</td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-[#f0f2f5] pt-2">
            {plan ? (
              <>
                <div className="text-[11px] text-[#6b7280]">
                  LTP {formatPrice(plan.last_price)} · {quantity} qty
                  {plan.freeze_limit ? ` · freeze limit ${plan.freeze_limit}` : ""}
                </div>
                <div className="mt-1 space-y-0.5">
                  {plan.quantities.map((q, i) => (
                    <div key={i} className="flex justify-between">
                      <span>GTT {i + 1}</span>
                      <span className="font-medium text-[#222]">{q} qty</span>
                    </div>
                  ))}
                </div>
              </>
            ) : !error ? (
              <div className="text-[11px] text-[#9aa3af]">Checking…</div>
            ) : null}
          </div>

          {error && (
            <div className="rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">{error}</div>
          )}
          {done && (
            <div className="rounded-[2px] border border-green-200 bg-green-50 px-3 py-2 text-[11px] text-green-700">{done}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e8edf3] px-4 py-2.5">
          <button
            onClick={onClose}
            className="rounded-[2px] px-3 py-1.5 text-[12px] text-[#6b7280] transition-colors hover:bg-[#f7f8fa]"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={() => void handlePlace()}
              disabled={!plan || placing}
              className="rounded-[2px] px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: sideColor }}
            >
              {placing ? "Placing…" : `Place ${plan && plan.quantities.length > 1 ? `${plan.quantities.length} GTTs` : "GTT"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
