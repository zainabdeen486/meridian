export type Side = "bid" | "ask";
export type OrderType = "limit" | "market";

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

export interface Level {
  price: number;
  qty: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  qty: number;
  takerSide: Side;
  buyerId: string;
  sellerId: string;
  ts: number;
}

export interface Order {
  id: string;
  symbol: string;
  userId: string;
  side: Side;
  type: OrderType;
  price: number | null;
  qty: number;
  filled: number;
  status: string;
  ts: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PositionView {
  symbol: string;
  qty: number;
  avg: number;
  mark: number;
  marketValue: number;
  pnl: number;
}

export interface PortfolioView {
  cash: number;
  equity: number;
  positions: PositionView[];
}

async function req(path: string, token?: string | null, init?: RequestInit): Promise<any> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  login(name: string) {
    return req("/api/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ name }),
    }) as Promise<{ user: { id: string; name: string; token: string }; portfolio: PortfolioView }>;
  },
  placeOrder(
    token: string,
    input: { symbol: string; side: Side; type: OrderType; price?: number; qty: number },
  ) {
    return req("/api/orders", token, {
      method: "POST",
      body: JSON.stringify(input),
    }) as Promise<{ order: Order; trades: Trade[] }>;
  },
  cancelOrder(token: string, id: string) {
    return req(`/api/orders/${id}`, token, { method: "DELETE" }) as Promise<{ order: Order }>;
  },
};
