import { useEffect, useMemo } from "react";
import { ChartPane } from "./ChartPane";
import { ChartToolbar } from "./ChartToolbar";
import { useTradingStore } from "../../store/useTradingStore";
import { OptionChain } from "../optionChain/OptionChain";
import { EmptyState } from "../common/EmptyState";
import { MainTabs } from "./MainTabs";

export function ChartWorkspace() {
  const {
    selectedInstrument,
    timeframe,
    mainTab,
    setMainTab,
    setTimeframe,
    refreshInstrument,
    candles,
    quotes,
    loadingChart,
    refreshQuotes,
    refreshVisibleCharts,
    refreshOptionChain,
    selectedUnderlying,
    setOptionChainFilters,
  } = useTradingStore();

  const selectedCandles = useMemo(
    () => (selectedInstrument ? candles[`${selectedInstrument.instrument_token}:${timeframe}`] ?? [] : []),
    [candles, selectedInstrument, timeframe],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        await refreshQuotes();
        if (mainTab === "chart") {
          await Promise.all([refreshVisibleCharts(), refreshOptionChain()]);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Live chart refresh failed:", error);
        }
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mainTab, refreshQuotes, refreshVisibleCharts, refreshOptionChain, timeframe, selectedInstrument]);

  useEffect(() => {
    if (!selectedInstrument) return;
    if (selectedInstrument.name === "NIFTY" || selectedInstrument.name === "BANKNIFTY") {
      if (selectedInstrument.name !== selectedUnderlying) {
        void setOptionChainFilters(selectedInstrument.name, "");
      }
    }
  }, [selectedInstrument, selectedUnderlying, setOptionChainFilters]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-white">
      <MainTabs activeTab={mainTab} onTabChange={setMainTab} />
      <ChartToolbar timeframe={timeframe} onTimeframeChange={(value) => void setTimeframe(value)} />
      <div className="flex-1 overflow-hidden bg-white">
        {mainTab === "option-chain" ? (
          <div className="h-full min-h-0 bg-white">
            <OptionChain />
          </div>
        ) : mainTab === "fundamentals" ? (
          <div className="p-5">
            <EmptyState
              title="Fundamentals panel"
              description="Plug backend analytics or instrument metadata here. This area is intentionally kept flat so it can fit the rest of the Kite-style workspace."
            />
          </div>
        ) : (
          <div className="h-full">
            <ChartPane
              instrument={selectedInstrument}
              quote={selectedInstrument ? quotes[selectedInstrument.tradingsymbol] : undefined}
              candles={selectedCandles}
              timeframe={timeframe}
              loading={loadingChart}
              onRefresh={selectedInstrument ? () => void refreshInstrument(selectedInstrument) : undefined}
              onTimeframeChange={(value) => void setTimeframe(value)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
