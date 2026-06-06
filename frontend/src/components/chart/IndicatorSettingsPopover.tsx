import { useEffect, useRef, useState } from "react";
import type { IndicatorInstance } from "../../types";

interface IndicatorSettingsPopoverProps {
  indicator: IndicatorInstance;
  /** Viewport coordinates to anchor the popover near the clicked settings icon */
  x: number;
  y: number;
  onApply: (updates: Partial<IndicatorInstance>) => void;
  onClose: () => void;
}

const LINE_WIDTHS = [1, 2, 3, 4];

export function IndicatorSettingsPopover({ indicator, x, y, onApply, onClose }: IndicatorSettingsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState(indicator.color);
  const [lineWidth, setLineWidth] = useState(indicator.lineWidth ?? 2);

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

  const handleApply = () => {
    onApply({ color, lineWidth });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-[60] w-56 rounded border border-[#ddd] bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="mb-2.5 text-[12px] font-semibold text-[#222]">{indicator.type} settings</p>

      <div className="mb-2.5 flex items-center justify-between">
        <label className="text-[12px] text-[#6b7280]">Color</label>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5"
          aria-label={`Color for ${indicator.type}`}
        />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="text-[12px] text-[#6b7280]">Line width</label>
        <select
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="h-6 w-16 rounded border border-[#d1d5db] px-1.5 text-[12px] text-[#222] focus:border-[#2f7df6] focus:outline-none"
          aria-label={`Line width for ${indicator.type}`}
        >
          {LINE_WIDTHS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded border border-[#d1d5db] px-3 py-1 text-[12px] text-[#6b7280] transition hover:bg-[#f7f8fa]"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          className="rounded px-3 py-1 text-[12px] font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: "#2f7df6" }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
