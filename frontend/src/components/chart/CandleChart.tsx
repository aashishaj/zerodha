import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { ColorType, CrosshairMode, createChart } from "lightweight-charts";
import type { Candle } from "../../types";
import { parseChartDate } from "../../utils/dates";

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
}

interface CandleChartProps {
  candles: Candle[];
  lineColor?: string;
  viewKey?: string;
  onHoverCandle?: (candle: Candle | null) => void;
  onClickCandle?: (candle: Candle) => void;
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
  { candles, lineColor = "#1976d2", viewKey, onHoverCandle, onClickCandle },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addCandlestickSeries"]> | null>(null);
  const volumeSeriesRef = useRef<ReturnType<ReturnType<typeof createChart>["addHistogramSeries"]> | null>(null);
  const cleanedCandlesRef = useRef<Candle[]>([]);
  const hoverCallbackRef = useRef(onHoverCandle);
  const clickCallbackRef = useRef(onClickCandle);
  const lastFitViewKeyRef = useRef<string | undefined>(undefined);

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
      timeScale: {
        borderColor: "#eef1f4",
        rightOffset: 2,
        barSpacing: 10,
        minBarSpacing: 4,
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

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0.03,
      },
    });
    volumeSeriesRef.current = volumeSeries;

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
        clickCallback(matched);
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      chartRef.current = null;
      lastFitViewKeyRef.current = undefined;
      chart.remove();
    };
  }, [lineColor, normalized.chartData.length]);

  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current || !chartRef.current) return;

    seriesRef.current.setData(normalized.chartData);
    volumeSeriesRef.current.setData(normalized.volumeData);
    applyPriceScale();

    if (viewKey !== lastFitViewKeyRef.current) {
      const dataLength = normalized.chartData.length;
      if (dataLength > 0) {
        chartRef.current.timeScale().setVisibleLogicalRange({
          from: Math.max(0, dataLength - 80),
          to: dataLength + 2,
        });
      }
      lastFitViewKeyRef.current = viewKey;
    }
  }, [normalized.chartData, viewKey]);

  return <div ref={containerRef} className="h-full w-full" />;
}));
