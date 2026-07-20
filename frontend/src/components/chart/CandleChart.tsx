import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { ColorType, CrosshairMode, LineStyle, TickMarkType, createChart, type LineWidth } from "lightweight-charts";
import type { Candle, IndicatorInstance, IndicatorLineStyle, VwapAnchorPeriod } from "../../types";
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
  zoomIn: () => void;
  zoomOut: () => void;
  applyTick: (price: number) => void;
}

interface CandleChartProps {
  candles: Candle[];
  lineColor?: string;
  viewKey?: string;
  indicatorInstances?: IndicatorInstance[];
  onHoverCandle?: (candle: Candle | null) => void;
  onClickCandle?: (candle: Candle, point: { x: number; y: number }) => void;
  onIndicatorValues?: (values: Record<string, number | null>) => void;
}

type LinePoint = { time: never; value: number };

type IndicatorSource = NonNullable<IndicatorInstance["source"]>;

// Resolve the price input for an indicator from a candle (close, hlc3, ohlc4, ...)
function sourceValue(candle: Candle, source: IndicatorSource): number {
  const o = Number(candle.open);
  const h = Number(candle.high);
  const l = Number(candle.low);
  const c = Number(candle.close);
  switch (source) {
    case "open": return o;
    case "high": return h;
    case "low": return l;
    case "hl2": return (h + l) / 2;
    case "hlc3": return (h + l + c) / 3;
    case "ohlc4": return (o + h + l + c) / 4;
    case "close":
    default: return c;
  }
}

// Map a UI line style to the lightweight-charts LineStyle enum
function toLineStyle(style: IndicatorLineStyle | undefined): LineStyle {
  switch (style) {
    case "dashed": return LineStyle.Dashed;
    case "dotted": return LineStyle.Dotted;
    case "solid":
    default: return LineStyle.Solid;
  }
}

// Bucket key used to reset the VWAP cumulative sums at the anchor boundary
function anchorKey(d: Date, anchor: VwapAnchorPeriod): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (anchor) {
    case "Week": {
      // ISO-ish week bucket from the UTC (already IST-shifted) timestamp
      const onejan = Date.UTC(y, 0, 1);
      const week = Math.floor((d.getTime() - onejan) / (7 * 86400000));
      return `${y}-W${week}`;
    }
    case "Month": return `${y}-${m}`;
    case "Quarter": return `${y}-Q${Math.floor(m / 3)}`;
    case "Year": return `${y}`;
    case "Session":
    default: return `${y}-${m}-${d.getUTCDate()}`;
  }
}

function computeVWAP(
  candles: Candle[],
  source: IndicatorSource = "hlc3",
  anchor: VwapAnchorPeriod = "Session",
): LinePoint[] {
  const out: LinePoint[] = [];
  let cumTP = 0;
  let cumVol = 0;
  let lastBucket = "";

  for (const c of candles) {
    const ts = toChartTimestamp(c.time);
    if (ts === null) continue;
    const vol = Number(c.volume ?? 0);
    if (vol <= 0) continue;

    const bucket = anchorKey(istDate(ts), anchor);
    if (bucket !== lastBucket) { cumTP = 0; cumVol = 0; lastBucket = bucket; }

    const tp = sourceValue(c, source);
    cumTP += tp * vol;
    cumVol += vol;
    out.push({ time: ts as never, value: cumTP / cumVol });
  }
  return out;
}

function computeSMMA(candles: Candle[], period: number, source: IndicatorSource = "close"): LinePoint[] {
  if (period < 2) return [];
  const out: LinePoint[] = [];
  let smma: number | null = null;
  let sum = 0;
  let count = 0;

  for (const c of candles) {
    const ts = toChartTimestamp(c.time);
    if (ts === null) continue;
    const price = sourceValue(c, source);

    if (smma === null) {
      sum += price;
      count++;
      if (count === period) {
        smma = sum / period;
        out.push({ time: ts as never, value: smma });
      }
    } else {
      smma = (smma * (period - 1) + price) / period;
      out.push({ time: ts as never, value: smma });
    }
  }
  return out;
}

