import { useEffect, useRef, useState } from "react";
import { OrderType, Side, Trade } from "../lib/api";
import { cx, fmtPrice, fmtQty, fmtUSD } from "../lib/format";
import { PlaceInput } from "../lib/useExchange";

interface Props {
  symbol: string;
  last: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  cash: number | null;
  holding: number;
  onPlace: (input: PlaceInput) => Promise<{ ok: boolean; error?: string; trades?: Trade[] }>;
}

const inputCls =
  "w-full rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm text-[#eaecef] outline-none focus:border-[#2f3a4d] placeholder:text-faint";

/** Buy/sell ticket with buying-power-aware sizing. */
export function OrderForm({ symbol, last, bestBid, bestAsk, cash, holding, onPlace }: Props) {
  const [side, setSide] = useState<Side>("bid");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const priceTouched = useRef(false);

  // Seed the limit price from the touch until the trader types.
  useEffect(() => {
    priceTouched.current = false;
  }, [symbol, side]);
  useEffect(() => {
    if (priceTouched.current || type !== "limit") return;
    const touch = side === "bid" ? bestAsk : bestBid;
    if (touch != null) setPrice(touch.toFixed(2));
  }, [bestBid, bestAsk, side, type]);

  const refPrice = type === "market" ? last : parseFloat(price);
  const qtyNum = parseFloat(qty);
  const notional = Number.isFinite(refPrice) && Number.isFinite(qtyNum) ? refPrice! * qtyNum : null;

  const maxQty =
    side === "bid"
      ? cash != null && Number.isFinite(refPrice) && refPrice! > 0
        ? Math.floor((cash / refPrice!) * 10000) / 10000
        : 0
      : holding;

  const sizeByPct = (pct: number) => {
    if (maxQty <= 0) return;
    const q = Math.floor(maxQty * pct * 10000) / 10000;
    setQty(q > 0 ? String(q) : "");
  };

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (type === "limit" && (!Number.isFinite(refPrice) || refPrice! <= 0)) {
      setError("Enter a valid limit price.");
      return;
    }
    setBusy(true);
    const res = await onPlace({
      side,
      type,
      qty: qtyNum,
      ...(type === "limit" ? { price: Math.round(refPrice! * 100) / 100 } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Order rejected.");
      return;
    }
    const filled = res.trades?.reduce((s, t) => s + t.qty, 0) ?? 0;
    if (filled > 0) {
      const avg = res.trades!.reduce((s, t) => s + t.price * t.qty, 0) / filled;
      setNotice(
        `${side === "bid" ? "Bought" : "Sold"} ${fmtQty(filled)} ${symbol} @ ${fmtPrice(avg)}`,
      );
    } else {
      setNotice(`Working order placed on the ${side === "bid" ? "bid" : "ask"} side.`);
    }
    setQty("");
  };

  const buy = side === "bid";

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* side toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink p-1">
        {(["bid", "ask"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cx(
              "rounded-md py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
              side === s
                ? s === "bid"
                  ? "bg-bull/15 text-bull"
                  : "bg-bear/15 text-bear"
                : "text-mute hover:text-[#eaecef]",
            )}
          >
            {s === "bid" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      {/* type toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink p-1">
        {(["limit", "market"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cx(
              "rounded-md py-1 text-[11px] font-medium uppercase tracking-wider transition-colors",
              type === t ? "bg-panel2 text-[#eaecef]" : "text-faint hover:text-mute",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {type === "limit" && (
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-wider text-faint">Price</span>
          <input
            type="number"
            className={inputCls}
            placeholder="0.00"
            value={price}
            onChange={(e) => {
              priceTouched.current = true;
              setPrice(e.target.value);
            }}
          />
        </label>
      )}

      <label className="block">
        <span className="mb-1 block text-[10px] uppercase tracking-wider text-faint">Quantity</span>
        <input
          type="number"
          className={inputCls}
          placeholder="0"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </label>

      <div className="grid grid-cols-4 gap-1">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <button
            key={p}
            onClick={() => sizeByPct(p)}
            className="rounded bg-ink py-1 text-[10px] font-medium text-mute hover:bg-panel2 hover:text-[#eaecef]"
          >
            {p === 1 ? "MAX" : `${p * 100}%`}
          </button>
        ))}
      </div>

      <div className="space-y-1 text-[11px] text-mute">
        <div className="flex justify-between">
          <span>{buy ? "Buying power" : `Holding ${symbol}`}</span>
          <span className="font-mono text-[#eaecef]">
            {buy ? (cash != null ? fmtUSD(cash) : "—") : `${fmtQty(holding)} ${symbol}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Est. notional</span>
          <span className="font-mono text-[#eaecef]">{notional != null ? fmtUSD(notional) : "—"}</span>
        </div>
      </div>

      <button
        onClick={submit}
        disabled={busy || cash == null}
        className={cx(
          "rounded-lg py-2.5 text-sm font-semibold uppercase tracking-wider text-[#0b0e11] transition-opacity disabled:opacity-40",
          buy ? "bg-bull hover:opacity-90" : "bg-bear hover:opacity-90",
        )}
      >
        {busy ? "Routing…" : `${buy ? "Buy" : "Sell"} ${symbol}`}
      </button>

      {error && <div className="rounded-md bg-bear/10 px-3 py-2 text-xs text-bear">{error}</div>}
      {notice && !error && (
        <div className="rounded-md bg-bull/10 px-3 py-2 text-xs text-bull">{notice}</div>
      )}
      {cash == null && (
        <div className="text-center text-xs text-faint">Log in to trade.</div>
      )}
    </div>
  );
}
