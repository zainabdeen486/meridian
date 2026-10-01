import { Trade } from "../lib/api";
import { cx, fmtClock, fmtPrice, fmtQty } from "../lib/format";

/** The tape: every print, newest first, colored by taker side. */
export function TradesTape({ trades }: { trades: Trade[] }) {
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 px-3 py-1.5 text-right text-[10px] uppercase tracking-wider text-faint">
        <span>Price</span>
        <span>Qty</span>
        <span>Time</span>
      </div>
      <div className="slim-scroll flex-1 overflow-y-auto pb-2">
        {trades.map((t) => {
          const buy = t.takerSide === "bid";
          return (
            <div
              key={t.id}
              className="grid grid-cols-3 px-3 py-[3px] text-right font-mono text-[11px] leading-4"
            >
              <span className={cx(buy ? "text-bull" : "text-bear")}>{fmtPrice(t.price)}</span>
              <span className="text-[#eaecef]">{fmtQty(t.qty)}</span>
              <span className="text-mute">{fmtClock(t.ts)}</span>
            </div>
          );
        })}
        {trades.length === 0 && (
          <div className="px-3 py-4 text-center text-xs text-faint">Waiting for prints…</div>
        )}
      </div>
    </div>
  );
}
