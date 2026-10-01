import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { OrderBook, newId } from "../engine/orderbook.js";
import { Order, OrderInput, Trade, round2, round4 } from "../engine/types.js";
import { CandleBuilder, Candle } from "../market/candles.js";
import { MarketMaker } from "../market/maker.js";
import { Store } from "../db/store.js";

export interface SymbolDef {
  symbol: string;
  name: string;
  basePrice: number;
}

export interface User {
  id: string;
  name: string;
  token: string;
}

export interface Position {
  qty: number;
  avg: number;
}

export interface Portfolio {
  cash: number;
  positions: Record<string, Position>;
}

export interface PositionView extends Position {
  symbol: string;
  mark: number;
  marketValue: number;
  pnl: number;
}

export interface PortfolioView {
  cash: number;
  equity: number;
  positions: PositionView[];
}

export interface Ticker {
  symbol: string;
  name: string;
  last: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const STARTING_CASH = 100_000;

/**
 * The exchange: one limit order book per symbol, market-maker liquidity,
 * user accounts with cash/position risk checks, and an event bus the
 * WebSocket layer fans out to browsers.
 */
export class Exchange extends EventEmitter {
  readonly symbols: SymbolDef[];
  books = new Map<string, OrderBook>();
  candles15s = new Map<string, CandleBuilder>();
  candles1m = new Map<string, CandleBuilder>();
  private makers: MarketMaker[] = [];
  private usersByToken = new Map<string, User>();
  private portfolios = new Map<string, Portfolio>();
  private store: Store;

  constructor(symbols: SymbolDef[], dbPath: string) {
    super();
    this.symbols = symbols;
    this.store = new Store(dbPath);
    for (const s of symbols) {
      const book = new OrderBook(s.symbol, s.basePrice);
      this.books.set(s.symbol, book);
      this.candles15s.set(s.symbol, new CandleBuilder(s.symbol, 15, s.basePrice));
      this.candles1m.set(s.symbol, new CandleBuilder(s.symbol, 60, s.basePrice));
      this.makers.push(
        new MarketMaker(book, s.basePrice, {
          onTrades: ({ trades, makers }) => this.handleTrades(s.symbol, trades, makers),
        }),
      );
    }
  }

  start(): void {
    this.makers.forEach((m) => m.start());
  }

  stop(): void {
    this.makers.forEach((m) => m.stop());
    this.store.close();
  }

  // ---------- users ----------

  login(name: string): { user: Pick<User, "id" | "name"> & { token: string }; portfolio: PortfolioView } {
    const clean = (name || "").trim().slice(0, 24) || "Trader";
    const user: User = { id: newId("usr"), name: clean, token: randomBytes(24).toString("hex") };
    this.usersByToken.set(user.token, user);
    this.portfolios.set(user.id, { cash: STARTING_CASH, positions: {} });
    return { user, portfolio: this.portfolioView(user.id) };
  }

  userIdForToken(token: string | undefined): string | null {
    if (!token) return null;
    return this.usersByToken.get(token)?.id ?? null;
  }

  userName(userId: string): string | null {
    for (const u of this.usersByToken.values()) if (u.id === userId) return u.name;
    return null;
  }

  // ---------- market data ----------

  tickers(): Ticker[] {
    return this.symbols.map((s) => {
      const b = this.books.get(s.symbol)!;
      const change = b.lastPrice - b.open;
      return {
        symbol: s.symbol, name: s.name, last: b.lastPrice,
        open: b.open, high: b.high, low: b.low,
        change, changePct: (change / b.open) * 100, volume: b.volume,
      };
    });
  }

  candles(symbol: string, res: string, limit = 160): Candle[] {
    const map = res === "1m" ? this.candles1m : this.candles15s;
    const cb = map.get(symbol);
    if (!cb) throw new ApiError(400, "Unknown symbol");
    return cb.all(Math.min(Math.max(limit, 10), 300));
  }

  // ---------- orders ----------

