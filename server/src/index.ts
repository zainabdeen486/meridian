import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Exchange } from "./core/exchange.js";
import { createRouter } from "./api/routes.js";
import { attachWs } from "./ws/hub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "meridian.db");

const ex = new Exchange(
  [
    { symbol: "AAPL", name: "Apple Inc.", basePrice: 232.4 },
    { symbol: "NVDA", name: "NVIDIA Corp.", basePrice: 141.2 },
    { symbol: "TSLA", name: "Tesla Inc.", basePrice: 248.1 },
    { symbol: "MSFT", name: "Microsoft Corp.", basePrice: 428.6 },
    { symbol: "BTCUSD", name: "Bitcoin / USD", basePrice: 97400 },
  ],
  DB_PATH,
);

const app = express();
app.use(express.json());
app.use("/api", createRouter(ex));

// Serve the built trading terminal (web/dist) in production.
const webDist = path.resolve(__dirname, "..", "..", "web", "dist");
app.use(express.static(webDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/ws")) return next();
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Meridian API — frontend not built yet. Run the web build.");
  });
});

const server = createServer(app);
attachWs(server, ex);
ex.start();

server.listen(PORT, () => {
  console.log(`Meridian exchange listening on :${PORT}`);
});

const shutdown = () => {
  ex.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
