import { WebSocketServer, WebSocket } from "ws";
import { Server } from "node:http";
import { Exchange } from "../core/exchange.js";

interface Client {
  ws: WebSocket;
  userId: string | null;
  /** subscribed symbol -> candle resolution ("15s" | "1m") */
  subs: Map<string, string>;
  alive: boolean;
}

/**
 * Pushes market data to browsers: full order-book snapshots (throttled),
 * the trade tape, live candle buckets, per-second tickers, and private
 * fill/order updates for authenticated traders.
 *
 * Protocol (JSON):
 *   -> { op: "auth", token } | { op: "sub", symbol, res? } | { op: "unsub", symbol }
 *   <- { ch: "ticker", tickers } | { ch: "book", symbol, bids, asks, last }
 *      | { ch: "trades", symbol, trades } | { ch: "candle", symbol, res, candle }
 *      | { ch: "candles", symbol, res, candles } | { ch: "fill", trade, portfolio }
 *      | { ch: "order", order } | { ch: "auth", ok, portfolio }
 */
export function attachWs(server: Server, ex: Exchange): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Set<Client>();
  const dirtyBooks = new Set<string>();

  const send = (c: Client, msg: unknown) => {
    if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
  };

  ex.on("trade", ({ symbol, trade }: { symbol: string; trade: unknown }) => {
    dirtyBooks.add(symbol);
    for (const c of clients) {
      if (c.subs.has(symbol)) send(c, { ch: "trades", symbol, trades: [trade] });
    }
  });

  ex.on("fill", ({ userId, trade, portfolio }: { userId: string; trade: unknown; portfolio: unknown }) => {
    for (const c of clients) {
      if (c.userId === userId) send(c, { ch: "fill", trade, portfolio });
    }
  });

  ex.on("order", ({ userId, order }: { userId: string; order: unknown }) => {
    for (const c of clients) {
      if (c.userId === userId) send(c, { ch: "order", order });
    }
  });

  // Throttled book snapshots: coalesce bursts of trades into 300ms frames.
  setInterval(() => {
    if (dirtyBooks.size === 0) return;
    for (const symbol of dirtyBooks) {
      const book = ex.books.get(symbol);
      if (!book) continue;
      const snap = book.snapshot(15);
      for (const c of clients) {
        if (c.subs.has(symbol)) send(c, { ch: "book", symbol, bids: snap.bids, asks: snap.asks, last: book.lastPrice });
      }
    }
    dirtyBooks.clear();
  }, 300);

  // 1s heartbeat: tickers to everyone, live candle bucket to subscribers.
  setInterval(() => {
    const tickers = ex.tickers();
    for (const c of clients) {
      send(c, { ch: "ticker", tickers });
      for (const [s, r] of c.subs) {
        const cb = r === "1m" ? ex.candles1m.get(s) : ex.candles15s.get(s);
        if (cb) send(c, { ch: "candle", symbol: s, res: r, candle: cb.current });
      }
    }
  }, 1000);

  wss.on("connection", (ws) => {
    const c: Client = { ws, userId: null, subs: new Map(), alive: true };
    clients.add(c);
    send(c, { ch: "ticker", tickers: ex.tickers() });

    ws.on("message", (raw) => {
      let msg: { op?: string; token?: string; symbol?: string; res?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.op === "auth" && typeof msg.token === "string") {
        c.userId = ex.userIdForToken(msg.token);
        send(c, {
          ch: "auth",
          ok: c.userId !== null,
          portfolio: c.userId ? ex.portfolioView(c.userId) : null,
          orders: c.userId ? ex.openOrders(c.userId) : [],
        });
      } else if (msg.op === "sub" && typeof msg.symbol === "string" && ex.books.has(msg.symbol)) {
        const res = msg.res === "1m" ? "1m" : "15s";
        c.subs.set(msg.symbol, res);
        const book = ex.books.get(msg.symbol)!;
        const snap = book.snapshot(15);
        send(c, { ch: "book", symbol: msg.symbol, bids: snap.bids, asks: snap.asks, last: book.lastPrice });
        send(c, { ch: "trades", symbol: msg.symbol, trades: book.recentTrades(30) });
        send(c, { ch: "candles", symbol: msg.symbol, res, candles: ex.candles(msg.symbol, res) });
      } else if (msg.op === "unsub" && typeof msg.symbol === "string") {
        c.subs.delete(msg.symbol);
      }
    });

    ws.on("pong", () => {
      c.alive = true;
    });
    ws.on("close", () => {
      clients.delete(c);
    });
  });

  setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate();
        clients.delete(c);
        continue;
      }
      c.alive = false;
      c.ws.ping();
    }
  }, 30000);
}
