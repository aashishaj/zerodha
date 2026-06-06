import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { ColorType, CrosshairMode, TickMarkType, createChart } from "lightweight-charts";
import type { Candle, IndicatorSettings } from "../../types";
import { parseChartDate } from "../../utils/dates";

// IST = UTC+5:30 = 19800 seconds ahead of UTC
const IST_OFFSET_S = 19800;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;

function istDate(utcSeconds: number): Date {
  return new Date((utcSeconds + IST_OFFSET_S) * 1000);
}
function fmtTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}
function fmtDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
function fmtTimeSeconds(d: Date): string {
  return `${fmtTime(d)}:${String(d.getUTCSeconds()).padStart(2,"0")}`;
}

type ChartCandle = {
  time: never;
  open: number;
  high: number;
  low: number;
  close: number;
};

type ChartVolume = {
  time: never;
  value: number;
  color: string;
};

export interface CandleChartHandle {
  resetView: () => void;
  applyTick: (price: number) => void;
}

interface CandleChartProps {
  candles: Candle[];
  lineColor?: string;
  viewKey?: string;
  indicators?: IndicatorSettings;
  onHoverCandle?: (candle: Candle | null) => void;
  onClickCandle?: (candle: Candle, point: { x: number; y: number }) => void;
}

type LinePoint = { time: never; value: number };

function computeVWAP(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let cumTP = 0;
  let cumVol = 0;
  let lastDay = "";

  for (const c of candles) {
    const ts = toChartTimestamp(c.time);
    if (ts === null) continue;
    const vol = Number(c.volume ?? 0);
    if (vol <= 0) continue;

    const day = new Date(ts * 1000).toISOString().slice(0, 10);
    if (day !== lastDay) { cumTP = 0; cumVol = 0; lastDay = day; }

    const tp = (Number(c.high) + Number(c.low) + Number(c.close)) / 3;
    cumTP += tp * vol;
    cumVol += vol;
    out.push({ time: ts as never, value: cumTP / cumVol });
  }
  return out;
}

function computeSMMA(candles: Candle[], period: number): LinePoint[] {
  if (period < 2) return [];
  const out: LinePoint[] = [];
  let smma: number | null = null;
  let sum = 0;
  let count = 0;

  for (const c of candles) {
    const ts = toChartTimestamp(c.time);
    if (ts === null) continue;
    const close = Number(c.close);

    if (smma === null) {
      sum += close;
      count++;
      if (count === period) {
        smma = sum / period;
        out.push({ time: ts as never, value: smma });
      }
    } else {
      smma = (smma * (period - 1) + close) / period;
      out.push({ time: ts as never, value: smma });
    }
  }
  return out;
}

function toChartTimestamp(value: string | null | undefined) {
  const parsed = parseChartDate(value);
  return parsed ? Math.floor(parsed.getTime() / 1000) : null;
}

function normalizeCandles(rawCandles: Candle[]): {
  cleaned: Candle[];
  chartData: ChartCandle[];
  volumeData: ChartVolume[];
} {
  const cleaned = rawCandles
    .map((candle) => {
      const time = toChartTimestamp(candle.time);
      const open = Number(candle.open);
      const high = Number(candle.high);
      const low = Number(candle.low);
      const close = Number(candle.close);
      const volume = Number(candle.volume ?? 0);

      if (
        !Number.isFinite(time) ||
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close) ||
        high < Math.max(open, close, low) ||
        low > Math.min(open, close, high)
      ) {
        return null;
      }

      return {
        raw: candle,
        point: {
          time: time as never,
          open,
          high,
          low,
          close,
        },
        volumePoint: {
          time: time as never,
          value: Number.isFinite(volume) && volume > 0 ? volume : 0,
          color: close >= open ? "rgba(26, 155, 95, 0.36)" : "rgba(222, 75, 75, 0.36)",
        },
      };
    })
    .filter((item): item is { raw: Candle; point: ChartCandle; volumePoint: ChartVolume } => item !== null)
    .sort((left, right) => Number(left.point.time) - Number(right.point.time));

  const unique = Array.from(new Map(cleaned.map((item) => [item.point.time, item])).values());

  return {
    cleaned: unique.map((item) => item.raw),
    chartData: unique.map((item) => item.point),
    volumeData: unique.map((item) => item.volumePoint),
  };
}

