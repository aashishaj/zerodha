import type { Instrument } from "../../types";
import { formatExpiry } from "../../utils/dates";
import { formatInstrumentLabel } from "../../utils/format";

interface SearchResultsProps {
  results: Instrument[];
  activeIndex: number;
  onSelect: (instrument: Instrument) => void;
  onCompare: (instrument: Instrument) => void;
  onAddWatchlist: (instrument: Instrument) => void;
}

export function SearchResults({ results, activeIndex, onSelect, onCompare, onAddWatchlist }: SearchResultsProps) {
  if (!results.length) {
    return (
      <div className="rounded-[2px] border border-[#e5e7eb] bg-white p-3 text-[12px] text-[#6b7280]">
        No matching instruments found.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2px] border border-[#e5e7eb] bg-white">
      {results.map((instrument, index) => (
        <div
          key={instrument.instrument_token}
          className={`grid grid-cols-[1fr_auto] gap-3 border-b border-[#f1f3f5] px-3 py-2.5 last:border-b-0 ${
            activeIndex === index ? "bg-[#fff7f3]" : ""
          }`}
        >
          <button className="border-0 bg-transparent p-0 text-left" onClick={() => onSelect(instrument)}>
            <div className="text-[13px] font-medium text-[#222]">{formatInstrumentLabel(instrument)}</div>
            <div className="mt-0.5 text-[11px] text-[#6b7280]">
              {instrument.name} · {instrument.segment} · {instrument.instrument_type}
              {instrument.expiry ? ` · ${formatExpiry(instrument.expiry)}` : ""}
              {instrument.strike ? ` · ${instrument.strike}` : ""}
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              className="rounded-sm border border-[#dfe3e8] px-2 py-1 text-[11px] font-medium text-[#4b5563]"
              onClick={() => onAddWatchlist(instrument)}
            >
              Add
            </button>
            <button
              className="rounded-sm border border-[#dfe3e8] px-2 py-1 text-[11px] font-medium text-[#4b5563]"
              onClick={() => onCompare(instrument)}
            >
              Compare
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
