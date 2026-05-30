import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument } from "../../types";
import { searchInstruments } from "../../utils/search";
import { formatExpiry } from "../../utils/dates";

interface InstrumentSearchOverlayProps {
  instruments: Instrument[];
  open: boolean;
  onClose: () => void;
  onSelect: (instrument: Instrument) => void;
}

const instrumentLabel = (instrument: Instrument) => {
  if (instrument.segment === "NFO-FUT" && instrument.expiry) {
    const month = formatExpiry(instrument.expiry).split(" ").slice(1, 2).join(" ").toUpperCase();
    return `${instrument.name} ${month} FUT`;
  }
  if (instrument.segment === "NFO-OPT" && instrument.expiry && instrument.strike) {
    const month = formatExpiry(instrument.expiry).split(" ").slice(1, 2).join(" ").toUpperCase();
    return `${instrument.name} ${month} ${instrument.strike} ${instrument.instrument_type}`;
  }
  return instrument.name || instrument.tradingsymbol;
};

const badgeLabel = (instrument: Instrument) => {
  if (instrument.exchange === "NFO") return "NFO";
  if (instrument.segment.includes("INDEX")) return "INDICES";
  return instrument.exchange;
};

export function InstrumentSearchOverlay({
  instruments,
  open,
  onClose,
  onSelect,
}: InstrumentSearchOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const handlePointer = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handlePointer);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handlePointer);
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return instruments
        .filter((instrument) => ["NSE", "NFO", "BSE", "BFO"].includes(instrument.exchange))
        .slice(0, 8);
    }
    return searchInstruments(instruments, query).slice(0, 12);
  }, [instruments, query]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 bg-white/55 backdrop-blur-[2px]">
      <div
        ref={panelRef}
        className="absolute left-1/2 top-14 w-[min(820px,calc(100%-64px))] -translate-x-1/2 overflow-hidden rounded-[4px] border border-[#dfe5ec] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
      >
        <div className="flex items-center border-b border-[#e8edf3] px-6 py-5">
          <Search className="h-5 w-5 text-[#6b7280]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stocks, futures, options"
            className="ml-4 w-full border-0 bg-transparent p-0 text-[16px] text-[#222] outline-none placeholder:text-[#9aa3af]"
          />
        </div>
        <div className="max-h-[420px] overflow-auto py-2">
          {results.map((instrument) => (
            <button
              key={instrument.instrument_token}
              type="button"
              onClick={() => {
                onSelect(instrument);
                onClose();
              }}
              className="flex w-full items-center justify-between px-10 py-3 text-left hover:bg-[#f7f9fb]"
            >
              <span className="text-[14px] text-[#2a3342]">{instrumentLabel(instrument)}</span>
              <span className="rounded-[4px] bg-[#f3f4f6] px-2.5 py-1 text-[11px] uppercase tracking-[0.04em] text-[#6b7280]">
                {badgeLabel(instrument)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
