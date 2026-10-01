import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  Candle,
  Level,
  Order,
  PortfolioView,
  Side,
  OrderType,
  Ticker,
  Trade,
} from "./api";

export type ConnStatus = "connecting" | "live" | "reconnecting";

const TOKEN_KEY = "meridian_token";
const NAME_KEY = "meridian_name";
const UID_KEY = "meridian_uid";

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws`;
}

export interface PlaceInput {
  side: Side;
  type: OrderType;
  price?: number;
  qty: number;
}

/**
 * Owns the WebSocket connection and all exchange state: tickers, the
 * subscribed symbol's book/trades/candles, and the authed trader's
 * portfolio, open orders and fills. Auto-reconnects with backoff.
 */
export function useExchange() {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(UID_KEY));
  const [traderName, setTraderName] = useState<string | null>(() => localStorage.getItem(NAME_KEY));
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbolState] = useState("AAPL");
  const [res, setResState] = useState<"15s" | "1m">("15s");
  const [book, setBook] = useState<{ bids: Level[]; asks: Level[]; last: number } | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioView | null>(null);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [fills, setFills] = useState<Trade[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const symbolRef = useRef(symbol);
  const tokenRef = useRef(token);
  const resRef = useRef(res);
  symbolRef.current = symbol;
  tokenRef.current = token;
  resRef.current = res;

  const setSymbol = useCallback((s: string) => {
    if (s === symbolRef.current) return;
    setSymbolState(s);
    setBook(null);
    setTrades([]);
    setCandles([]);
    wsRef.current?.send(JSON.stringify({ op: "sub", symbol: s, res: resRef.current }));
  }, []);

  const setRes = useCallback((r: "15s" | "1m") => {
    if (r === resRef.current) return;
    setResState(r);
    setCandles([]);
    wsRef.current?.send(JSON.stringify({ op: "sub", symbol: symbolRef.current, res: r }));
  }, []);

  useEffect(() => {
    let dead = false;
    let retry = 0;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (dead) return;
      setStatus((s) => (s === "live" ? "reconnecting" : "connecting"));
      ws = new WebSocket(wsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setStatus("live");
        if (tokenRef.current) ws!.send(JSON.stringify({ op: "auth", token: tokenRef.current }));
        ws!.send(JSON.stringify({ op: "sub", symbol: symbolRef.current, res: resRef.current }));
      };

      ws.onmessage = (ev) => {
        let m: any;
        try {
          m = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (m.ch) {
          case "ticker":
            setTickers(m.tickers);
            break;
          case "book":
            if (m.symbol === symbolRef.current) setBook({ bids: m.bids, asks: m.asks, last: m.last });
            break;
          case "trades":
            if (m.symbol === symbolRef.current) setTrades((t) => [...m.trades, ...t].slice(0, 60));
            break;
          case "candles":
            if (m.symbol === symbolRef.current && m.res === resRef.current) setCandles(m.candles);
            break;
          case "candle":
            if (m.symbol === symbolRef.current && m.res === resRef.current) {
              setCandles((cs) => {
                if (cs.length === 0) return cs;
                const last = cs[cs.length - 1];
                if (last.time === m.candle.time) {
                  const n = cs.slice();
                  n[n.length - 1] = m.candle;
                  return n;
                }
                if (m.candle.time > last.time) return [...cs.slice(-299), m.candle];
                return cs;
              });
            }
            break;
          case "auth":
            if (m.ok) {
              setPortfolio(m.portfolio);
              setOpenOrders(m.orders ?? []);
            }
            break;
          case "fill":
            setFills((f) => [m.trade, ...f].slice(0, 30));
            setPortfolio(m.portfolio);
            break;
          case "order": {
            const o = m.order as Order;
            setOpenOrders((os) =>
              o.status === "open" || o.status === "partial"
                ? [...os.filter((x) => x.id !== o.id), o].sort((a, b) => b.ts - a.ts)
                : os.filter((x) => x.id !== o.id),
            );
            break;
          }
        }
      };

      ws.onclose = () => {
        if (dead) return;
        setStatus("reconnecting");
        retry += 1;
        setTimeout(connect, Math.min(1000 * retry, 8000));
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      dead = true;
      wsRef.current?.close();
    };
  }, []);

  const login = useCallback(async (name: string) => {
    const res = await api.login(name);
    localStorage.setItem(TOKEN_KEY, res.user.token);
    localStorage.setItem(UID_KEY, res.user.id);
    localStorage.setItem(NAME_KEY, res.user.name);
    tokenRef.current = res.user.token;
    setToken(res.user.token);
    setUserId(res.user.id);
    setTraderName(res.user.name);
    setPortfolio(res.portfolio);
    wsRef.current?.send(JSON.stringify({ op: "auth", token: res.user.token }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(UID_KEY);
    localStorage.removeItem(NAME_KEY);
    tokenRef.current = null;
    setToken(null);
    setUserId(null);
    setTraderName(null);
    setPortfolio(null);
    setOpenOrders([]);
    setFills([]);
  }, []);

  const placeOrder = useCallback(
    async (input: PlaceInput): Promise<{ ok: boolean; error?: string; order?: Order; trades?: Trade[] }> => {
      if (!tokenRef.current) return { ok: false, error: "Log in to trade." };
      try {
        const res = await api.placeOrder(tokenRef.current, { symbol: symbolRef.current, ...input });
        const o = res.order;
        if (o.status === "open" || o.status === "partial") {
          setOpenOrders((os) => [...os.filter((x) => x.id !== o.id), o].sort((a, b) => b.ts - a.ts));
        }
        if (res.trades.length > 0) setFills((f) => [...res.trades, ...f].slice(0, 30));
        return { ok: true, order: o, trades: res.trades };
      } catch (e: any) {
        return { ok: false, error: e.message ?? "Order failed" };
      }
    },
    [],
  );

  const cancelOrder = useCallback(async (id: string) => {
    if (!tokenRef.current) return;
    try {
      await api.cancelOrder(tokenRef.current, id);
    } catch {
      /* WS event is the source of truth; a failed cancel just no-ops */
    }
  }, []);

  return {
    status, token, userId, traderName,
    tickers, symbol, setSymbol, res, setRes,
    book, trades, candles,
    portfolio, openOrders, fills,
    login, logout, placeOrder, cancelOrder,
  };
}

export type ExchangeApi = ReturnType<typeof useExchange>;
