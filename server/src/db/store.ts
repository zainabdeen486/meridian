import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Order, Trade } from "../engine/types.js";

/**
 * Every fill and order lifecycle event is persisted to SQLite
 * (Node's built-in node:sqlite — zero native dependencies).
 */
export class Store {
  private db: DatabaseSync;
  private insTrade;
  private insOrder;
  private updOrder;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY, symbol TEXT NOT NULL, price REAL NOT NULL,
        qty REAL NOT NULL, taker_side TEXT NOT NULL,
        buyer_id TEXT NOT NULL, seller_id TEXT NOT NULL, ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trades_symbol_ts ON trades(symbol, ts);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, symbol TEXT NOT NULL, user_id TEXT NOT NULL,
        side TEXT NOT NULL, type TEXT NOT NULL, price REAL,
        qty REAL NOT NULL, filled REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL, ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, ts);
    `);
    this.insTrade = this.db.prepare(
      `INSERT OR IGNORE INTO trades VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.insOrder = this.db.prepare(
      `INSERT OR IGNORE INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.updOrder = this.db.prepare(
      `UPDATE orders SET filled = ?, status = ? WHERE id = ?`,
    );
  }

  saveTrade(t: Trade): void {
    this.insTrade.run(t.id, t.symbol, t.price, t.qty, t.takerSide, t.buyerId, t.sellerId, t.ts);
  }

  saveOrder(o: Order): void {
    this.insOrder.run(o.id, o.symbol, o.userId, o.side, o.type, o.price, o.qty, o.filled, o.status, o.ts);
  }

  updateOrder(o: Order): void {
    this.updOrder.run(o.filled, o.status, o.id);
  }

  tradeCount(): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM trades`).get() as { n: number }).n;
  }

  close(): void {
    this.db.close();
  }
}
