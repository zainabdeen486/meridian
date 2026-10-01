import { OrderBook, newId } from "../engine/orderbook.js";
import { Order, Trade, round2 } from "../engine/types.js";

/**
 * Simulated liquidity provider. Keeps a tight ladder of quotes around a
 * mean-reverting random-walk mid, and occasionally lifts/hits the book so
 * the tape stays alive even with no human traders connected.
 */
export class MarketMaker {
  readonly userId: string;
  private readonly book: OrderBook;
  private readonly tickMs: number;
  private readonly tickSize: number;
  private readonly basePrice: number;
  private timer: NodeJS.Timeout | null = null;
  private mid: number;
  private readonly onTrades: (result: { trades: Trade[]; makers: Order[] }) => void;

  constructor(
    book: OrderBook,
    basePrice: number,
    opts: { tickMs?: number; onTrades?: (result: { trades: Trade[]; makers: Order[] }) => void } = {},
  ) {
    this.book = book;
    this.basePrice = basePrice;
    this.mid = basePrice;
    this.userId = `mm-${book.symbol}`;
    this.tickMs = opts.tickMs ?? 700;
    this.tickSize = Math.max(basePrice * 0.0002, 0.01);
    this.onTrades = opts.onTrades ?? (() => {});
  }

  start(): void {
    if (this.timer) return;
    this.quote(); // populate immediately
    this.timer = setInterval(() => this.quote(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private quote(): void {
    // Mean-reverting random walk: noise plus pull back toward base price.
    const noise = (Math.random() - 0.5) * 0.0016;
    const pull = (this.basePrice - this.mid) / this.basePrice * 0.02;
    this.mid = Math.max(this.mid * (1 + noise + pull), this.basePrice * 0.5);

    this.book.cancelAllForUser(this.userId);

    const levels = 6;
    const now = Date.now();
    // Never cross resting orders from other participants.
    const othersBestAsk = this.book.bestAsk()?.price ?? Infinity;
    const othersBestBid = this.book.bestBid()?.price ?? -Infinity;
    for (let i = 0; i < levels; i++) {
      const spreadHalf = this.tickSize * (1 + i * 1.5);
      const size = this.lotSize() * (1 + Math.random() * 2);
      let bidPrice = round2(this.mid - spreadHalf);
      let askPrice = round2(this.mid + spreadHalf);
      if (bidPrice >= othersBestAsk) bidPrice = round2(othersBestAsk - this.tickSize);
      if (askPrice <= othersBestBid) askPrice = round2(othersBestBid + this.tickSize);
      if (bidPrice >= askPrice) continue;
      const bid: Order = {
        id: newId("mm"), symbol: this.book.symbol, userId: this.userId,
        side: "bid", type: "limit", price: bidPrice,
        qty: size, filled: 0, status: "open", ts: now + i,
      };
      const ask: Order = {
        ...bid, id: newId("mm"), side: "ask", price: askPrice, ts: now + i + 0.5,
      };
      this.book.submit(bid);
      this.book.submit(ask);
    }

    // Taker flow: randomly hit or lift to print tape and move the price.
    if (Math.random() < 0.35) {
      const side = Math.random() < 0.5 ? "bid" : "ask";
      const taker: Order = {
        id: newId("mmt"), symbol: this.book.symbol, userId: this.userId,
        side, type: "market", price: null,
        qty: this.lotSize() * (0.5 + Math.random()), filled: 0, status: "open", ts: Date.now(),
      };
      const { trades, makers } = this.book.submit(taker);
      if (trades.length > 0) this.onTrades({ trades, makers });
    }
  }

  private lotSize(): number {
    // BTC trades in fractions, equities in whole-ish lots.
    return this.book.symbol === "BTCUSD" ? 0.002 + Math.random() * 0.02 : 2 + Math.random() * 18;
  }
}
