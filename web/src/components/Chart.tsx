import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { Candle } from "../lib/api";

/**
 * Candlestick chart with volume, powered by lightweight-charts
 * (TradingView's library). Full data load on symbol change, then
 * in-place updates as the live candle bucket ticks.
 */
export function Chart({ candles, symbol }: { candles: Candle[]; symbol: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const loadedSymbol = useRef<string | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#848e9c",
        fontSize: 11,
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(30,37,48,0.55)" },
        horzLines: { color: "rgba(30,37,48,0.55)" },
      },
      timeScale: { timeVisible: true, secondsVisible: true, borderColor: "#1e2530" },
      rightPriceScale: { borderColor: "#1e2530" },
      crosshair: {
        vertLine: { color: "#3a3f4d", labelBackgroundColor: "#2a2e39" },
        horzLine: { color: "#3a3f4d", labelBackgroundColor: "#2a2e39" },
      },
    });
    const cs = chart.addSeries(CandlestickSeries, {
      upColor: "#0ecb81",
      downColor: "#f6465d",
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
      borderVisible: false,
    });
    const vs = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = cs;
    volRef.current = vs;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      loadedSymbol.current = null;
    };
  }, []);

  useEffect(() => {
    const cs = candleRef.current;
    const vs = volRef.current;
    if (!cs || !vs || candles.length === 0) return;

    const toRow = (c: Candle) => ({
      time: (c.time / 1000) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    });
    const toVol = (c: Candle) => ({
      time: (c.time / 1000) as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "rgba(14,203,129,0.35)" : "rgba(246,70,93,0.35)",
    });

    if (loadedSymbol.current !== symbol) {
      cs.setData(candles.map(toRow));
      vs.setData(candles.map(toVol));
      chartRef.current?.timeScale().scrollToRealTime();
      loadedSymbol.current = symbol;
    } else {
      const c = candles[candles.length - 1];
      cs.update(toRow(c));
      vs.update(toVol(c));
    }
  }, [candles, symbol]);

  return <div ref={hostRef} className="h-full w-full" />;
}
