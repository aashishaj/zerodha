import { ChartWorkspace } from "../chart/ChartWorkspace";
import { TopHeader } from "./TopHeader";
import { useTradingStore } from "../../store/useTradingStore";
import { OrderTicket } from "../watchlist/OrderTicket";
import { MarketDepth } from "../watchlist/MarketDepth";
import { WatchlistSidebar } from "../watchlist/WatchlistSidebar";
import { OrdersTab } from "../orders/OrdersTab";
import { HoldingsTab } from "../holdings/HoldingsTab";
import { PositionsTab } from "../positions/PositionsTab";

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
    mainTab,
  } = useTradingStore();

  return (
    <div className="h-screen overflow-hidden bg-white text-[#222]">
      <TopHeader />
      <div className="flex h-[calc(100vh-48px)]">
        {mainTab === "chart" ? (
          <>
            <WatchlistSidebar />
            <ChartWorkspace />
          </>
        ) : mainTab === "orders" ? (
          <div className="w-full">
            <OrdersTab />
          </div>
        ) : mainTab === "holdings" ? (
          <div className="w-full">
            <HoldingsTab />
          </div>
        ) : mainTab === "positions" ? (
          <div className="w-full">
            <PositionsTab />
          </div>
        ) : null}
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
