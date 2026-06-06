import { useEffect, useRef } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import type { IndicatorInstance } from "../../types";

interface IndicatorPopoverProps {
  onClose: () => void;
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-4 w-7 flex-none rounded-full transition-colors ${on ? "bg-[#2f7df6]" : "bg-[#d1d5db]"}`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${on ? "translate-x-3.5" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function IndicatorPopover({ onClose }: IndicatorPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const indicatorInstances = useTradingStore((state) => state.indicatorInstances);
  const addIndicator = useTradingStore((state) => state.addIndicator);
  const toggleIndicator = useTradingStore((state) => state.toggleIndicator);
  const updateIndicator = useTradingStore((state) => state.updateIndicator);

  useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointer);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const vwap = indicatorInstances.find((ind) => ind.type === "VWAP");
  const smma = indicatorInstances.find((ind) => ind.type === "SMMA");

  // Toggling adds the instance back if it was deleted, otherwise flips `enabled`
  const toggleType = (type: IndicatorInstance["type"], existing?: IndicatorInstance) => {
    if (existing) {
      toggleIndicator(existing.id);
      return;
    }
    if (type === "VWAP") {
      addIndicator({ id: `vwap-${Date.now()}`, type: "VWAP", enabled: true, color: "#2196f3", lineWidth: 2, source: "hlc3" });
    } else {
      addIndicator({ id: `smma-${Date.now()}`, type: "SMMA", enabled: true, color: "#8e44ad", lineWidth: 2, length: 7, source: "close" });
    }
  };

  return (
    <div
      ref={ref}
      className="absolute left-0 top-[calc(100%+4px)] z-40 w-56 rounded border border-[#e5e7eb] bg-white shadow-lg"
    >
      <div className="border-b border-[#f0f2f5] px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9aa3af]">Indicators</p>
      </div>

      {/* VWAP */}
      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-[#222]">VWAP</p>
            <p className="text-[11px] text-[#9aa3af]">Volume Weighted Avg Price</p>
          </div>
          <Toggle on={!!vwap?.enabled} onToggle={() => toggleType("VWAP", vwap)} />
        </div>
      </div>

      <div className="mx-3 border-t border-[#f0f2f5]" />

      {/* SMMA */}
      <div className="px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium text-[#222]">SMMA</p>
            <p className="text-[11px] text-[#9aa3af]">Smoothed Moving Average</p>
          </div>
          <Toggle on={!!smma?.enabled} onToggle={() => toggleType("SMMA", smma)} />
        </div>

        {smma?.enabled && (
          <div className="mt-2.5 flex items-center gap-2">
            <label className="text-[12px] text-[#6b7280]">Period</label>
            <input
              type="number"
              min={2}
              max={500}
              value={smma.length ?? 7}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v) && v >= 2 && v <= 500) updateIndicator(smma.id, { length: v });
              }}
              className="h-6 w-16 rounded border border-[#d1d5db] px-1.5 text-center text-[12px] text-[#222] focus:border-[#2f7df6] focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
