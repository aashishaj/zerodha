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
    selectedLayout,
    activePaneId,
    setLayout,
    setActivePaneId,
  } = useTradingStore();

  const selectedCandles = useMemo(
    () => (selectedInstrument ? candles[`${selectedInstrument.instrument_token}:${timeframe}`] ?? [] : []),
    [candles, selectedInstrument, timeframe],
  );

  const compareCandles = useMemo(
    () => (compareInstrument ? candles[`${compareInstrument.instrument_token}:${timeframe}`] ?? [] : []),
    [candles, compareInstrument, timeframe],
  );

  // Quotes: lightweight, refresh every 5s
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try { await refreshQuotes(); }
      catch (error) { if (!cancelled) console.error("Quote refresh failed:", error); }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [refreshQuotes]);

  // Chart candles: incremental fetch every 10s so live candles stay current
  useEffect(() => {
    if (mainTab !== "chart") return;
    let cancelled = false;
    const refresh = async () => {
      try { await refreshVisibleCharts(); }
      catch (error) { if (!cancelled) console.error("Chart refresh failed:", error); }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 10_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [mainTab, refreshVisibleCharts, timeframe, selectedInstrument]);

  // Option chain: heavier, keep at 60s
  useEffect(() => {
    if (mainTab !== "chart") return;
    let cancelled = false;
    const refresh = async () => {
      try { await refreshOptionChain(); }
      catch (error) { if (!cancelled) console.error("Option chain refresh failed:", error); }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [mainTab, refreshOptionChain, selectedInstrument]);

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
          /* absolute inset-0: size is fixed by CSS, never recalculated by flex/grid */
          <div
            className={`absolute inset-0 overflow-hidden ${
              selectedLayout === "twoVertical"
                ? "grid grid-cols-2"
                : selectedLayout === "twoHorizontal"
                  ? "grid grid-cols-1 grid-rows-2"
                  : "flex"
            }`}
          >
            <ChartPane
              instrument={selectedInstrument}
              quote={selectedInstrument ? quotes[selectedInstrument.tradingsymbol] : undefined}
              candles={selectedCandles}
              timeframe={timeframe}
              loading={loadingChart}
              onRefresh={selectedInstrument ? () => void refreshInstrument(selectedInstrument) : undefined}
              onTimeframeChange={(value) => void setTimeframe(value)}
              isActive={activePaneId === "primary"}
              onActivate={() => setActivePaneId("primary")}
              showClose={selectedLayout !== "single"}
              onClose={() => setLayout("single")}
            />
            {selectedLayout !== "single" && (
              <ChartPane
                instrument={compareInstrument}
                quote={compareInstrument ? quotes[compareInstrument.tradingsymbol] : undefined}
                candles={compareCandles}
                timeframe={timeframe}
                layoutKey="compare"
                emptyTitle="No data here"
                emptyDescription="Use the + button in the toolbar to load a second instrument."
                sameAsPrimary={
                  !!compareInstrument &&
                  compareInstrument.instrument_token === selectedInstrument?.instrument_token
                }
                onTimeframeChange={(value) => void setTimeframe(value)}
                isActive={activePaneId === "compare"}
                onActivate={() => setActivePaneId("compare")}
                showClose
                onClose={() => setLayout("single")}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
