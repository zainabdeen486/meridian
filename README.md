# Meridian — Limit Order-Book Exchange + Live Trading Terminal

A real electronic exchange: a **limit order-book matching engine** in Node.js/TypeScript with
**price-time priority**, live **market-maker liquidity**, a **WebSocket** market-data feed, and a
Binance-style **trading terminal** (React + lightweight-charts). One deploy serves everything —
REST API, WebSocket, and the frontend.

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   React     │◄────│  Express + ws        │◄────│  Market makers  │
│   terminal  │ WS  │  REST / WebSocket    │     │  (per symbol)   │
└─────────────┘     └──────────────────────┘     └─────────────────┘
                             │                            │
                    ┌────────┴────────┐          ┌────────┴────────┐
                    │  Matching engine │          │  SQLite (fills, │
                    │  price-time      │          │  order history) │
                    │  priority        │          └─────────────────┘
                    └─────────────────┘
```

## The matching engine (`server/src/engine/`)

- Central limit order book per symbol. Bids rest highest-first, asks lowest-first (binary-search insertion).
- Incoming orders match against the opposite side in **price-time priority**: best price first, earliest order at a price first.
- Limit orders that don't cross rest on the book; market orders (and any remainder) are IOC.
- 8 unit tests cover crossing, multi-level sweeps, time priority, price priority, cancel, aggregation (`npm test`).

## Market simulation (`server/src/market/`)

- A market-maker bot per symbol keeps a 6-level ladder of quotes around a mean-reverting random-walk mid and never crosses resting user orders.
- Random taker flow prints to the tape so the market is alive with zero humans connected.
- OHLCV candles (15s + 1m) built from the trade tape, seeded with 140 buckets of history.

## API

REST (`/api`): `POST /auth/login`, `GET /me`, `GET /symbols`, `GET /book/:symbol`,
`GET /trades/:symbol`, `GET /candles/:symbol?res=15s|1m`, `POST /orders`, `DELETE /orders/:id`,
`GET /orders/open`. Pre-trade risk checks: no leverage, no shorting.

WebSocket (`/ws`, JSON): `{ op: "auth"|"sub"|"unsub" }` →
`{ ch: "ticker"|"book"|"trades"|"candle"|"candles"|"fill"|"order"|"auth" }`.
Book snapshots are coalesced into 300ms frames; tickers + live candles push every second.

## Run it

```bash
npm --prefix server install && npm --prefix web install
npm run build        # builds web/ then server/
npm start            # serves the terminal + API on :4000
```

Dev mode (hot reload, vite proxy for `/api` + `/ws`):

```bash
# terminal 1
npm run dev:server   # tsx watch, :4000
# terminal 2
npm run dev:web      # vite, :5174
```

## Deploy

### Koyeb (free, no credit card — recommended)

1. Sign up at [koyeb.com](https://koyeb.com) with GitHub (no card needed for the free tier).
2. **Create Web Service** → select the `meridian` repo → **Builder: Dockerfile**.
3. Instance type: **Free** (0.1 vCPU / 512 MB). Region: Frankfurt or Washington.
4. Deploy. Koyeb injects `PORT` automatically; the server picks it up. WebSockets work out of the box.

### Render (free tier, card required)

1. Push this repo to GitHub.
2. Render Dashboard → New → **Blueprint** → select the repo (`render.yaml` is at the root).
3. Done — one web service builds and serves the whole stack.

## Stack

TypeScript, Node 24 (native `node:sqlite`), Express, `ws`, React 19, Vite, Tailwind v4,
lightweight-charts v5. No ORM, no framework magic on the server — the book, the matcher
and the feed are hand-rolled.