export const CandleChart = memo(forwardRef<CandleChartHandle, CandleChartProps>(function CandleChart(
  { candles, lineColor = "#1976d2", viewKey, indicators, onHoverCandle, onClickCandle },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addCandlestickSeries"]> | null>(null);
  const vwapSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addLineSeries"]> | null>(null);
  const smmaSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addLineSeries"]> | null>(null);
  const cleanedCandlesRef = useRef<Candle[]>([]);
  const hoverCallbackRef = useRef(onHoverCandle);
  const clickCallbackRef = useRef(onClickCandle);
  const lastFitViewKeyRef = useRef<string | undefined>(undefined);
  // Tracks how many bars were loaded at last render so we can diff
  const prevDataLengthRef = useRef(0);
  // Accumulates live H/L/C between historical polls for the forming bar
  const liveBarRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const normalized = useMemo(() => normalizeCandles(candles), [candles]);

  useEffect(() => {
    cleanedCandlesRef.current = normalized.cleaned;
    hoverCallbackRef.current = onHoverCandle;
    clickCallbackRef.current = onClickCandle;
  }, [normalized.cleaned, onHoverCandle, onClickCandle]);

  const applyPriceScale = () => {
    chartRef.current?.priceScale("right").applyOptions({
      autoScale: true,
      scaleMargins: {
        top: 0.08,
        bottom: 0.22,
      },
    });
  };

  useImperativeHandle(forwardedRef, () => ({
    resetView() {
      applyPriceScale();
      if (chartRef.current && normalized.chartData.length) {
        chartRef.current.timeScale().fitContent();
      }
    },
    applyTick(price: number) {
      if (!seriesRef.current || cleanedCandlesRef.current.length === 0) return;
      const lastCandle = cleanedCandlesRef.current[cleanedCandlesRef.current.length - 1];
      const ts = toChartTimestamp(lastCandle.time);
      if (ts === null) return;

      if (!liveBarRef.current || liveBarRef.current.time !== ts) {
        // New candle boundary or first tick — seed from historical data
        liveBarRef.current = {
          time: ts,
          open: Number(lastCandle.open),
          high: Number(lastCandle.high),
          low: Number(lastCandle.low),
          close: price,
        };
      } else {
        // Same forming bar — accumulate H/L, update close
        liveBarRef.current = {
          time: ts,
          open: liveBarRef.current.open,
          high: Math.max(liveBarRef.current.high, price),
          low: Math.min(liveBarRef.current.low, price),
          close: price,
        };
      }
      const bar = liveBarRef.current;
      seriesRef.current.update({
        time: bar.time as never,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    },
  }));

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#7b8594",
      },
      grid: {
        vertLines: { color: "#f3f5f8" },
        horzLines: { color: "#f3f5f8" },
      },
      rightPriceScale: {
        borderColor: "#eef1f4",
        autoScale: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.22,
        },
      },
      // Display all times in IST (UTC+5:30) regardless of the browser's local timezone
      localization: {
        timeFormatter: (ts: number) => {
          const d = istDate(ts);
          return `${fmtDay(d)} ${fmtTime(d)}`;
        },
      },
      timeScale: {
        borderColor: "#eef1f4",
        rightOffset: 2,
        barSpacing: 10,
        minBarSpacing: 4,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (ts: number, tickMarkType: TickMarkType) => {
          const d = istDate(ts);
          switch (tickMarkType) {
            case TickMarkType.Year:        return String(d.getUTCFullYear());
            case TickMarkType.Month:       return MONTHS[d.getUTCMonth()];
            case TickMarkType.DayOfMonth:  return fmtDay(d);
            case TickMarkType.TimeWithSeconds: return fmtTimeSeconds(d);
            default:                       return fmtTime(d);
          }
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
    });
    chartRef.current = chart;

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#1a9b5f",
      downColor: "#de4b4b",
      borderVisible: false,
      wickUpColor: "#1a9b5f",
      wickDownColor: "#de4b4b",
      priceLineVisible: true,
      priceLineColor: "#d7dde7",
      lastValueVisible: true,
    });
    seriesRef.current = candleSeries;

    const handleCrosshairMove = (param: any) => {
      const hoverCallback = hoverCallbackRef.current;
      if (!hoverCallback) return;

      if (!param?.point || !param?.time) {
        hoverCallback(null);
        return;
      }

      const hovered = param.seriesData?.get?.(candleSeries);
      if (!hovered) {
        hoverCallback(null);
        return;
      }

      const hoveredTime = Number(param.time);
      const matched =
        cleanedCandlesRef.current.find((candle) => toChartTimestamp(candle.time) === hoveredTime) ??
        null;

      hoverCallback(
        matched ??
          ({
            time: new Date(hoveredTime * 1000).toISOString(),
            open: Number(hovered.open ?? 0),
            high: Number(hovered.high ?? 0),
            low: Number(hovered.low ?? 0),
            close: Number(hovered.close ?? 0),
          } satisfies Candle),
      );
    };

    const handleClick = (param: any) => {
      const clickCallback = clickCallbackRef.current;
      if (!clickCallback || !param?.time) return;

      const clickedTime = Number(param.time);
      const matched =
        cleanedCandlesRef.current.find((candle) => toChartTimestamp(candle.time) === clickedTime) ??
        null;

      if (matched) {
        const pt = {
          x: param.sourceEvent?.clientX ?? 0,
          y: param.sourceEvent?.clientY ?? 0,
        };
        clickCallback(matched, pt);
      }
    };

    const vwapSeries = chart.addLineSeries({
      color: "#e67e22",
      lineWidth: 1,
      priceLineVisible: true,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: "VWAP",
    });
    vwapSeriesRef.current = vwapSeries;

    const smmaSeries = chart.addLineSeries({
      color: "#8e44ad",
      lineWidth: 1,
      priceLineVisible: true,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      title: "SMMA",
    });
    smmaSeriesRef.current = smmaSeries;

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      seriesRef.current = null;
      vwapSeriesRef.current = null;
      smmaSeriesRef.current = null;
      chartRef.current = null;
      lastFitViewKeyRef.current = undefined;
      prevDataLengthRef.current = 0;
      liveBarRef.current = null;
      chart.remove();
    };
  }, [lineColor, normalized.chartData.length]);

  useEffect(() => {
    if (!vwapSeriesRef.current || !smmaSeriesRef.current) return;
    vwapSeriesRef.current.setData(indicators?.vwap ? computeVWAP(normalized.cleaned) : []);
    smmaSeriesRef.current.setData(
      indicators?.smma.enabled ? computeSMMA(normalized.cleaned, indicators.smma.period) : [],
    );
  }, [normalized, indicators]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const isNewView = viewKey !== lastFitViewKeyRef.current;
    const prev = prevDataLengthRef.current;
    const curr = normalized.chartData.length;

    if (isNewView || prev === 0 || curr < prev) {
      // Full reload: new instrument/timeframe, first load, or data shrunk (e.g. after reset)
      seriesRef.current.setData(normalized.chartData);
    } else {
      // Incremental: use series.update() for the forming bar + any new bars.
      // Starting from prev-1 catches an in-progress candle whose OHLC changed since last tick.
      for (let i = Math.max(0, prev - 1); i < curr; i++) {
        seriesRef.current.update(normalized.chartData[i]);
      }
    }

    prevDataLengthRef.current = curr;
    liveBarRef.current = null; // re-sync from fresh historical data on next tick
    applyPriceScale();

    if (isNewView && curr > 0) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, curr - 80),
        to: curr + 2,
      });
      lastFitViewKeyRef.current = viewKey;
    }
  }, [normalized.chartData, viewKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}));
