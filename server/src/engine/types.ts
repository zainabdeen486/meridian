export type Side = "bid" | "ask";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "partial" | "filled" | "cancelled" | "rejected";

export interface Order {
  id: string;
  symbol: string;
  userId: string;
  side: Side;
  type: OrderType;
  /** null for market orders */
  price: number | null;
  qty: number;
  filled: number;
  status: OrderStatus;
  ts: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  qty: number;
  takerSide: Side;
  makerOrderId: string;
  takerOrderId: string;
  buyerId: string;
  sellerId: string;
  ts: number;
}

export interface Level {
  price: number;
  qty: number;
}

export interface OrderInput {
  symbol: string;
  side: Side;
  type: OrderType;
  price?: number;
  qty: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
