import { Trade } from "../engine/types.js";

export interface Candle {
  time: number; // bucket start, ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Builds OHLCV candles from the trade tape. Keeps a seeded history so
 * charts are never empty, then rolls live buckets as trades print.
 */
export class CandleBuilder {
  readonly symbol: string;
  readonly resolutionSec: number;
  history: Candle[] = [];
  current: Candle;
  private readonly cap = 300;

  constructor(symbol: string, resolutionSec: number, basePrice: number, now = Date.now()) {
    this.symbol = symbol;
    this.resolutionSec = resolutionSec;
    this.current = this.emptyBucket(this.bucket(now), basePrice);
    this.seed(basePrice, now);
  }

  private bucket(ts: number): number {
    return Math.floor(ts / 1000 / this.resolutionSec) * this.resolutionSec * 1000;
  }

  private emptyBucket(time: number, price: number): Candle {
    return { time, open: price, high: price, low: price, close: price, volume: 0 };
  }

  /** Walk backwards from `now` so history lands exactly on `basePrice`. */
  private seed(basePrice: number, now: number): void {
    const prices: number[] = [basePrice];
    for (let i = 1; i < 140; i++) {
      const drift = (Math.random() - 0.5) * 0.004;
      prices.unshift(prices[0] * (1 - drift));
    }
    let t = this.bucket(now) - 140 * this.resolutionSec * 1000;
    for (let i = 0; i < 140; i++) {
      const o = prices[i];
      const c = prices[i + 1] ?? o;
      const h = Math.max(o, c) * (1 + Math.random() * 0.0015);
      const l = Math.min(o, c) * (1 - Math.random() * 0.0015);
      this.history.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.random() * 400 + 20 });
      t += this.resolutionSec * 1000;
    }
    const last = this.history[this.history.length - 1];
    this.current = this.emptyBucket(this.bucket(now), last.close);
  }

  onTrade(trade: Trade): Candle {
    const b = this.bucket(trade.ts);
    if (b > this.current.time) {
      this.history.push(this.current);
      if (this.history.length > this.cap) this.history.splice(0, this.history.length - this.cap);
      this.current = this.emptyBucket(b, trade.price);
    } else if (b < this.current.time) {
      return this.current; // late/out-of-order trade, ignore
    }
    const c = this.current;
    c.close = trade.price;
    if (trade.price > c.high) c.high = trade.price;
    if (trade.price < c.low) c.low = trade.price;
    c.volume += trade.qty;
    return c;
  }

  /** History + live bucket, oldest first, capped. */
  all(limit = 200): Candle[] {
    const full = [...this.history.slice(-(limit - 1)), this.current];
    return full.slice(-limit);
  }
}
