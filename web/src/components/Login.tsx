import { useState } from "react";
import { ConnStatus } from "../lib/useExchange";
import { cx } from "../lib/format";

const points = [
  "Real limit order-book matching engine — price-time priority, market & limit orders",
  "Live market-maker liquidity streaming over WebSocket",
  "Pre-trade risk checks, positions, fills and P&L on a $100k demo account",
];

/** Trader sign-in: pick a name, get a $100k demo account. */
export function Login({ onLogin, status }: { onLogin: (name: string) => Promise<void>; status: ConnStatus }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setError(null);
    setBusy(true);
    try {
      await onLogin(name.trim() || "Trader");
    } catch (e: any) {
      setError(e.message ?? "Could not reach the exchange.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-ink px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <rect x="7" y="13" width="5" height="12" rx="1" fill="#0ecb81" />
              <rect x="20" y="7" width="5" height="12" rx="1" fill="#f6465d" />
              <line x1="9.5" y1="6" x2="9.5" y2="28" stroke="#0ecb81" strokeWidth="1.6" />
              <line x1="22.5" y1="4" x2="22.5" y2="22" stroke="#f6465d" strokeWidth="1.6" />
            </svg>
            <span className="text-lg font-bold tracking-[0.25em]">MERIDIAN</span>
          </div>
          <h1 className="text-2xl font-semibold text-[#eaecef]">
            Trade against a real matching engine.
          </h1>
          <p className="mt-2 text-sm text-mute">
            A limit order-book exchange with live market data — pick a trader name to enter the pit.
          </p>
        </div>

        <div className="rounded-xl border border-line bg-panel p-6">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-faint">
            Trader name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="e.g. zain"
            maxLength={24}
            className="w-full rounded-md border border-line bg-ink px-3 py-2.5 text-sm text-[#eaecef] outline-none placeholder:text-faint focus:border-[#2f3a4d]"
          />
          <button
            onClick={go}
            disabled={busy}
            className="mt-3 w-full rounded-lg bg-bull py-2.5 text-sm font-semibold uppercase tracking-wider text-[#0b0e11] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Opening account…" : "Enter with $100,000 demo"}
          </button>
          {error && (
            <div className="mt-3 rounded-md bg-bear/10 px-3 py-2 text-xs text-bear">{error}</div>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-faint">
            <span
              className={cx(
                "inline-block h-1.5 w-1.5 rounded-full",
                status === "live" ? "bg-bull live-dot" : "bg-[#f0b90b]",
              )}
            />
            {status === "live" ? "Market data connected" : "Connecting to market data…"}
          </div>
        </div>

        <ul className="mt-6 space-y-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-xs text-mute">
              <span className="text-bull">▸</span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
