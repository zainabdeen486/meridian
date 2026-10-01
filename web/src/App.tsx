import { useExchange, ConnStatus } from "./lib/useExchange";
import { Chart } from "./components/Chart";
import { OrderBook } from "./components/OrderBook";
import { TradesTape } from "./components/TradesTape";
import { OrderForm } from "./components/OrderForm";
import { BottomPanel } from "./components/BottomPanel";
import { Login } from "./components/Login";
import { cx, fmtNum, fmtPct, fmtPrice, fmtSignedUSD, fmtUSD } from "./lib/format";

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
      <rect x="7" y="13" width="5" height="12" rx="1" fill="#0ecb81" />
      <rect x="20" y="7" width="5" height="12" rx="1" fill="#f6465d" />
      <line x1="9.5" y1="6" x2="9.5" y2="28" stroke="#0ecb81" strokeWidth="1.6" />
      <line x1="22.5" y1="4" x2="22.5" y2="22" stroke="#f6465d" strokeWidth="1.6" />
    </svg>
  );
}

function ConnPill({ status }: { status: ConnStatus }) {
  return (
    <div
      className={cx(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider",
        status === "live" ? "bg-bull/10 text-bull" : "bg-[#f0b90b]/10 text-[#f0b90b]",
      )}
    >
      <span
        className={cx(
          "inline-block h-1.5 w-1.5 rounded-full",
          status === "live" ? "bg-bull live-dot" : "bg-[#f0b90b]",
        )}
      />
      {status === "live" ? "Live" : status === "reconnecting" ? "Reconnecting" : "Connecting"}
    </div>
  );
}

function PaneTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div
        className={cx(
          "font-mono text-sm",
          tone === "up" ? "text-bull" : tone === "down" ? "text-bear" : "text-[#eaecef]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default function App() {
  const ex = useExchange();

  if (!ex.token) {
    return <Login onLogin={ex.login} status={ex.status} />;
  }

  const ticker = ex.tickers.find((t) => t.symbol === ex.symbol);
  const up = (ticker?.change ?? 0) >= 0;
  const holding = ex.portfolio?.positions.find((p) => p.symbol === ex.symbol)?.qty ?? 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink text-[#eaecef]">
      {/* top bar */}
      <header className="flex h-14 shrink-0 items-center gap-5 border-b border-line px-4">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-bold tracking-[0.2em]">MERIDIAN</span>
          <span className="rounded bg-panel2 px-1.5 py-0.5 text-[9px] font-medium tracking-wider text-faint">
            DEMO VENUE
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {ex.tickers.map((t) => (
            <button
              key={t.symbol}
              onClick={() => ex.setSymbol(t.symbol)}
              className={cx(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                ex.symbol === t.symbol ? "bg-panel2 text-white" : "text-mute hover:text-white",
              )}
            >
              {t.symbol}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <ConnPill status={ex.status} />
          <div className="text-right">
            <div className="font-mono text-sm font-semibold">
              {ex.portfolio ? fmtUSD(ex.portfolio.equity) : "—"}
            </div>
            <div className="text-[9px] uppercase tracking-wider text-faint">Equity</div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-sm">{ex.traderName}</div>
            <div className="text-[9px] uppercase tracking-wider text-faint">Trader</div>
          </div>
          <button
            onClick={ex.logout}
            className="rounded-md border border-line px-2.5 py-1.5 text-xs text-mute hover:text-[#eaecef]"
          >
            Log out
          </button>
        </div>
      </header>

      {/* symbol stats */}
      <div className="flex h-[68px] shrink-0 items-center gap-8 border-b border-line px-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-faint">
            {ticker?.name ?? ex.symbol}
          </div>
          <div className={cx("font-mono text-[26px] font-semibold leading-8", up ? "text-bull" : "text-bear")}>
            {ticker ? fmtPrice(ticker.last) : "—"}
          </div>
        </div>
        <Stat
          label="24h Change"
          value={ticker ? `${fmtSignedUSD(ticker.change)}  ${fmtPct(ticker.changePct)}` : "—"}
          tone={up ? "up" : "down"}
        />
        <Stat label="24h High" value={ticker ? fmtPrice(ticker.high) : "—"} />
        <Stat label="24h Low" value={ticker ? fmtPrice(ticker.low) : "—"} />
        <Stat label="24h Volume" value={ticker ? fmtNum(ticker.volume) : "—"} />
      </div>

      {/* terminal grid */}
      <div className="flex min-h-0 flex-1">
        {/* chart + orders */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <Chart key={`${ex.symbol}-${ex.res}`} candles={ex.candles} symbol={ex.symbol} />
            <div className="absolute left-3 top-3 flex gap-1 rounded-lg bg-panel/90 p-1 backdrop-blur">
              {(["15s", "1m"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => ex.setRes(r)}
                  className={cx(
                    "rounded px-2 py-1 font-mono text-[11px] transition-colors",
                    ex.res === r ? "bg-panel2 text-white" : "text-faint hover:text-mute",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="h-60 shrink-0 border-t border-line bg-panel">
            <BottomPanel
              openOrders={ex.openOrders}
              positions={ex.portfolio?.positions ?? []}
              fills={ex.fills}
              userId={ex.userId}
              onCancel={ex.cancelOrder}
            />
          </div>
        </div>

        {/* order book */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
          <PaneTitle>Order Book</PaneTitle>
          <div className="min-h-0 flex-1">
            <OrderBook
              bids={ex.book?.bids ?? []}
              asks={ex.book?.asks ?? []}
              last={ex.book?.last ?? ticker?.last ?? null}
            />
          </div>
        </aside>

        {/* ticket + tape */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-panel">
          <PaneTitle>Ticket</PaneTitle>
          <div className="shrink-0">
            <OrderForm
              symbol={ex.symbol}
              last={ticker?.last ?? null}
              bestBid={ex.book?.bids[0]?.price ?? null}
              bestAsk={ex.book?.asks[0]?.price ?? null}
              cash={ex.portfolio?.cash ?? null}
              holding={holding}
              onPlace={ex.placeOrder}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-t border-line">
            <PaneTitle>Time &amp; Sales</PaneTitle>
            <div className="min-h-0 flex-1">
              <TradesTape trades={ex.trades} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
