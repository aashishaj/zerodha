import { Ghost, RefreshCw, RotateCcw, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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
  isActive?: boolean;
  showClose?: boolean;
  onClose?: () => void;
  onActivate?: () => void;
}

export const ChartPane = memo(function ChartPane({
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
  isActive = false,
  showClose = false,
  onClose,
  onActivate,
}: ChartPaneProps) {
  const chartRef = useRef<CandleChartHandle>(null);
  const [activeDateRange, setActiveDateRange] = useState<DateRangeLabel>("1D");
  const openOrderTicket    = useTradingStore((state) => state.openOrderTicket);
  const isOrderTicketOpen  = useTradingStore((state) => state.isOrderTicketOpen);
  const indicators         = useTradingStore((state) => state.indicators);
  const slSettings         = useTradingStore((state) => state.slSettings);

  // Stable ref so handlePickSide (useCallback []) always reads current settings
  const slSettingsRef = useRef(slSettings);
  slSettingsRef.current = slSettings;

  // B/S picker shown after candle click
  const [sidePicker, setSidePicker] = useState<{
    candle: Candle;
    x: number;
    y: number;
  } | null>(null);

  // Prevents the chart's `click` event from re-opening the picker on the same
  // mousedown that was used to dismiss it.
  const justDismissedRef = useRef(false);

  // Keep a stable ref to isOrderTicketOpen so handleCandleClick (useCallback [])
  // can read the current value without being recreated.
  const isOrderTicketOpenRef = useRef(isOrderTicketOpen);
  isOrderTicketOpenRef.current = isOrderTicketOpen;

  // Live tick stream — open an SSE connection per instrument for real-time price updates
  useEffect(() => {
    if (!instrument) return;
    const token = instrument.instrument_token;
    const source = new EventSource(`/api/ticks/stream?tokens=${token}`);

    source.onmessage = (event) => {
      try {
        const tick = JSON.parse(event.data as string) as { instrument_token: number; last_price: number };
        if (tick.instrument_token === token && tick.last_price) {
          chartRef.current?.applyTick(tick.last_price);
        }
      } catch {
        // ignore malformed frames
      }
    };

    return () => source.close();
  }, [instrument]);

  // DOM refs for OHLC values — updated directly, zero React re-renders on hover
  const oRef = useRef<HTMLSpanElement>(null);
  const hRef = useRef<HTMLSpanElement>(null);
  const lRef = useRef<HTMLSpanElement>(null);
  const cRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  // Keep latestCandle in a ref so handleHoverCandle never needs to be recreated
  const latestCandleRef = useRef<Candle | undefined>(undefined);
  latestCandleRef.current = candles[candles.length - 1];

  // Stable callback — no dependencies, reads latestCandleRef at call time
  const handleHoverCandle = useCallback((candle: Candle | null) => {
    const src = candle ?? latestCandleRef.current ?? null;
    if (oRef.current) oRef.current.textContent = formatPrice(src?.open);
    if (hRef.current) hRef.current.textContent = formatPrice(src?.high);
    if (lRef.current) lRef.current.textContent = formatPrice(src?.low);
    if (cRef.current) cRef.current.textContent = formatPrice(src?.close);
    if (timeRef.current) {
      if (candle?.time) {
        try {
          const parsed = parseChartDate(candle.time);
          timeRef.current.textContent = parsed
            ? parsed.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
            : "";
          timeRef.current.style.visibility = "visible";
        } catch {
          timeRef.current.style.visibility = "hidden";
        }
      } else {
        timeRef.current.style.visibility = "hidden";
      }
    }
  }, []); // no deps — always stable

  // Stable click handler using ref
  const instrumentRef = useRef(instrument);
  instrumentRef.current = instrument;

  // Candle click → show the B/S side picker bubble at the click position.
  // Guard against two cases:
  //   1. justDismissedRef: the chart's `click` event fires on the same mousedown
  //      that dismissed the picker — without the guard, the picker would instantly
  //      re-appear.
  //   2. isOrderTicketOpenRef: don't open the picker while the order ticket is
  //      already visible.
  const handleCandleClick = useCallback((candle: Candle, point: { x: number; y: number }) => {
    if (justDismissedRef.current || isOrderTicketOpenRef.current) return;
    if (!instrumentRef.current) return;
    setSidePicker({ candle, x: point.x, y: point.y });
  }, []); // all reads go through stable refs — no deps needed

  // Dismiss picker on any click outside the bubble.
  // Sets justDismissedRef for ~200 ms so the chart's subsequent `click` event
  // (same user interaction) cannot immediately re-open the picker.
  useEffect(() => {
    if (!sidePicker) return;
    const dismiss = () => {
      justDismissedRef.current = true;
      setSidePicker(null);
      window.setTimeout(() => { justDismissedRef.current = false; }, 200);
    };
    const timer = window.setTimeout(() => window.addEventListener("mousedown", dismiss), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", dismiss);
    };
  }, [sidePicker]);

  // Called when user picks a side from the bubble.
  // Defaults to SL order type with price/trigger pre-filled from candle H/L
  // using the configurable offsets stored in slSettings.
  const handlePickSide = (side: "BUY" | "SELL") => {
    if (!sidePicker) return;
    const instr = instrumentRef.current;
    if (!instr) return;
    const { candle } = sidePicker;
    const { buyTriggerOffset, buyPriceOffset, sellTriggerOffset, sellPriceOffset } =
      slSettingsRef.current;
    const tickSize = instr.tick_size || 0.05;
    const round = (v: number) =>
      Number((Math.round(v / tickSize) * tickSize).toFixed(2));

    // Snap high up / low down to the nearest integer before adding offsets,
    // so e.g. high=23.51 → base=24, trigger=26, price=26.5
    const baseHigh = Math.ceil(candle.high);
    const baseLow  = Math.floor(candle.low);

    const triggerPrice =
      side === "BUY"
        ? round(baseHigh + buyTriggerOffset)
        : round(baseLow  - sellTriggerOffset);

    const price =
      side === "BUY"
        ? round(baseHigh + buyPriceOffset)
        : round(baseLow  - sellPriceOffset);

    openOrderTicket(instr, side, { orderType: "SL", price, triggerPrice });
    setSidePicker(null);
  };

  const handleDateRangeClick = (label: DateRangeLabel, tf: Timeframe) => {
    setActiveDateRange(label);
    onTimeframeChange?.(tf);
  };

  if (!instrument) {
    return (
      <div
        onMouseDown={onActivate}
        className={`relative flex flex-1 min-w-0 h-full items-center justify-center bg-white overflow-hidden border border-[#eef1f4] ${
          isActive ? "ring-2 ring-inset ring-[#2f7df6]" : ""
        }`}
      >
        {showClose && (
          <button
            title="Close pane"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-[#9aa3af] hover:bg-[#f7f8fa] hover:text-[#444]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          icon={<Ghost className="h-8 w-8 text-[#c1c7d0]" />}
        />
      </div>
    );
  }

  const latestCandle = latestCandleRef.current;

  return (
    <div
      onMouseDown={onActivate}
      className={`flex flex-1 min-w-0 h-full flex-col bg-white overflow-hidden border border-[#eef1f4] ${
        isActive ? "ring-2 ring-inset ring-[#2f7df6]" : ""
      }`}
    >
      {/* OHLC header — flex-none so it never affects chart canvas height */}
      <div className="flex-none border-b border-[#eef1f4] px-4 py-2.5">
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
            {showClose && (
              <IconButton
                title="Close pane"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </div>

        {/* Single-line OHLC row — DOM-updated on hover, no React re-render */}
        <div className="mt-2 flex items-center gap-x-4 text-[11px] text-[#6b7280]">
          <span className="font-medium text-[#444]">O <span ref={oRef}>{formatPrice(latestCandle?.open ?? quote?.open)}</span></span>
          <span className="font-medium text-[#444]">H <span ref={hRef}>{formatPrice(latestCandle?.high ?? quote?.high)}</span></span>
          <span className="font-medium text-[#444]">L <span ref={lRef}>{formatPrice(latestCandle?.low ?? quote?.low)}</span></span>
          <span className="font-medium text-[#444]">C <span ref={cRef}>{formatPrice(latestCandle?.close ?? quote?.last_price)}</span></span>
          {/* Always rendered (visibility hidden) so row height never changes */}
          <span ref={timeRef} className="text-[#8a94a4]" style={{ visibility: "hidden" }} />
          <span className={movementClass(quote?.change)}>
            {formatChange(quote?.change)} ({formatPercent(quote?.changePercent)})
          </span>
          {sameAsPrimary && <span className="text-[#0f9d58]">Same as primary</span>}
        </div>
      </div>

      {/* B/S side picker — fixed to viewport so it's never clipped by overflow:hidden */}
      {sidePicker && (
        <div
          className="fixed z-40"
          style={{ left: sidePicker.x, top: sidePicker.y, transform: "translate(-50%, -130%)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex overflow-hidden rounded-[3px] border border-[#d0d3d8] shadow-lg">
            <button
              onClick={() => handlePickSide("BUY")}
              className="px-4 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#387ed1" }}
            >
              B
            </button>
            <div className="w-px bg-[#d0d3d8]" />
            <button
              onClick={() => handlePickSide("SELL")}
              className="px-4 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#e5793b" }}
            >
              S
            </button>
          </div>
        </div>
      )}

      {/* Chart canvas — fills all remaining space, overflow hidden prevents any bleed */}
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
            indicators={indicators}
            onHoverCandle={handleHoverCandle}
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

      {/* Footer — flex-none so it never affects chart canvas height */}
      <div className="flex-none flex items-center justify-between border-t border-[#eef1f4] px-3 py-1.5">
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
});
