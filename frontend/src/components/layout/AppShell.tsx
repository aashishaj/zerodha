import { ChartWorkspace } from "../chart/ChartWorkspace";
import { TopHeader } from "./TopHeader";
import { useTradingStore } from "../../store/useTradingStore";
import { OrderTicket } from "../watchlist/OrderTicket";
import { MarketDepth } from "../watchlist/MarketDepth";
import { WatchlistSidebar } from "../watchlist/WatchlistSidebar";

export function AppShell() {
  const {
    activeOrderTicketInstrument,
    orderSide,
    isOrderTicketOpen,
    closeOrderTicket,
    marketDepth,
    isMarketDepthOpen,
    closeMarketDepth,
    quotes,
  } = useTradingStore();

  return (
    <div className="h-screen overflow-hidden bg-white text-[#222]">
      <TopHeader />
      <div className="flex h-[calc(100vh-48px)]">
        <WatchlistSidebar />
        <ChartWorkspace />
      </div>
      <OrderTicket
        open={isOrderTicketOpen}
        instrument={activeOrderTicketInstrument}
        side={orderSide}
        quote={activeOrderTicketInstrument ? quotes[activeOrderTicketInstrument.tradingsymbol] : undefined}
        onClose={closeOrderTicket}
      />
      <MarketDepth open={isMarketDepthOpen} depth={marketDepth} onClose={closeMarketDepth} />
    </div>
  );
}
