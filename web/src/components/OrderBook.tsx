import { Level } from "../lib/api";
import { cx, fmtPrice, fmtQty } from "../lib/format";

interface Props {
  bids: Level[];
  asks: Level[];
  last: number | null;
}

/** Level-2 depth: asks on top, spread in the middle, bids below. */
export function OrderBook({ bids, asks, last }: Props) {
  const rows = 12;
  const visAsks = asks.slice(0, rows);
  const visBids = bids.slice(0, rows);
  const maxQty = Math.max(
    1e-9,
    ...visAsks.map((l) => l.qty),
    ...visBids.map((l) => l.qty),
  );

  const row = (l: Level, side: "bid" | "ask") => {
    const total = l.price * l.qty;
    const bull = side === "bid";
    return (
      <div key={`${side}-${l.price}`} className="relative grid grid-cols-3 px-3 py-[3px] text-right font-mono text-[11px] leading-4">
        <div
          className={cx("absolute inset-y-[1px] right-0", bull ? "bg-bull/10" : "bg-bear/10")}
          style={{ width: `${Math.min(100, (l.qty / maxQty) * 100)}%` }}
        />
        <span className={cx("relative", bull ? "text-bull" : "text-bear")}>{fmtPrice(l.price)}</span>
        <span className="relative text-[#eaecef]">{fmtQty(l.qty)}</span>
        <span className="relative text-mute">{fmtPrice(total)}</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-faint">
        <span>Price</span>
        <span>Qty</span>
        <span>Total</span>
      </div>
      <div className="flex-1 overflow-hidden">
        {/* asks rendered worst-first so best ask sits just above the spread */}
        <div className="flex h-1/2 flex-col justify-end overflow-hidden">
          {visAsks.slice().reverse().map((l) => row(l, "ask"))}
        </div>
        <div className="flex items-center gap-2 border-y border-line px-3 py-1.5">
          <span className="font-mono text-sm font-semibold text-[#eaecef]">
            {last != null ? fmtPrice(last) : "—"}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-faint">
            {visAsks.length > 0 && visBids.length > 0
              ? `spread ${fmtPrice(visAsks[0].price - visBids[0].price)}`
              : "spread —"}
          </span>
        </div>
        <div className="h-1/2 overflow-hidden">{visBids.map((l) => row(l, "bid"))}</div>
      </div>
    </div>
  );
}
