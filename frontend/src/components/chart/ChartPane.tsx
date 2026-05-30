import { Ghost, RefreshCw, RotateCcw, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Candle, Instrument, Quote, Timeframe } from "../../types";
import { CandleChart, type CandleChartHandle } from "./CandleChart";
import { EmptyState } from "../common/EmptyState";
import { formatExpiry, parseChartDate } from "../../utils/dates";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { Loader } from "../common/Loader";
import { IconButton } from "../common/IconButton";
import { useTradingStore } from "../../store/useTradingStore";

type DateRangeLabel = "1D" | "5D" | "1M" | "3M" | "6M" | "1Y" | "5Y";

const DATE_RANGE_PRESETS: Array<{ label: DateRangeLabel; timeframe: Timeframe }> = [
  { label: "1D", timeframe: "1m" },
  { label: "5D", timeframe: "5m" },
  { label: "1M", timeframe: "30m" },
  { label: "3M", timeframe: "1d" },
  { label: "6M", timeframe: "1d" },
  { label: "1Y", timeframe: "1w" },
  { label: "5Y", timeframe: "1w" },
];

interface ChartPaneProps {
  instrument: Instrument | null;
  quote?: Quote;
  candles: Candle[];
  timeframe: Timeframe;
  layoutKey?: string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRefresh?: () => void;
  onClear?: () => void;
  sameAsPrimary?: boolean;
  onTimeframeChange?: (timeframe: Timeframe) => void;
}

export function ChartPane({
  instrument,
  quote,
  candles,
  timeframe,
  layoutKey,
  loading,
  emptyTitle = "No instrument selected",
  emptyDescription = "Pick an instrument from the watchlist, option chain, or search results to open its chart.",
  onRefresh,
  onClear,
  sameAsPrimary = false,
  onTimeframeChange,
}: ChartPaneProps) {
  const chartRef = useRef<CandleChartHandle>(null);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const [activeDateRange, setActiveDateRange] = useState<DateRangeLabel>("1D");
  const openOrderTicket = useTradingStore((state) => state.openOrderTicket);

  const handleCandleClick = (candle: Candle) => {
    if (!instrument) return;
    const tickSize = instrument.tick_size || 0.05;
    const rawPrice = candle.high + 2;
    const roundedPrice = Number((Math.round(rawPrice / tickSize) * tickSize).toFixed(2));
    openOrderTicket(instrument, "BUY", {
      orderType: "LIMIT",
      price: roundedPrice,
    });
  };

  const handleDateRangeClick = (label: DateRangeLabel, tf: Timeframe) => {
    setActiveDateRange(label);
    onTimeframeChange?.(tf);
  };

  if (!instrument) {
    return (
      <div className="flex h-full items-center justify-center border-l border-[#eef1f4]">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={<Ghost className="h-8 w-8 text-[#c1c7d0]" />}
        />
      </div>
    );
  }

  const latestCandle = candles[candles.length - 1];
  const displayCandle = hoveredCandle ?? latestCandle;
  const displayTime = useMemo(() => {
    if (!hoveredCandle?.time) return null;
    try {
      const parsed = parseChartDate(hoveredCandle.time);
      if (!parsed) return null;
      return parsed.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  }, [hoveredCandle]);

  return (
    <div className="flex h-full min-w-0 flex-col border-l border-[#eef1f4] bg-white first:border-l-0">
      {/* OHLC header */}
      <div className="border-b border-[#eef1f4] px-4 py-2.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-medium text-[#222]">{instrument.tradingsymbol}</div>
            <div className="mt-0.5 truncate text-[11px] text-[#6b7280]">
              {instrument.name} · {instrument.segment}
              {instrument.expiry ? ` · ${formatExpiry(instrument.expiry)}` : ""}
              {instrument.strike ? ` · ${instrument.strike}` : ""}
              {instrument.instrument_type ? ` · ${instrument.instrument_type}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton title="Reset chart zoom" onClick={() => chartRef.current?.resetView()}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            {onClear && (
              <IconButton title="Clear comparison" onClick={onClear}>
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b7280]">
          <div className="font-medium text-[#444]">
            O <span className="text-[#222]">{formatPrice(displayCandle?.open ?? quote?.open)}</span>
          </div>
          <div className="font-medium text-[#444]">
            H <span className="text-[#222]">{formatPrice(displayCandle?.high ?? quote?.high)}</span>
          </div>
          <div className="font-medium text-[#444]">
            L <span className="text-[#222]">{formatPrice(displayCandle?.low ?? quote?.low)}</span>
          </div>
          <div className="font-medium text-[#444]">
            C <span className="text-[#222]">{formatPrice(displayCandle?.close ?? quote?.last_price)}</span>
          </div>
          {displayTime && <div className="text-[#8a94a4]">{displayTime}</div>}
          <div className={movementClass(quote?.change)}>
            {formatChange(quote?.change)} ({formatPercent(quote?.changePercent)})
          </div>
          {sameAsPrimary && <div className="text-[#0f9d58]">Same as primary</div>}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader label="Loading chart..." />
          </div>
        ) : candles.length ? (
          <CandleChart
            key={`${instrument.instrument_token}:${timeframe}:${layoutKey ?? "default"}`}
            ref={chartRef}
            candles={candles}
            lineColor="#ff5722"
            viewKey={`${instrument.instrument_token}:${timeframe}:${layoutKey ?? "default"}`}
            onHoverCandle={setHoveredCandle}
            onClickCandle={handleCandleClick}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title="No data here"
              description="Historical candles were not available for this symbol."
              icon={<Ghost className="h-8 w-8 text-[#c1c7d0]" />}
            />
          </div>
        )}
      </div>

      {/* Bottom date-range preset bar */}
      <div className="flex items-center justify-between border-t border-[#eef1f4] px-3 py-1.5">
        <div className="flex items-center gap-0.5">
          {DATE_RANGE_PRESETS.map(({ label, timeframe: tf }) => (
            <button
              key={label}
              onClick={() => handleDateRangeClick(label, tf)}
              className={`rounded-[2px] px-2.5 py-1 text-[11px] transition ${
                activeDateRange === label
                  ? "bg-[#fff3ef] font-medium text-[#ff5722]"
                  : "text-[#6b7280] hover:bg-[#f7f8fa]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {onRefresh && (
          <button
            title="Refresh chart"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-[#9aa3af] transition hover:bg-[#f7f8fa] hover:text-[#6b7280]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
