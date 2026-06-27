import { BarChart3, ChevronLeft, ChevronRight, List } from "lucide-react";
import { InstrumentSearch } from "./InstrumentSearch";
import { WatchlistRow } from "./WatchlistRow";
import { formatPrice, movementClass } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

export function WatchlistSidebar() {
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
    quotes,
    isWatchlistCollapsed,
    toggleWatchlistCollapsed,
  } = useTradingStore();

  const indexQuote = quotes["NIFTY 50"];
  const activeRange =
    indexQuote && indexQuote.high && indexQuote.low && indexQuote.last_price
      ? Math.min(100, Math.max(0, ((indexQuote.last_price - indexQuote.low) / (indexQuote.high - indexQuote.low || 1)) * 100))
      : 0;

  return (
    <aside
      className={`relative flex h-[calc(100vh-48px)] shrink-0 flex-col border-r border-[#e8edf3] bg-white transition-[width] duration-200 ease-in-out ${
        isWatchlistCollapsed ? "w-12" : "w-[320px]"
      }`}
    >
      {/* Collapse / expand toggle — sits on the right edge, visible in both states */}
      <button
        type="button"
        onClick={toggleWatchlistCollapsed}
        aria-label={isWatchlistCollapsed ? "Expand watchlist" : "Collapse watchlist"}
        title={isWatchlistCollapsed ? "Expand watchlist" : "Collapse watchlist"}
        className="absolute -right-3 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#e8edf3] bg-white text-[#6b7280] shadow-sm transition-colors hover:text-[#222]"
      >
        {isWatchlistCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {isWatchlistCollapsed ? (
        <div className="flex flex-1 flex-col items-center gap-5 pt-4 text-[#9aa3af]">
          <List className="h-5 w-5" />
          <BarChart3 className="h-5 w-5" />
        </div>
      ) : (
      <>
      <InstrumentSearch />

      <div className="flex items-center justify-between px-4 py-2 text-[12px] text-[#6b7280]">
        <div>Nifty ({watchlist.length} / 250)</div>
        <button className="font-medium text-[#4184f3]">+ New group</button>
      </div>

      <div className="border-b border-t border-[#e8edf3] bg-[#fafafa] px-4 py-2 text-[12px] font-medium text-[#444]">
        Default ({watchlist.length})
      </div>

      {indexQuote && (
        <div className="border-b border-[#e8edf3] px-4 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[13px] font-medium text-[#222]">NIFTY 50</div>
              <div className="mt-0.5 text-[11px] text-[#9aa3af]">INDEX</div>
            </div>
            <div className={`text-right text-[13px] font-medium ${movementClass(indexQuote.change)}`}>
              {formatPrice(indexQuote.last_price)}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-[10px] text-[#6b7280]">
            <div>
              <div>Open</div>
              <div className="mt-0.5 text-[#222]">{formatPrice(indexQuote.open)}</div>
            </div>
            <div>
              <div>Low</div>
              <div className="mt-0.5 text-[#222]">{formatPrice(indexQuote.low)}</div>
            </div>
            <div>
              <div>Prev close</div>
              <div className="mt-0.5 text-[#222]">{formatPrice(indexQuote.close)}</div>
            </div>
            <div>
              <div>High</div>
              <div className="mt-0.5 text-[#222]">{formatPrice(indexQuote.high)}</div>
            </div>
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-[#eef1f4]">
            <div
              className="h-1.5 rounded-full bg-[#ff5722]"
              style={{ width: `${activeRange}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {watchlist.map((item) => (
          <WatchlistRow
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

      <div className="flex items-center justify-between border-t border-[#e8edf3] px-4 py-2 text-[12px] text-[#6b7280]">
        <div className="flex items-center gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((tab) => (
            <button
              key={tab}
              className={`relative pb-1 ${
                tab === 1 ? "font-medium text-[#222] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#ff5722]" : ""
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <BarChart3 className="h-4 w-4 text-[#9aa3af]" />
      </div>
      </>
      )}
    </aside>
  );
}
