import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  IndicatorInstance,
  IndicatorLineStyle,
  IndicatorSource,
  VwapAnchorPeriod,
} from "../../types";
import { builtInDefaults, loadDefaults, saveDefaults, type IndicatorDraft } from "./indicatorDefaults";

interface IndicatorSettingsModalProps {
  indicator: IndicatorInstance;
  onApply: (updates: IndicatorDraft) => void;
  onClose: () => void;
}

type Tab = "Inputs" | "Style" | "Visibility";
const TABS: Tab[] = ["Inputs", "Style", "Visibility"];

const SMMA_SOURCES: IndicatorSource[] = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];
const VWAP_SOURCES: IndicatorSource[] = ["close", "hl2", "hlc3", "ohlc4"];
const ANCHOR_PERIODS: VwapAnchorPeriod[] = ["Session", "Week", "Month", "Quarter", "Year"];
const LINE_STYLES: IndicatorLineStyle[] = ["solid", "dashed", "dotted"];
const LINE_WIDTHS = [1, 2, 3, 4];
const INTERVAL_OPTIONS = ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y"];

// Extract the editable subset from a full instance
function toDraft(ind: IndicatorInstance): IndicatorDraft {
  return {
    color: ind.color,
    lineWidth: ind.lineWidth,
    lineStyle: ind.lineStyle ?? "solid",
    showPriceLine: ind.showPriceLine ?? true,
    showLastValue: ind.showLastValue ?? true,
    length: ind.length,
    source: ind.source,
    anchorPeriod: ind.anchorPeriod,
    showOnAllIntervals: ind.showOnAllIntervals ?? true,
    intervals: ind.intervals ?? [],
  };
}

const labelCls = "text-[13px] text-[#333]";
const fieldCls =
  "h-9 rounded-md border border-[#d6d6d6] bg-white px-2.5 text-[13px] text-[#222] focus:border-[#2f7df6] focus:outline-none";
const rowCls = "grid grid-cols-[160px_220px] items-center gap-5 mb-5";

