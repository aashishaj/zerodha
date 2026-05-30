import { useMemo } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { OptionChainTable } from "../optionChain/OptionChainTable";
import { ExpirySelector } from "../optionChain/ExpirySelector";
import { EmptyState } from "../common/EmptyState";

export function RightPaneOptions() {
  const {
    optionChainRows,
    selectedUnderlying,
    selectedExpiry,
    instruments,
    setOptionChainFilters,
    addWatchlist,
    selectInstrument,
  } = useTradingStore();

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

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-[#e8edf3] bg-white">
      <div className="border-b border-[#e8edf3] px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[14px] font-medium text-[#222]">Options</div>
          <ExpirySelector
            value={selectedExpiry}
            options={expiries}
            onChange={(value) => void setOptionChainFilters(selectedUnderlying, value)}
            className="rounded-[2px] border-[#dce3ea] px-2 py-1 text-[12px]"
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          {(["NIFTY", "BANKNIFTY"] as const).map((underlying) => (
            <button
              key={underlying}
              className={`rounded-[2px] border px-3 py-1 text-[12px] ${
                underlying === selectedUnderlying
                  ? "border-[#ffd7c8] bg-[#fff8f4] font-medium text-[#ff5722]"
                  : "border-[#e5e7eb] bg-white text-[#6b7280]"
              }`}
              onClick={() => void setOptionChainFilters(underlying, selectedExpiry)}
            >
              {underlying}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-white p-0">
        {optionChainRows.length ? (
          <OptionChainTable
            rows={optionChainRows}
            atmStrike={atmStrike}
            compact
            onOpenInstrument={(token) => {
              const instrument = instruments.find((item) => item.instrument_token === token);
              if (instrument) void selectInstrument(instrument);
            }}
            onBuy={(token) => {
              const instrument = instruments.find((item) => item.instrument_token === token);
              if (instrument) useTradingStore.getState().openOrderTicket(instrument, "BUY");
            }}
            onSell={(token) => {
              const instrument = instruments.find((item) => item.instrument_token === token);
              if (instrument) useTradingStore.getState().openOrderTicket(instrument, "SELL");
            }}
            onAddWatchlist={(token) => {
              const instrument = instruments.find((item) => item.instrument_token === token);
              if (instrument) addWatchlist(instrument);
            }}
          />
        ) : (
          <EmptyState title="No option data" description="Choose an underlying and expiry to load the option chain in this pane." />
        )}
      </div>
    </div>
  );
}
