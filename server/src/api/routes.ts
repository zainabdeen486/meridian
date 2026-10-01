import { Router, Request, Response, NextFunction } from "express";
import { Exchange, ApiError } from "../core/exchange.js";
import { OrderInput } from "../engine/types.js";

interface AuthedRequest extends Request {
  userId?: string;
}

export function createRouter(ex: Exchange): Router {
  const r = Router();

  r.get("/health", (_req, res) => {
    res.json({ ok: true, venue: "meridian", symbols: ex.symbols.map((s) => s.symbol) });
  });

  r.post("/auth/login", (req, res, next) => {
    try {
      const { name } = (req.body ?? {}) as { name?: unknown };
      res.json(ex.login(typeof name === "string" ? name : "Trader"));
    } catch (e) {
      next(e);
    }
  });

  const requireAuth = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;
    const userId = ex.userIdForToken(token);
    if (!userId) return next(new ApiError(401, "Missing or invalid auth token"));
    req.userId = userId;
    next();
  };

  r.get("/me", requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json({ portfolio: ex.portfolioView(req.userId!), orders: ex.openOrders(req.userId!) });
    } catch (e) {
      next(e);
    }
  });

  r.get("/symbols", (_req, res) => {
    res.json({ tickers: ex.tickers() });
  });

  r.get("/book/:symbol", (req, res, next) => {
    try {
      const book = ex.books.get(req.params.symbol);
      if (!book) throw new ApiError(400, "Unknown symbol");
      const depth = Math.min(Math.max(Number(req.query.depth) || 15, 1), 50);
      res.json({ symbol: req.params.symbol, last: book.lastPrice, ...book.snapshot(depth) });
    } catch (e) {
      next(e);
    }
  });

  r.get("/trades/:symbol", (req, res, next) => {
    try {
      const book = ex.books.get(req.params.symbol);
      if (!book) throw new ApiError(400, "Unknown symbol");
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json({ symbol: req.params.symbol, trades: book.recentTrades(limit) });
    } catch (e) {
      next(e);
    }
  });

  r.get("/candles/:symbol", (req, res, next) => {
    try {
      const res_ = typeof req.query.res === "string" ? req.query.res : "15s";
      const limit = Number(req.query.limit) || 160;
      res.json({ symbol: req.params.symbol, res: res_, candles: ex.candles(req.params.symbol, res_, limit) });
    } catch (e) {
      next(e);
    }
  });

  r.post("/orders", requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json(ex.placeOrder(req.userId!, req.body as OrderInput));
    } catch (e) {
      next(e);
    }
  });

  r.delete("/orders/:id", requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json({ order: ex.cancelOrder(req.userId!, req.params.id) });
    } catch (e) {
      next(e);
    }
  });

  r.get("/orders/open", requireAuth, (req: AuthedRequest, res, next) => {
    try {
      res.json({ orders: ex.openOrders(req.userId!) });
    } catch (e) {
      next(e);
    }
  });

  // JSON error handler for this router.
  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return r;
}
