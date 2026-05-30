import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { ExpirySelector } from "./ExpirySelector";
import { InstrumentSearchOverlay } from "./InstrumentSearchOverlay";
import { OptionChainTable } from "./OptionChainTable";
import { OptionSummaryBar } from "./OptionSummaryBar";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";

const preferredUnderlying = (name: string) => {
  if (name === "NIFTY BANK") return "BANKNIFTY";
  return name;
};

export function OptionChainTab() {
  const {
    instruments,
    quotes,
    optionChainRows,
    selectedUnderlying,
    selectedExpiry,
    setOptionChainFilters,
    addWatchlist,
    selectInstrument,
    refreshQuotes,
  } = useTradingStore();
  const [searchOpen, setSearchOpen] = useState(false);

  const expiries = useMemo(
    () =>
      instruments
        .filter((instrument) => instrument.name === selectedUnderlying && instrument.segment === "NFO-OPT" && instrument.expiry)
        .map((instrument) => instrument.expiry!)
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort(),
    [instruments, selectedUnderlying],
  );

  const atmStrike = optionChainRows[Math.floor(optionChainRows.length / 2)]?.strike;

  const headerInstrument =
    instruments.find(
      (instrument) =>
        instrument.segment !== "NFO-OPT" &&
        instrument.segment !== "NFO-FUT" &&
        (
          instrument.tradingsymbol === selectedUnderlying ||
          instrument.name === selectedUnderlying ||
          instrument.tradingsymbol.startsWith(selectedUnderlying) ||
          selectedUnderlying.startsWith(instrument.tradingsymbol)
        ),
    ) ??
    instruments.find((instrument) => instrument.name === selectedUnderlying && instrument.segment.includes("INDEX")) ??
    null;

  const headerSymbol = selectedUnderlying || headerInstrument?.tradingsymbol || "NIFTY";
  const headerQuote = headerInstrument ? quotes[headerInstrument.tradingsymbol] : undefined;

  const handleSelectInstrument = async (instrument: (typeof instruments)[number]) => {
    const underlying = preferredUnderlying(instrument.name || instrument.tradingsymbol);
    const underlyingInstrument =
      instruments.find(
        (item) =>
          item.segment !== "NFO-OPT" &&
          item.segment !== "NFO-FUT" &&
          (item.tradingsymbol === underlying || item.name === underlying),
      ) ?? null;
    const matchingExpiries = instruments
      .filter((item) => item.name === underlying && item.segment === "NFO-OPT" && item.expiry)
      .map((item) => item.expiry!)
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort();

    await selectInstrument(instrument);
    await refreshQuotes(
      [instrument.tradingsymbol, underlyingInstrument?.tradingsymbol].filter(Boolean) as string[],
    );
    await setOptionChainFilters(underlying, instrument.expiry || matchingExpiries[0] || "");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="border-b border-[#e8edf3] px-7 py-5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-[19px] font-medium text-[#2a3342]">{headerSymbol}</span>
          {headerQuote && (
            <>
              <span className="text-[15px] font-medium text-[#2a3342]">{formatPrice(headerQuote.last_price)}</span>
              <span className={`text-[15px] ${movementClass(headerQuote.change)}`}>
                {formatChange(headerQuote.change)} ({formatPercent(headerQuote.changePercent)})
              </span>
            </>
          )}
          <Search className="h-4 w-4 text-[#9aa3af]" />
        </button>
        <div className="mt-4 flex items-center justify-between gap-4">
          <ExpirySelector value={selectedExpiry} options={expiries} onChange={(value) => void setOptionChainFilters(selectedUnderlying, value)} />
          <div className="text-[12px] text-[#9aa3af]">OI</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <OptionChainTable
          rows={optionChainRows}
          atmStrike={atmStrike}
          onOpenInstrument={(token) => {
            const instrument = instruments.find((item) => item.instrument_token === token);
            if (instrument) void selectInstrument(instrument);
          }}
          onAddWatchlist={(token) => {
            const instrument = instruments.find((item) => item.instrument_token === token);
            if (instrument) addWatchlist(instrument);
          }}
        />
      </div>

      <OptionSummaryBar rows={optionChainRows} atmStrike={atmStrike} />

      <InstrumentSearchOverlay
        instruments={instruments}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(instrument) => {
          void handleSelectInstrument(instrument);
        }}
      />
    </div>
  );
}
