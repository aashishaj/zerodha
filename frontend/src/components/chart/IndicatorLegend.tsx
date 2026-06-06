import { useEffect, useState } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { IndicatorLegendRow } from "./IndicatorLegendRow";
import { IndicatorSettingsModal } from "./IndicatorSettingsModal";
import type { IndicatorInstance } from "../../types";

interface IndicatorLegendProps {
  /** Latest value per indicator id, supplied by the chart */
  values: Record<string, number | null>;
}

export function IndicatorLegend({ values }: IndicatorLegendProps) {
  const indicatorInstances = useTradingStore((state) => state.indicatorInstances);
  const toggleIndicator = useTradingStore((state) => state.toggleIndicator);
  const deleteIndicator = useTradingStore((state) => state.deleteIndicator);
  const updateIndicator = useTradingStore((state) => state.updateIndicator);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [settingsIndicator, setSettingsIndicator] = useState<IndicatorInstance | null>(null);

  // Clear the active row when clicking anywhere outside the legend
  useEffect(() => {
    if (!activeId) return;
    const clear = () => setActiveId(null);
    const timer = window.setTimeout(() => window.addEventListener("mousedown", clear), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", clear);
    };
  }, [activeId]);

  if (indicatorInstances.length === 0) return null;

  return (
    <>
      {/* Overlay container: no pointer events except on the rows themselves,
          so the chart crosshair still works everywhere else. */}
      <div className="pointer-events-none absolute left-3 top-3 z-30 flex flex-col items-start gap-1">
        {indicatorInstances.map((indicator) => (
          <IndicatorLegendRow
            key={indicator.id}
            indicator={indicator}
            value={values[indicator.id] ?? null}
            active={activeId === indicator.id}
            onActivate={() => setActiveId(indicator.id)}
            onToggle={() => toggleIndicator(indicator.id)}
            onDelete={() => {
              deleteIndicator(indicator.id);
              if (settingsIndicator?.id === indicator.id) setSettingsIndicator(null);
            }}
            onSettings={() => setSettingsIndicator(indicator)}
          />
        ))}
      </div>

      {settingsIndicator && (
        <IndicatorSettingsModal
          indicator={settingsIndicator}
          onApply={(updates) => updateIndicator(settingsIndicator.id, updates)}
          onClose={() => setSettingsIndicator(null)}
        />
      )}
    </>
  );
}
