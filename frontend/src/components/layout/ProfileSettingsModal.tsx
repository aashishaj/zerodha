import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { isWholeMultiple, snapToStep } from "../../utils/quantity";

interface Props {
  onClose: () => void;
}

function NumField({
  label,
  value,
  onChange,
  accent,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] text-[#9aa3af]">{label}</div>
      <input
        type="number"
        step="0.5"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-[2px] border px-2 text-[13px] text-[#333] focus:outline-none"
        style={{ outlineColor: accent, borderColor: invalid ? "#f87171" : "#d0d3d8" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
        onBlur={(e) => (e.currentTarget.style.borderColor = invalid ? "#f87171" : "#d0d3d8")}
      />
    </div>
  );
}

export function ProfileSettingsModal({ onClose }: Props) {
  const profile      = useTradingStore((s) => s.profile);
  const slSettings   = useTradingStore((s) => s.slSettings);
  const setSLSettings = useTradingStore((s) => s.setSLSettings);

  const [defaultQty, setDefaultQty] = useState(String(slSettings.defaultQty));

  // The lot size is the unit every quantity moves in. It has no field of its
  // own by choice, but it stays in settings rather than being hardcoded here
  // and in the order ticket, so a lot-size change is a one-line edit. Guard
  // the stored value in case it was ever written as junk — falling back to 65
  // rather than to 1, which would quietly drop the lot constraint altogether.
  const storedLot = Math.round(Number(slSettings.lotSize));
  const lotStep = storedLot > 0 ? storedLot : 65;
  const defaultQtyValid = isWholeMultiple(Number(defaultQty), lotStep);
  const [buyTrig,    setBuyTrig]    = useState(String(slSettings.buyTriggerOffset));
  const [buyPrice,   setBuyPrice]   = useState(String(slSettings.buyPriceOffset));
  const [selTrig,    setSelTrig]    = useState(String(slSettings.sellTriggerOffset));
  const [selPrice,   setSelPrice]   = useState(String(slSettings.sellPriceOffset));

  // A stop's limit must sit further out than its trigger — above it on a BUY,
  // below it on a SELL. Both fields hold magnitudes, so on either side that is
  // the same comparison: the limit offset must be at least the trigger offset.
  // Kite rejects a stop whose limit falls inside its trigger, so catch it here
  // rather than at the exchange. Equal is fine; NaN fails, which is intended.
  const buyOffsetsValid  = Number(buyPrice) >= Number(buyTrig);
  const sellOffsetsValid = Number(selPrice) >= Number(selTrig);
  const offsetsValid = buyOffsetsValid && sellOffsetsValid;

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handleSave = () => {
    if (!offsetsValid) return;
    setSLSettings({
      lotSize:           lotStep,
      defaultQty:        snapToStep(Math.round(Number(defaultQty)), lotStep),
      buyTriggerOffset:  Math.max(0, Number(buyTrig)  || 2),
      buyPriceOffset:    Math.max(0, Number(buyPrice) || 2.5),
      sellTriggerOffset: Math.max(0, Number(selTrig)  || 2),
      sellPriceOffset:   Math.max(0, Number(selPrice) || 2.5),
    });
    onClose();
  };

  return (
    <div
      ref={ref}
      className="fixed z-50 right-4 top-12 w-72 overflow-hidden rounded-[3px] border border-[#e5e7eb] bg-white shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#e8edf3] px-4 py-3">
        <span className="text-[13px] font-semibold text-[#222]">Profile &amp; Settings</span>
        <button onClick={onClose} className="text-[#9aa3af] hover:text-[#444]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Profile info */}
      <div className="border-b border-[#f0f2f5] px-4 py-3">
        <div className="text-[13px] font-semibold text-[#222]">{profile?.name ?? "—"}</div>
        <div className="mt-0.5 text-[11px] text-[#9aa3af]">
          User ID: {profile?.userId ?? "—"}
        </div>
      </div>

      {/* Default Qty — where the order ticket opens, in whole lots. */}
      <div className="border-b border-[#f0f2f5] px-4 py-3">
        <div>
          <div className="mb-1.5 text-[11px] font-semibold text-[#9aa3af]">DEFAULT QTY (SHARES)</div>
          <div className="mb-1.5 text-[10px] text-[#9aa3af]">
            Moves in steps of {lotStep} &mdash; {lotStep} &rarr; {lotStep * 2} &rarr; {lotStep * 3}.
          </div>
          <input
            type="number"
            step={lotStep}
            min={lotStep}
            value={defaultQty}
            onChange={(e) => setDefaultQty(e.target.value)}
            className="h-8 w-full rounded-[2px] border px-2 text-[13px] text-[#333] focus:outline-none"
            style={{ borderColor: defaultQtyValid ? "#d0d3d8" : "#f87171" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#387ed1")}
            // Snap on the way out so the saved value is always a whole lot.
            onBlur={(e) => {
              setDefaultQty(String(snapToStep(Number(defaultQty), lotStep)));
              e.currentTarget.style.borderColor = "#d0d3d8";
            }}
          />
          {!defaultQtyValid && (
            <div className="mt-1 text-[10px] text-red-600">
              Must be a multiple of {lotStep}
            </div>
          )}
        </div>
      </div>

      {/* SL offset settings */}
      <div className="space-y-3 px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9aa3af]">
          SL Order Offsets (points from candle)
        </div>

        {/* BUY section */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "#387ed1" }}>
            Buy — above High
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Trigger price +" value={buyTrig}  onChange={setBuyTrig}  accent="#387ed1" />
            <NumField label="Limit price +"   value={buyPrice} onChange={setBuyPrice} accent="#387ed1" invalid={!buyOffsetsValid} />
          </div>
          {!buyOffsetsValid && (
            <div className="mt-1 text-[10px] text-red-600">
              Limit must be at least the trigger, so it sits above it. Kite rejects a buy stop whose limit is lower.
            </div>
          )}
        </div>

        {/* SELL section */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "#e5793b" }}>
            Sell — below Low
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Trigger price -" value={selTrig}  onChange={setSelTrig}  accent="#e5793b" />
            <NumField label="Limit price -"   value={selPrice} onChange={setSelPrice} accent="#e5793b" invalid={!sellOffsetsValid} />
          </div>
          {!sellOffsetsValid && (
            <div className="mt-1 text-[10px] text-red-600">
              Limit must be at least the trigger, so it sits below it. Kite rejects a sell stop whose limit is higher.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t border-[#e8edf3] px-4 py-2.5">
        <button
          onClick={onClose}
          className="rounded-[2px] px-3 py-1.5 text-[12px] text-[#6b7280] transition-colors hover:bg-[#f7f8fa]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!offsetsValid}
          className="rounded-[2px] px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "#387ed1" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
