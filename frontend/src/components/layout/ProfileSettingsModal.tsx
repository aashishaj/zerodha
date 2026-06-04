import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTradingStore } from "../../store/useTradingStore";

interface Props {
  onClose: () => void;
}

function NumField({
  label,
  value,
  onChange,
  accent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
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
        className="h-8 w-full rounded-[2px] border border-[#d0d3d8] px-2 text-[13px] text-[#333] focus:outline-none"
        style={{ outlineColor: accent }}
        onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#d0d3d8")}
      />
    </div>
  );
}

export function ProfileSettingsModal({ onClose }: Props) {
  const profile      = useTradingStore((s) => s.profile);
  const slSettings   = useTradingStore((s) => s.slSettings);
  const setSLSettings = useTradingStore((s) => s.setSLSettings);

  const [buyTrig,  setBuyTrig]  = useState(String(slSettings.buyTriggerOffset));
  const [buyPrice, setBuyPrice] = useState(String(slSettings.buyPriceOffset));
  const [selTrig,  setSelTrig]  = useState(String(slSettings.sellTriggerOffset));
  const [selPrice, setSelPrice] = useState(String(slSettings.sellPriceOffset));

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
    setSLSettings({
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
            <NumField label="Limit price +"   value={buyPrice} onChange={setBuyPrice} accent="#387ed1" />
          </div>
        </div>

        {/* SELL section */}
        <div>
          <div className="mb-1.5 text-[12px] font-semibold" style={{ color: "#e5793b" }}>
            Sell — below Low
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Trigger price -" value={selTrig}  onChange={setSelTrig}  accent="#e5793b" />
            <NumField label="Limit price -"   value={selPrice} onChange={setSelPrice} accent="#e5793b" />
          </div>
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
          className="rounded-[2px] px-4 py-1.5 text-[12px] font-semibold text-white"
          style={{ backgroundColor: "#387ed1" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
