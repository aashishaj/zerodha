import { ExternalLink, Link, Search, Settings2, ShoppingBasket } from "lucide-react";
import { useMemo, useState } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { ExpirySelector } from "./ExpirySelector";
import { InstrumentSearchOverlay } from "./InstrumentSearchOverlay";
import { OptionChainTable } from "./OptionChainTable";
import { OptionSummaryBar } from "./OptionSummaryBar";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";

type ViewMode = "oi" | "greeks";

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
    openOrderTicket,
    refreshQuotes,
  } = useTradingStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("oi");
  const [basketOpen, setBasketOpen] = useState(false);

  const expiries = useMemo(
    () =>
      instruments
        .filter((i) => i.name === selectedUnderlying && i.segment === "NFO-OPT" && i.expiry)
        .map((i) => i.expiry!)
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .sort(),
    [instruments, selectedUnderlying],
  );

  const atmStrike = optionChainRows[Math.floor(optionChainRows.length / 2)]?.strike;

  const headerInstrument =
    instruments.find(
      (i) =>
        i.segment !== "NFO-OPT" &&
        i.segment !== "NFO-FUT" &&
        (i.tradingsymbol === selectedUnderlying ||
          i.name === selectedUnderlying ||
          i.tradingsymbol.startsWith(selectedUnderlying) ||
          selectedUnderlying.startsWith(i.tradingsymbol)),
    ) ??
    instruments.find((i) => i.name === selectedUnderlying && i.segment.includes("INDEX")) ??
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
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .sort();

    await selectInstrument(instrument);
    await refreshQuotes(
      [instrument.tradingsymbol, underlyingInstrument?.tradingsymbol].filter(Boolean) as string[],
    );
    await setOptionChainFilters(underlying, instrument.expiry || matchingExpiries[0] || "");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white">

      {/* ── Row 1: Index header ── */}
      <div className="flex flex-none items-center justify-between border-b border-[#e8edf3] px-6 py-3">

        {/* Left: symbol + price */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 rounded-sm hover:bg-[#f7f9fb] px-1 -mx-1"
          >
            <span className="text-[16px] font-semibold text-[#2a3342]">{headerSymbol}</span>
            <Search className="h-3.5 w-3.5 text-[#9aa3af]" />
          </button>
          {headerQuote && (
            <>
              <span className="text-[14px] font-semibold text-[#2a3342]">
                {formatPrice(headerQuote.last_price)}
              </span>
              <span className={`text-[13px] font-medium ${movementClass(headerQuote.change)}`}>
                {formatChange(headerQuote.change)} ({formatPercent(headerQuote.changePercent)})
              </span>
            </>
          )}
        </div>

        {/* Right: utility icons + Basket */}
        <div className="flex items-center gap-1 text-[#8b94a5]">
          <button title="Share" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#f3f4f6] hover:text-[#444]">
            <Link className="h-4 w-4" />
          </button>
          <button title="Search" onClick={() => setSearchOpen(true)} className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#f3f4f6] hover:text-[#444]">
            <Search className="h-4 w-4" />
          </button>
          <button title="Settings" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#f3f4f6] hover:text-[#444]">
            <Settings2 className="h-4 w-4" />
          </button>
          <button title="Open full view" className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#f3f4f6] hover:text-[#444]">
            <ExternalLink className="h-4 w-4" />
          </button>
          <div className="mx-1 h-4 w-px bg-[#e8edf3]" />
          <button
            title="Basket"
            onClick={() => setBasketOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[12px] font-medium transition ${
              basketOpen
                ? "border-[#ff5722] bg-[#fff3ef] text-[#ff5722]"
                : "border-[#dde4ec] text-[#536277] hover:border-[#b0bec5]"
            }`}
          >
            <ShoppingBasket className="h-3.5 w-3.5" />
            Basket
          </button>
        </div>
      </div>

      {/* ── Row 2: Expiry pills + OI/Greeks toggle ── */}
      <div className="flex flex-none items-center justify-between border-b border-[#e8edf3] px-6 py-2">
        <ExpirySelector
          value={selectedExpiry}
          options={expiries}
          onChange={(value) => void setOptionChainFilters(selectedUnderlying, value)}
        />

        {/* OI / Greeks toggle */}
        <div className="flex items-center gap-1 rounded-full border border-[#e8edf3] p-0.5">
          {(["oi", "greeks"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                viewMode === mode
                  ? "bg-[#e9f1ff] text-[#3578e5]"
                  : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              {mode === "oi" ? "OI" : "Greeks"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <OptionChainTable
          rows={optionChainRows}
          atmStrike={atmStrike}
          onOpenInstrument={(token) => {
            const instrument = instruments.find((i) => i.instrument_token === token);
            if (instrument) void selectInstrument(instrument);
          }}
          onBuy={(token) => {
            const instrument = instruments.find((i) => i.instrument_token === token);
            if (instrument) openOrderTicket(instrument, "BUY");
          }}
          onSell={(token) => {
            const instrument = instruments.find((i) => i.instrument_token === token);
            if (instrument) openOrderTicket(instrument, "SELL");
          }}
          onAddWatchlist={(token) => {
            const instrument = instruments.find((i) => i.instrument_token === token);
            if (instrument) addWatchlist(instrument);
          }}
        />
      </div>

      <OptionSummaryBar rows={optionChainRows} atmStrike={atmStrike} />

      <InstrumentSearchOverlay
        instruments={instruments}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(instrument) => void handleSelectInstrument(instrument)}
      />
    </div>
  );
}
