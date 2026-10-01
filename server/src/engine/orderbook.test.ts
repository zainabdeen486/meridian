import { OrderBook } from "./orderbook.js";
import { Order } from "./types.js";

let n = 0;
const mk = (
  side: "bid" | "ask",
  price: number | null,
  qty: number,
  type: "limit" | "market" = "limit",
  userId = "u1",
): Order => ({
  id: `o${++n}`,
  symbol: "AAPL",
  userId,
  side,
  type,
  price,
  qty,
  filled: 0,
  status: "open",
  ts: Date.now() + n, // strictly increasing -> deterministic time priority
});

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

// 1. Basic limit cross: resting ask 100x10, incoming bid 100x5
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 10, "limit", "maker"));
  const { order, trades } = b.submit(mk("bid", 100, 5, "limit", "taker"));
  assert(trades.length === 1 && trades[0].price === 100 && trades[0].qty === 5, "limit cross produces one trade at maker price");
  assert(order.status === "filled", "taker fully filled");
  assert(b.asks[0].filled === 5 && b.asks[0].status === "partial", "maker partially filled and rests");
  assert(b.lastPrice === 100, "last price updated");
}

// 2. Market order sweeps multiple levels, remainder IOC
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 2, "limit", "m1"));
  b.submit(mk("ask", 101, 2, "limit", "m2"));
  const { order, trades } = b.submit(mk("bid", null, 5, "market", "taker"));
  assert(trades.length === 2, "market order sweeps two levels");
  assert(trades[0].price === 100 && trades[1].price === 101, "fills walk the book best-first");
  assert(order.status === "partial" && Math.abs(order.filled - 4) < 1e-9, "unfilled remainder cancelled (IOC)");
  assert(b.asks.length === 0, "book levels consumed");
}

// 3. Non-crossing limit rests on the book
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 10, "limit", "m"));
  const { trades, order } = b.submit(mk("bid", 99, 5));
  assert(trades.length === 0 && order.status === "open", "non-crossing bid rests");
  assert(b.bids.length === 1 && b.asks.length === 1, "both sides present");
  assert(b.mid() === 99.5, "mid price correct");
}

// 4. Price-time priority: same price, earlier order fills first
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 3, "limit", "early"));
  b.submit(mk("ask", 100, 3, "limit", "late"));
  const { trades } = b.submit(mk("bid", null, 4, "market", "taker"));
  assert(trades[0].makerOrderId === "o1" || trades[0].qty === 3, "first level fully consumed");
  const earlyFilled = trades.filter((t) => t.makerOrderId.endsWith("1") || t.sellerId === "early").reduce((s, t) => s + t.qty, 0);
  assert(earlyFilled === 3, "earlier order at same price filled first (time priority)");
  assert(b.asks[0].userId === "late" && Math.abs(b.asks[0].qty - b.asks[0].filled - 2) < 1e-9, "later order partially filled, rests");
}

// 5. Better price jumps the queue (price priority)
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("bid", 99, 5, "limit", "low"));
  b.submit(mk("bid", 101, 5, "limit", "high"));
  assert(b.bids[0].userId === "high", "best bid is highest price");
  const { trades } = b.submit(mk("ask", null, 5, "market", "taker"));
  assert(trades[0].price === 101, "market sell hits best bid first");
}

// 6. Cancel removes from book
{
  const b = new OrderBook("AAPL", 100);
  const { order } = b.submit(mk("bid", 99, 5));
  const c = b.cancel(order.id);
  assert(c?.status === "cancelled" && b.bids.length === 0, "cancel removes resting order");
  assert(b.cancel("nope") === null, "cancel of unknown id returns null");
}

// 7. Snapshot aggregates same-price levels
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 2, "limit", "a"));
  b.submit(mk("ask", 100, 3, "limit", "b"));
  b.submit(mk("ask", 101, 1, "limit", "c"));
  const snap = b.snapshot(10);
  assert(snap.asks.length === 2 && snap.asks[0].qty === 5 && snap.asks[0].price === 100, "levels aggregated best-first");
}

// 8. Trade records buyer/seller correctly
{
  const b = new OrderBook("AAPL", 100);
  b.submit(mk("ask", 100, 5, "limit", "seller"));
  const { trades } = b.submit(mk("bid", 100, 5, "limit", "buyer"));
  assert(trades[0].buyerId === "buyer" && trades[0].sellerId === "seller", "buyer/seller attribution correct");
  assert(trades[0].takerSide === "bid", "taker side recorded");
}

console.log("\nAll matching-engine tests passed.");