// Compute the line data for a single indicator instance
function computeIndicatorData(instance: IndicatorInstance, candles: Candle[]): LinePoint[] {
  if (instance.type === "VWAP") {
    return computeVWAP(candles, instance.source ?? "hlc3", instance.anchorPeriod ?? "Session");
  }
  return computeSMMA(candles, instance.length ?? 7, instance.source ?? "close");
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
  { candles, lineColor = "#1976d2", viewKey, indicatorInstances, onHoverCandle, onClickCandle, onIndicatorValues },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addCandlestickSeries"]> | null>(null);
  // One line series per indicator instance id — never stored in React state (avoids re-renders)
  const indicatorSeriesRef = useRef<Record<string, ReturnType<ReturnType<typeof createChart>["addLineSeries"]>>>({});
  const cleanedCandlesRef = useRef<Candle[]>([]);
  const hoverCallbackRef = useRef(onHoverCandle);
  const clickCallbackRef = useRef(onClickCandle);
  const indicatorValuesCallbackRef = useRef(onIndicatorValues);
  const lastFitViewKeyRef = useRef<string | undefined>(undefined);
  // Tracks how many bars were loaded at last render so we can diff
  const prevDataLengthRef = useRef(0);
  // Time of the last bar applied to the series; used to detect when merged
  // data changed shape mid-array (series.update only accepts the newest bar)
  const prevLastTimeRef = useRef<number | null>(null);
  // Accumulates live H/L/C between historical polls for the forming bar
  const liveBarRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const normalized = useMemo(() => normalizeCandles(candles), [candles]);

  useEffect(() => {
    cleanedCandlesRef.current = normalized.cleaned;
    hoverCallbackRef.current = onHoverCandle;
    clickCallbackRef.current = onClickCandle;
    indicatorValuesCallbackRef.current = onIndicatorValues;
  }, [normalized.cleaned, onHoverCandle, onClickCandle, onIndicatorValues]);

  const applyPriceScale = () => {
    chartRef.current?.priceScale("right").applyOptions({
      autoScale: true,
      scaleMargins: {
        top: 0.08,
        bottom: 0.22,
      },
    });
  };

  // Zoom by scaling the visible bar span around its center. factor < 1 zooms
  // in (fewer bars), factor > 1 zooms out (more bars).
  const zoomByFactor = (factor: number) => {
    const timeScale = chartRef.current?.timeScale();
    const range = timeScale?.getVisibleLogicalRange();
    if (!timeScale || !range) return;
    const center = (range.from + range.to) / 2;
    const half = Math.max(2.5, ((range.to - range.from) / 2) * factor);
    timeScale.setVisibleLogicalRange({ from: center - half, to: center + half });
  };

  useImperativeHandle(forwardedRef, () => ({
    resetView() {
      applyPriceScale();
      const curr = normalized.chartData.length;
      if (chartRef.current && curr > 0) {
        // Back to the original loaded zoom (most recent ~80 bars).
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, curr - 80),
          to: curr + 2,
        });
      }
    },
    zoomIn() {
      zoomByFactor(0.7);
    },
    zoomOut() {
      zoomByFactor(1.4);
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

    // Remove the TradingView attribution logo injected by lightweight-charts
    containerRef.current.querySelectorAll("a").forEach((a) => {
      if (a.href.includes("tradingview")) a.remove();
    });

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

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      seriesRef.current = null;
      // Series belong to the chart being removed — drop refs, don't call removeSeries
      indicatorSeriesRef.current = {};
      chartRef.current = null;
      lastFitViewKeyRef.current = undefined;
      prevDataLengthRef.current = 0;
      prevLastTimeRef.current = null;
      liveBarRef.current = null;
      chart.remove();
    };
    // Note: data changes must NOT recreate the chart — the data-sync effect
    // below handles them incrementally while preserving the user's pan/zoom.
  }, [lineColor]);

  // Sync indicator line series with the instance list.
  // - create series for new instances, remove series for deleted ones
  // - apply color / lineWidth / visibility via applyOptions (no chart recreation)
  // - recompute + setData, then report latest values up for the legend
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const refs = indicatorSeriesRef.current;
    const values: Record<string, number | null> = {};
    const present = new Set<string>();

    // Preserve the user's pan/zoom: the setData() calls below would otherwise
    // reset the time scale to its default position on every poll.
    const savedRange = chart.timeScale().getVisibleLogicalRange();

    for (const instance of indicatorInstances ?? []) {
      present.add(instance.id);
      const width = (instance.lineWidth ?? 2) as LineWidth;
      const lineStyle = toLineStyle(instance.lineStyle);
      const priceLineVisible = instance.showPriceLine ?? true;
      const lastValueVisible = instance.showLastValue ?? true;
      let series = refs[instance.id];
      if (!series) {
        series = chart.addLineSeries({
          color: instance.color,
          lineWidth: width,
          lineStyle,
          priceLineVisible,
          lastValueVisible,
          crosshairMarkerVisible: false,
          title: "",
          visible: instance.enabled,
        });
        refs[instance.id] = series;
      } else {
        series.applyOptions({
          color: instance.color,
          lineWidth: width,
          lineStyle,
          priceLineVisible,
          lastValueVisible,
          visible: instance.enabled,
        });
      }
      const data = computeIndicatorData(instance, normalized.cleaned);
      series.setData(data);
      values[instance.id] = data.length ? data[data.length - 1].value : null;
    }

    // Remove series whose instance was deleted
    for (const id of Object.keys(refs)) {
      if (!present.has(id)) {
        try {
          chart.removeSeries(refs[id]);
        } catch {
          // already removed — ignore
        }
        delete refs[id];
      }
    }

    if (savedRange) {
      chart.timeScale().setVisibleLogicalRange(savedRange);
    }

    indicatorValuesCallbackRef.current?.(values);
  }, [normalized, indicatorInstances]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const timeScale = chartRef.current.timeScale();
    // Capture before setData(), which would otherwise reset the time scale.
    const savedRange = timeScale.getVisibleLogicalRange();
    const isNewView = viewKey !== lastFitViewKeyRef.current;
    const prev = prevDataLengthRef.current;
    const curr = normalized.chartData.length;

    // series.update() only accepts the current last bar or newer ones. If the
    // merged data changed shape mid-array (backfill, re-sort, corrected rows),
    // the bar at prev-1 is older than what the series already holds and
    // update() would throw "Cannot update oldest data" — resync fully instead.
    const start = Math.max(0, prev - 1);
    const startTime = curr > 0 ? (normalized.chartData[Math.min(start, curr - 1)].time as unknown as number) : null;
    const appendOnly =
      prevLastTimeRef.current === null || (startTime !== null && startTime >= prevLastTimeRef.current);

    let didFullReload = false;
    if (isNewView || prev === 0 || curr < prev || !appendOnly) {
      // Full reload: new instrument/timeframe, first load, shrunk or reshaped data
      seriesRef.current.setData(normalized.chartData);
      didFullReload = true;
    } else {
      // Incremental: use series.update() for the forming bar + any new bars.
      // Starting from prev-1 catches an in-progress candle whose OHLC changed since last tick.
      try {
        for (let i = start; i < curr; i++) {
          seriesRef.current.update(normalized.chartData[i]);
        }
      } catch {
        // Safety net for any remaining ordering surprise — never crash the pane.
        seriesRef.current.setData(normalized.chartData);
        didFullReload = true;
      }
    }

    prevDataLengthRef.current = curr;
    prevLastTimeRef.current =
      curr > 0 ? (normalized.chartData[curr - 1].time as unknown as number) : null;
    liveBarRef.current = null; // re-sync from fresh historical data on next tick
    applyPriceScale();

    if (isNewView && curr > 0) {
      timeScale.setVisibleLogicalRange({
        from: Math.max(0, curr - 80),
        to: curr + 2,
      });
      lastFitViewKeyRef.current = viewKey;
    } else if (didFullReload && savedRange) {
      // Non-view-changing full reload: keep the user where they were panned/zoomed.
      timeScale.setVisibleLogicalRange(savedRange);
    }
  }, [normalized.chartData, viewKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}));