export function IndicatorSettingsModal({ indicator, onApply, onClose }: IndicatorSettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("Inputs");
  const [draft, setDraft] = useState<IndicatorDraft>(() => toDraft(indicator));
  const [defaultsOpen, setDefaultsOpen] = useState(false);

  const patch = (updates: Partial<IndicatorDraft>) => setDraft((d) => ({ ...d, ...updates }));

  const lengthInvalid =
    indicator.type === "SMMA" &&
    (draft.length == null || !Number.isFinite(draft.length) || draft.length < 1 || draft.length > 500);

  // Escape closes without applying
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleOk = () => {
    if (lengthInvalid) return;
    onApply(draft);
    onClose();
  };

  const handleResetDefaults = () => {
    setDraft({ ...loadDefaults(indicator.type) });
    setDefaultsOpen(false);
  };

  const handleSaveDefaults = () => {
    saveDefaults(indicator.type, draft);
    setDefaultsOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20"
      onMouseDown={onClose}
    >
      <div
        ref={modalRef}
        className="flex max-h-[90vh] w-[720px] max-w-[calc(100vw-32px)] flex-col rounded border border-[#e0e0e0] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pb-2 pt-6">
          <h2 className="text-[18px] font-semibold text-[#222]">{indicator.type}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-[#444] transition hover:bg-[#f2f4f7] hover:text-[#111]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b-2 border-[#f1f1f1] px-7">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative pb-2.5 pt-1 text-[14px] font-semibold transition-colors ${
                tab === t ? "text-[#111]" : "text-[#9aa3af] hover:text-[#444]"
              }`}
            >
              {t}
              {tab === t && (
                <span className="absolute -bottom-[2px] left-0 h-[3px] w-full rounded-full bg-[#111]" />
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-[260px] flex-1 overflow-y-auto px-7 py-6">
          {tab === "Inputs" && (
            <div>
              {indicator.type === "SMMA" ? (
                <>
                  <div className={rowCls}>
                    <label className={labelCls}>Length</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={draft.length ?? 7}
                      onChange={(e) => patch({ length: parseInt(e.target.value, 10) })}
                      className={`${fieldCls} ${lengthInvalid ? "border-[#e74c3c]" : ""}`}
                    />
                  </div>
                  {lengthInvalid && (
                    <p className="-mt-3 mb-4 text-[12px] text-[#e74c3c]">Length must be between 1 and 500.</p>
                  )}
                  <div className={rowCls}>
                    <label className={labelCls}>Source</label>
                    <select
                      value={draft.source ?? "close"}
                      onChange={(e) => patch({ source: e.target.value as IndicatorSource })}
                      className={fieldCls}
                    >
                      {SMMA_SOURCES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className={rowCls}>
                    <label className={labelCls}>Source</label>
                    <select
                      value={draft.source ?? "hlc3"}
                      onChange={(e) => patch({ source: e.target.value as IndicatorSource })}
                      className={fieldCls}
                    >
                      {VWAP_SOURCES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className={rowCls}>
                    <label className={labelCls}>Anchor Period</label>
                    <select
                      value={draft.anchorPeriod ?? "Session"}
                      onChange={(e) => patch({ anchorPeriod: e.target.value as VwapAnchorPeriod })}
                      className={fieldCls}
                    >
                      {ANCHOR_PERIODS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "Style" && (
            <div>
              <p className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-[#9aa3af]">Line</p>
              <div className={rowCls}>
                <label className={labelCls}>Color</label>
                <input
                  type="color"
                  value={draft.color}
                  onChange={(e) => patch({ color: e.target.value })}
                  className="h-9 w-16 cursor-pointer rounded-md border border-[#d6d6d6] bg-white p-1"
                />
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Line width</label>
                <select
                  value={draft.lineWidth}
                  onChange={(e) => patch({ lineWidth: Number(e.target.value) })}
                  className={fieldCls}
                >
                  {LINE_WIDTHS.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className={rowCls}>
                <label className={labelCls}>Line style</label>
                <select
                  value={draft.lineStyle ?? "solid"}
                  onChange={(e) => patch({ lineStyle: e.target.value as IndicatorLineStyle })}
                  className={fieldCls}
                >
                  {LINE_STYLES.map((s) => (
                    <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              <p className="mb-3 mt-7 text-[12px] font-semibold uppercase tracking-wider text-[#9aa3af]">Labels</p>
              <label className="mb-3 flex items-center gap-2.5 text-[13px] text-[#333]">
                <input
                  type="checkbox"
                  checked={draft.showPriceLine ?? true}
                  onChange={(e) => patch({ showPriceLine: e.target.checked })}
                  className="h-4 w-4 accent-[#2f7df6]"
                />
                Price line
              </label>
              <label className="flex items-center gap-2.5 text-[13px] text-[#333]">
                <input
                  type="checkbox"
                  checked={draft.showLastValue ?? true}
                  onChange={(e) => patch({ showLastValue: e.target.checked })}
                  className="h-4 w-4 accent-[#2f7df6]"
                />
                Last value
              </label>
            </div>
          )}

          {tab === "Visibility" && (
            <div>
              <label className="mb-5 flex items-center gap-2.5 text-[13px] text-[#333]">
                <input
                  type="checkbox"
                  checked={draft.showOnAllIntervals ?? true}
                  onChange={(e) => patch({ showOnAllIntervals: e.target.checked })}
                  className="h-4 w-4 accent-[#2f7df6]"
                />
                Show on all intervals
              </label>

              {!(draft.showOnAllIntervals ?? true) && (
                <div className="grid grid-cols-4 gap-3">
                  {INTERVAL_OPTIONS.map((iv) => {
                    const checked = (draft.intervals ?? []).includes(iv);
                    return (
                      <label key={iv} className="flex items-center gap-2 text-[13px] text-[#333]">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const set = new Set(draft.intervals ?? []);
                            e.target.checked ? set.add(iv) : set.delete(iv);
                            patch({ intervals: [...set] });
                          }}
                          className="h-4 w-4 accent-[#2f7df6]"
                        />
                        {iv}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#e6e6e6] px-7 py-4">
          <div className="relative">
            <button
              onClick={() => setDefaultsOpen((v) => !v)}
              className="flex h-9 items-center gap-1.5 rounded-md border border-[#d6d6d6] bg-white px-3 text-[13px] text-[#333] transition hover:bg-[#f7f8fa]"
            >
              Defaults
              <span className="text-[10px] text-[#9aa3af]">▾</span>
            </button>
            {defaultsOpen && (
              <div className="absolute bottom-[calc(100%+6px)] left-0 z-10 w-44 rounded border border-[#e5e7eb] bg-white py-1 shadow-lg">
                <button
                  onClick={handleResetDefaults}
                  className="block w-full px-3 py-2 text-left text-[13px] text-[#333] transition hover:bg-[#f7f8fa]"
                >
                  Reset settings
                </button>
                <button
                  onClick={handleSaveDefaults}
                  className="block w-full px-3 py-2 text-left text-[13px] text-[#333] transition hover:bg-[#f7f8fa]"
                >
                  Save as default
                </button>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="h-9 min-w-[96px] rounded-md border border-[#222] bg-white px-4 text-[13px] font-medium text-[#222] transition hover:bg-[#f7f8fa]"
            >
              Cancel
            </button>
            <button
              onClick={handleOk}
              disabled={lengthInvalid}
              className="h-9 min-w-[72px] rounded-md bg-[#111] px-4 text-[13px] font-medium text-white transition hover:bg-[#000] disabled:opacity-40"
            >
              Ok
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
