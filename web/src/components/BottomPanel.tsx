import { useState } from "react";
import { Order, PositionView, Trade } from "../lib/api";
import { cx, fmtClock, fmtPct, fmtPrice, fmtQty, fmtSignedUSD, fmtUSD } from "../lib/format";

interface Props {
  openOrders: Order[];
  positions: PositionView[];
  fills: Trade[];
  userId: string | null;
  onCancel: (id: string) => void;
}

type Tab = "orders" | "positions" | "fills";

/** Working orders, positions and recent fills. */
export function BottomPanel({ openOrders, positions, fills, userId, onCancel }: Props) {
  const [tab, setTab] = useState<Tab>("orders");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "orders", label: "Open Orders", count: openOrders.length },
    { id: "positions", label: "Positions", count: positions.length },
    { id: "fills", label: "Fills", count: fills.length },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line px-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "border-[#eaecef] text-[#eaecef]"
                : "border-transparent text-faint hover:text-mute",
            )}
          >
            {t.label}
            <span className="ml-1.5 rounded-full bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-mute">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="slim-scroll flex-1 overflow-y-auto">
        {tab === "orders" && (
          <table className="w-full text-right font-mono text-[11px]">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Time</th>
                <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
                <th className="px-3 py-1.5 font-medium">Side</th>
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Price</th>
                <th className="px-3 py-1.5 font-medium">Qty</th>
                <th className="px-3 py-1.5 font-medium">Filled</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((o) => (
                <tr key={o.id} className="border-t border-line/60 hover:bg-panel2/50">
                  <td className="px-3 py-1.5 text-left text-mute">{fmtClock(o.ts)}</td>
                  <td className="px-3 py-1.5 text-left text-[#eaecef]">{o.symbol}</td>
                  <td className={cx("px-3 py-1.5", o.side === "bid" ? "text-bull" : "text-bear")}>
                    {o.side === "bid" ? "Buy" : "Sell"}
                  </td>
                  <td className="px-3 py-1.5 capitalize text-mute">{o.type}</td>
                  <td className="px-3 py-1.5 text-[#eaecef]">{o.price != null ? fmtPrice(o.price) : "MKT"}</td>
                  <td className="px-3 py-1.5 text-[#eaecef]">{fmtQty(o.qty)}</td>
                  <td className="px-3 py-1.5 text-mute">{fmtQty(o.filled)}</td>
                  <td className="px-3 py-1.5 capitalize text-mute">{o.status}</td>
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => onCancel(o.id)}
                      className="rounded bg-bear/10 px-2 py-0.5 text-[10px] font-medium text-bear hover:bg-bear/20"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
              {openOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center font-sans text-xs text-faint">
                    No working orders. Place one from the ticket.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "positions" && (
          <table className="w-full text-right font-mono text-[11px]">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
                <th className="px-3 py-1.5 font-medium">Qty</th>
                <th className="px-3 py-1.5 font-medium">Avg Price</th>
                <th className="px-3 py-1.5 font-medium">Mark</th>
                <th className="px-3 py-1.5 font-medium">Value</th>
                <th className="px-3 py-1.5 font-medium">uPnL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol} className="border-t border-line/60 hover:bg-panel2/50">
                  <td className="px-3 py-1.5 text-left text-[#eaecef]">{p.symbol}</td>
                  <td className="px-3 py-1.5 text-[#eaecef]">{fmtQty(p.qty)}</td>
                  <td className="px-3 py-1.5 text-mute">{fmtPrice(p.avg)}</td>
                  <td className="px-3 py-1.5 text-[#eaecef]">{fmtPrice(p.mark)}</td>
                  <td className="px-3 py-1.5 text-[#eaecef]">{fmtUSD(p.marketValue)}</td>
                  <td className={cx("px-3 py-1.5", p.pnl >= 0 ? "text-bull" : "text-bear")}>
                    {fmtSignedUSD(p.pnl)} ({fmtPct(p.avg > 0 ? (p.pnl / (p.avg * p.qty)) * 100 : 0)})
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center font-sans text-xs text-faint">
                    Flat. Buy something.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "fills" && (
          <table className="w-full text-right font-mono text-[11px]">
            <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-faint">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Time</th>
                <th className="px-3 py-1.5 text-left font-medium">Symbol</th>
                <th className="px-3 py-1.5 font-medium">Side</th>
                <th className="px-3 py-1.5 font-medium">Price</th>
                <th className="px-3 py-1.5 font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {fills.map((t) => {
                const mine = t.buyerId === userId;
                return (
                  <tr key={t.id} className="row-flash border-t border-line/60">
                    <td className="px-3 py-1.5 text-left text-mute">{fmtClock(t.ts)}</td>
                    <td className="px-3 py-1.5 text-left text-[#eaecef]">{t.symbol}</td>
                    <td className={cx("px-3 py-1.5", mine ? "text-bull" : "text-bear")}>
                      {mine ? "Buy" : "Sell"}
                    </td>
                    <td className="px-3 py-1.5 text-[#eaecef]">{fmtPrice(t.price)}</td>
                    <td className="px-3 py-1.5 text-[#eaecef]">{fmtQty(t.qty)}</td>
                  </tr>
                );
              })}
              {fills.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center font-sans text-xs text-faint">
                    No fills yet this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
