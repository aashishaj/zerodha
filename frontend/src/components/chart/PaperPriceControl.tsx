import { useEffect, useState } from "react";
import type { Instrument } from "../../types";
import { useTradingStore } from "../../store/useTradingStore";

interface Props {
  instrument: Instrument;
  lastPrice?: number;
}

/**
 * Paper trading only: sets this instrument's simulated last price. Crossing
 * an SL entry's trigger fills it exactly as Kite would report it, so the
 * Stop Loss / GTT flow can be stepped through without real money.
 */
export function PaperPriceControl({ instrument, lastPrice }: Props) {
  const setPaperPrice = useTradingStore((s) => s.setPaperPrice);
  const [value, setValue] = useState(lastPrice != null ? String(lastPrice) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the current paper price whenever it moves (only this box moves it).
  useEffect(() => {
    if (lastPrice != null) setValue(String(lastPrice));
  }, [lastPrice, instrument.instrument_token]);

  const submit = async () => {
    const price = Number(value);
    if (!(price > 0)) {
      setError("Enter a price above 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setPaperPrice(instrument, price);
    } catch {
      setError("Could not set price");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      title={error ?? "Paper trading: move the simulated price to fill or trigger orders"}
      className="mr-1 flex h-7 items-center gap-1 rounded-[2px] border border-dashed border-[#9b59b6] px-1.5 text-[11px] text-[#7d3c98]"
    >
      <span className="font-semibold">Paper LTP</span>
      <input
        type="number"
        step={instrument.tick_size || 0.05}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`h-5 w-20 rounded-[2px] border px-1 text-right text-[12px] text-[#222] outline-none ${error ? "border-[#df514c]" : "border-[#e0e0e0]"}`}
      />
      <button type="submit" disabled={busy} className="rounded-[2px] bg-[#9b59b6] px-1.5 py-0.5 font-semibold text-white disabled:opacity-50">
        {busy ? "…" : "Set"}
      </button>
    </form>
  );
}
