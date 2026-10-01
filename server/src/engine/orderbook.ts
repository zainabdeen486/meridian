import { Level, Order, Trade } from "./types.js";

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** Bids: highest price first, then earliest time (price-time priority). */
function cmpBid(a: Order, b: Order): number {
  if (a.price !== b.price) return (b.price as number) - (a.price as number);
  return a.ts - b.ts;
}
/** Asks: lowest price first, then earliest time. */
function cmpAsk(a: Order, b: Order): number {
  if (a.price !== b.price) return (a.price as number) - (b.price as number);
  return a.ts - b.ts;
}

function insertSorted(arr: Order[], order: Order, cmp: (a: Order, b: Order) => number): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(order, arr[mid]) < 0) hi = mid;
    else lo = mid + 1;
  }
  arr.splice(lo, 0, order);
}

const EPS = 1e-9;

/**
 * Central limit order book with price-time priority matching.
 * Bids rest sorted highest-first, asks lowest-first; the earliest
 * order at a price level always matches first.
 */
export class OrderBook {
  readonly symbol: string;
  bids: Order[] = [];
  asks: Order[] = [];
  trades: Trade[] = [];
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  volume = 0;
  private readonly tradeCap = 2000;

  constructor(symbol: string, basePrice: number) {
    this.symbol = symbol;
    this.lastPrice = basePrice;
    this.open = basePrice;
    this.high = basePrice;
    this.low = basePrice;
  }

  bestBid(): Order | undefined {
    return this.bids[0];
  }

  bestAsk(): Order | undefined {
    return this.asks[0];
  }

  mid(): number | null {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (b?.price != null && a?.price != null) return (b.price + a.price) / 2;
    return null;
  }

  spread(): number | null {
    const b = this.bestBid();
    const a = this.bestAsk();
    if (b?.price != null && a?.price != null) return a.price - b.price;
    return null;
  }

  /**
   * Submit an order and run the matching loop against the opposite side.
   * Market orders and any unfilled remainder behave IOC (immediate-or-cancel).
   * Resting limit orders join the book in price-time priority.
   * Returns the taker order, generated trades, and the maker orders touched.
   */
  submit(order: Order): { order: Order; trades: Trade[]; makers: Order[] } {
    const trades: Trade[] = [];
    const makers: Order[] = [];
    const opposite = order.side === "bid" ? this.asks : this.bids;
    let remaining = order.qty;

    while (remaining > EPS && opposite.length > 0) {
      const maker = opposite[0];
      const makerPrice = maker.price as number;
      const crosses =
        order.type === "market" ||
        (order.side === "bid"
          ? (order.price as number) >= makerPrice
          : (order.price as number) <= makerPrice);
      if (!crosses) break;

      const makerRemaining = maker.qty - maker.filled;
      const fillQty = Math.min(remaining, makerRemaining);
      const trade: Trade = {
        id: newId("trd"),
        symbol: this.symbol,
        price: makerPrice,
        qty: fillQty,
        takerSide: order.side,
        makerOrderId: maker.id,
        takerOrderId: order.id,
        buyerId: order.side === "bid" ? order.userId : maker.userId,
        sellerId: order.side === "ask" ? order.userId : maker.userId,
        ts: Date.now(),
      };
      trades.push(trade);
      this.recordTrade(trade);
      if (!makers.includes(maker)) makers.push(maker);

      remaining -= fillQty;
      order.filled += fillQty;
      maker.filled += fillQty;
      if (maker.qty - maker.filled <= EPS) {
        maker.status = "filled";
        opposite.shift();
      } else {
        maker.status = "partial";
      }
    }

    if (remaining > EPS && order.type === "limit") {
      order.status = order.filled > EPS ? "partial" : "open";
      insertSorted(
        order.side === "bid" ? this.bids : this.asks,
        order,
        order.side === "bid" ? cmpBid : cmpAsk,
      );
    } else {
      // Market remainder is discarded (IOC); a fully-crossed limit is filled.
      order.status = order.filled >= order.qty - EPS ? "filled" : order.filled > EPS ? "partial" : "cancelled";
    }
    return { order, trades, makers };
  }

  cancel(orderId: string): Order | null {
    for (const arr of [this.bids, this.asks]) {
      const i = arr.findIndex((o) => o.id === orderId);
      if (i >= 0) {
        const [o] = arr.splice(i, 1);
        o.status = "cancelled";
        return o;
      }
    }
    return null;
  }

  cancelAllForUser(userId: string): Order[] {
    const out: Order[] = [];
    for (const arr of [this.bids, this.asks]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].userId === userId) {
          const [o] = arr.splice(i, 1);
          o.status = "cancelled";
          out.push(o);
        }
      }
    }
    return out;
  }

  openOrdersForUser(userId: string): Order[] {
    return [...this.bids, ...this.asks]
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.ts - a.ts);
  }

  private recordTrade(t: Trade): void {
    this.trades.push(t);
    if (this.trades.length > this.tradeCap) this.trades.splice(0, this.trades.length - this.tradeCap);
    this.lastPrice = t.price;
    this.volume += t.qty;
    if (t.price > this.high) this.high = t.price;
    if (t.price < this.low) this.low = t.price;
  }

  /** Aggregate resting orders into price levels, best-first. */
  snapshot(depth = 15): { bids: Level[]; asks: Level[] } {
    const agg = (orders: Order[]): Level[] => {
      const levels: Level[] = [];
      for (const o of orders) {
        const rem = o.qty - o.filled;
        if (rem <= EPS) continue;
        const last = levels[levels.length - 1];
        if (last && last.price === (o.price as number)) last.qty += rem;
        else {
          if (levels.length >= depth) break;
          levels.push({ price: o.price as number, qty: rem });
        }
      }
      return levels;
    };
    return { bids: agg(this.bids), asks: agg(this.asks) };
  }

  recentTrades(limit = 50): Trade[] {
    return this.trades.slice(-limit).reverse();
  }
}
