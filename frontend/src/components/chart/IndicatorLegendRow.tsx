import { Eye, EyeOff, Settings, Trash2, MoreHorizontal } from "lucide-react";
import type { IndicatorInstance } from "../../types";

// Build the Zerodha-style label, e.g. "VWAP hlc3 Session" / "SMMA 7 close"
export function indicatorLabel(indicator: IndicatorInstance): string {
  if (indicator.type === "VWAP") {
    return `VWAP ${indicator.source ?? "hlc3"} Session`;
  }
  return `SMMA ${indicator.length ?? 7} ${indicator.source ?? "close"}`;
}

interface IndicatorLegendRowProps {
  indicator: IndicatorInstance;
  value: number | null;
  active: boolean;
  onActivate: () => void;
  onToggle: () => void;
  onSettings: (rect: DOMRect) => void;
  onDelete: () => void;
}

export function IndicatorLegendRow({
  indicator,
  value,
  active,
  onActivate,
  onToggle,
  onSettings,
  onDelete,
}: IndicatorLegendRowProps) {
  const label = indicatorLabel(indicator);
  const hidden = !indicator.enabled;
  const valueText = value != null ? value.toFixed(2) : "ø";
  // Actions are revealed on hover (CSS) or when the row is active (clicked)
  const actionsVisibility = active ? "flex" : "hidden group-hover:flex";

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onActivate}
      className={`group pointer-events-auto inline-flex items-center gap-2 rounded border px-1.5 py-0.5 text-[12px] leading-[18px] transition-colors ${
        active
          ? "border-[#3b82f6] bg-white/95"
          : "border-transparent bg-transparent hover:border-[#3b82f6] hover:bg-white/95"
      }`}
    >
      <span className={`whitespace-nowrap text-[#666] ${hidden ? "opacity-45" : ""}`}>{label}</span>
      <span
        className={`whitespace-nowrap font-medium ${hidden ? "opacity-45" : ""}`}
        style={{ color: indicator.color }}
      >
        {valueText}
      </span>

      <div className={`${actionsVisibility} items-center gap-0.5`}>
        <button
          aria-label={`${indicator.enabled ? "Hide" : "Show"} ${label}`}
          title={indicator.enabled ? "Hide" : "Show"}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="flex h-5 w-5 items-center justify-center rounded text-[#444] hover:bg-[#eef2f7] hover:text-[#111]"
        >
          {indicator.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          aria-label={`Settings for ${label}`}
          title="Settings"
          onClick={(e) => { e.stopPropagation(); onSettings(e.currentTarget.getBoundingClientRect()); }}
          className="flex h-5 w-5 items-center justify-center rounded text-[#444] hover:bg-[#eef2f7] hover:text-[#111]"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={`Delete ${label}`}
          title="Delete"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="flex h-5 w-5 items-center justify-center rounded text-[#444] hover:bg-[#eef2f7] hover:text-[#e74c3c]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          aria-label={`More options for ${label}`}
          title="More"
          onClick={(e) => e.stopPropagation()}
          className="flex h-5 w-5 items-center justify-center rounded text-[#444] hover:bg-[#eef2f7] hover:text-[#111]"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
