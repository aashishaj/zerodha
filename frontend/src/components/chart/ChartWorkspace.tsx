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
    compareInstrument,
    clearCompareInstrument,
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

  const compareCandles = useMemo(
    () => (compareInstrument ? candles[`${compareInstrument.instrument_token}:${timeframe}`] ?? [] : []),
    [candles, compareInstrument, timeframe],
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
      {mainTab === "chart" && (
        <ChartToolbar timeframe={timeframe} onTimeframeChange={(value) => void setTimeframe(value)} />
      )}
      {/* Outer div is relative so the absolute child is anchored to it */}
      <div className="relative flex-1 overflow-hidden bg-white">
        {mainTab === "option-chain" ? (
          <div className="absolute inset-0 min-h-0 bg-white">
            <OptionChain />
          </div>
        ) : mainTab === "fundamentals" ? (
          <div className="absolute inset-0 overflow-auto p-5">
            <EmptyState
              title="Fundamentals panel"
              description="Plug backend analytics or instrument metadata here."
            />
          </div>
        ) : (
          /* absolute inset-0: size is fixed by CSS, never recalculated by flex */
          <div className="absolute inset-0 flex overflow-hidden">
            <ChartPane
              instrument={selectedInstrument}
              quote={selectedInstrument ? quotes[selectedInstrument.tradingsymbol] : undefined}
              candles={selectedCandles}
              timeframe={timeframe}
              loading={loadingChart}
              onRefresh={selectedInstrument ? () => void refreshInstrument(selectedInstrument) : undefined}
              onTimeframeChange={(value) => void setTimeframe(value)}
            />
            <ChartPane
              instrument={compareInstrument}
              quote={compareInstrument ? quotes[compareInstrument.tradingsymbol] : undefined}
              candles={compareCandles}
              timeframe={timeframe}
              layoutKey="compare"
              emptyTitle="No data here"
              emptyDescription="Use the + button in the toolbar to compare a second instrument."
              onClear={compareInstrument ? clearCompareInstrument : undefined}
              onTimeframeChange={(value) => void setTimeframe(value)}
            />
          </div>
        )}
      </div>
    </section>
  );
}
