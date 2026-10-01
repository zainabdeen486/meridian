export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const fmtUSD = (n: number): string => usd.format(n);

export const fmtSignedUSD = (n: number): string =>
  `${n >= 0 ? "+" : "-"}${usd.format(Math.abs(n))}`;

/** Prices: 2dp for equities, adaptive for BTC-scale. */
export const fmtPrice = (n: number): string =>
  n >= 1000
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(2);

export const fmtQty = (n: number): string =>
  n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : String(Math.round(n * 10000) / 10000);

export const fmtPct = (n: number): string =>
  `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export const fmtClock = (ts: number): string =>
  new Date(ts).toLocaleTimeString("en-US", { hour12: false });

export const fmtNum = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });
