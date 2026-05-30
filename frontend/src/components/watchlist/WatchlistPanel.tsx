import { InstrumentSearch } from "./InstrumentSearch";
import { WatchlistItem } from "./WatchlistItem";
import { useTradingStore } from "../../store/useTradingStore";

export function WatchlistPanel() {
  const {
    watchlist,
    instruments,
    selectedInstrument,
    compareInstrument,
    selectInstrument,
    setCompareInstrument,
    openOrderTicket,
    openMarketDepth,
    removeWatchlist,
    loadingInstrumentToken,
  } = useTradingStore();

  return (
    <aside className="flex h-[calc(100vh-56px)] w-[340px] flex-col border-r border-[#e6e8eb] bg-white">
      <InstrumentSearch />

      <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-[#8b95a1]">
        <div>Watchlist 1 ({watchlist.length} / 250)</div>
        <button className="font-medium text-[#4184f3] hover:text-[#2d6de0]">+ New group</button>
      </div>

      <div className="flex h-9 items-center border-y border-[#edf0f2] bg-[#fafafa] px-4 text-[13px] font-semibold text-[#444]">
        Default ({watchlist.length})
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        {watchlist.map((item) => (
          <WatchlistItem
            key={item.instrument_token}
            item={item}
            active={
              selectedInstrument?.instrument_token === item.instrument_token
                ? "primary"
                : compareInstrument?.instrument_token === item.instrument_token
                  ? "compare"
                  : false
            }
            onOpenPrimary={() => {
              const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
              if (match) void selectInstrument(match);
            }}
            onOpenCompare={() => {
              const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
              if (match) void setCompareInstrument(match);
            }}
            onBuy={() => {
              const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
              if (match) openOrderTicket(match, "BUY");
            }}
            onSell={() => {
              const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
              if (match) openOrderTicket(match, "SELL");
            }}
            onDepth={() => {
              const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
              if (match) void openMarketDepth(match);
            }}
            onRemove={() => removeWatchlist(item.instrument_token)}
            loading={loadingInstrumentToken === item.instrument_token}
            sameAsPrimary={
              selectedInstrument?.instrument_token === item.instrument_token &&
              compareInstrument?.instrument_token === item.instrument_token
            }
          />
        ))}
      </div>
    </aside>
  );
}