  placeOrder(userId: string, input: OrderInput): { order: Order; trades: Trade[] } {
    const book = this.books.get(input.symbol);
    if (!book) throw new ApiError(400, "Unknown symbol");
    const pf = this.portfolios.get(userId);
    if (!pf) throw new ApiError(401, "Not logged in");

    const qty = round4(input.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, "Quantity must be positive");
    if (input.type !== "limit" && input.type !== "market") throw new ApiError(400, "Invalid order type");

    let price: number | null = null;
    if (input.type === "limit") {
      price = round2(Number(input.price));
      if (!Number.isFinite(price) || price <= 0) throw new ApiError(400, "Limit price must be positive");
    }

    // Pre-trade risk checks (no leverage, no shorting in this demo venue).
    if (input.side === "bid") {
      const ref = price ?? book.lastPrice * 1.03;
      const cost = ref * qty;
      if (pf.cash < cost) {
        throw new ApiError(400, `Insufficient buying power — need $${cost.toFixed(2)}, have $${pf.cash.toFixed(2)}`);
      }
    } else {
      const held = pf.positions[input.symbol]?.qty ?? 0;
      if (held < qty) {
        throw new ApiError(400, `Insufficient position — you hold ${held} ${input.symbol}, tried to sell ${qty}`);
      }
    }

    const order: Order = {
      id: newId("ord"), symbol: input.symbol, userId,
      side: input.side, type: input.type, price,
      qty, filled: 0, status: "open", ts: Date.now(),
    };
    const { trades, makers } = book.submit(order);
    this.store.saveOrder(order);
    this.store.updateOrder(order);
    if (trades.length > 0) this.handleTrades(input.symbol, trades, makers);
    this.emit("order", { userId, order });
    return { order, trades };
  }

  cancelOrder(userId: string, orderId: string): Order {
    for (const book of this.books.values()) {
      const mine = book.openOrdersForUser(userId).some((o) => o.id === orderId);
      if (mine) {
        const o = book.cancel(orderId)!;
        this.store.updateOrder(o);
        this.emit("order", { userId, order: o });
        return o;
      }
    }
    throw new ApiError(404, "Order not found");
  }

  openOrders(userId: string): Order[] {
    const out: Order[] = [];
    for (const book of this.books.values()) out.push(...book.openOrdersForUser(userId));
    return out.sort((a, b) => b.ts - a.ts);
  }

  portfolioView(userId: string): PortfolioView {
    const pf = this.portfolios.get(userId);
    if (!pf) throw new ApiError(401, "Not logged in");
    const positions: PositionView[] = [];
    let equity = pf.cash;
    for (const [symbol, p] of Object.entries(pf.positions)) {
      const mark = this.books.get(symbol)?.lastPrice ?? p.avg;
      const marketValue = mark * p.qty;
      const pnl = (mark - p.avg) * p.qty;
      positions.push({ symbol, qty: p.qty, avg: p.avg, mark, marketValue, pnl });
      equity += marketValue;
    }
    positions.sort((a, b) => b.marketValue - a.marketValue);
    return { cash: pf.cash, equity, positions };
  }

  // ---------- internals ----------

  private handleTrades(symbol: string, trades: Trade[], makers: Order[]): void {
    for (const t of trades) {
      this.store.saveTrade(t);
      this.candles15s.get(symbol)?.onTrade(t);
      this.candles1m.get(symbol)?.onTrade(t);
      // Buyer gets long, seller reduces. Market-maker fills skip portfolios.
      this.applyFill(t.buyerId, symbol, "buy", t.price, t.qty);
      this.applyFill(t.sellerId, symbol, "sell", t.price, t.qty);
      this.emit("trade", { symbol, trade: t });
      for (const uid of [t.buyerId, t.sellerId]) {
        if (this.portfolios.has(uid)) {
          this.emit("fill", { userId: uid, trade: t, portfolio: this.portfolioView(uid) });
        }
      }
    }
    for (const m of makers) {
      if (this.portfolios.has(m.userId)) {
        this.store.updateOrder(m);
        this.emit("order", { userId: m.userId, order: m });
      }
    }
    this.emit("candles", { symbol });
  }

  private applyFill(userId: string, symbol: string, dir: "buy" | "sell", price: number, qty: number): void {
    const pf = this.portfolios.get(userId);
    if (!pf) return;
    const pos = pf.positions[symbol] ?? { qty: 0, avg: 0 };
    if (dir === "buy") {
      const newQty = pos.qty + qty;
      pos.avg = newQty > 0 ? (pos.avg * pos.qty + price * qty) / newQty : 0;
      pos.qty = round4(newQty);
      pf.cash = round2(pf.cash - price * qty);
      pf.positions[symbol] = pos;
    } else {
      pos.qty = round4(pos.qty - qty);
      pf.cash = round2(pf.cash + price * qty);
      if (pos.qty <= 1e-9) delete pf.positions[symbol];
      else pf.positions[symbol] = pos;
    }
  }
}
