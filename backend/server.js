import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { logger } from "./src/services/logger.js";
import { startScheduler, getSchedulerStatus } from "./src/services/scheduler.js";
import newsRouter      from "./src/routes/news.js";
import videosRouter    from "./src/routes/videos.js";
import translateRouter from "./src/routes/translate.js";
import { cacheMiddleware } from "./src/middleware/cache.js";
import { getDb } from "./src/models/database.js";
import { RSS_SOURCES, YOUTUBE_SOURCES } from "./src/config/sources.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 4000;
const app  = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3001")
    .split(",").map(o => o.trim()),
  methods: ["GET","POST"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 500,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: "Too many requests 🐢" },
});
app.use("/api/", limiter);

app.use((req, res, next) => {
  const t = Date.now();
  res.on("finish", () => {
    if (!req.path.includes("health") && !req.path.includes("events"))
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now()-t}ms`);
  });
  next();
});

// Routes
app.use("/api/news",      cacheMiddleware("medium"), newsRouter);
app.use("/api/videos",   cacheMiddleware("short"),  videosRouter);
app.use("/api/translate", translateRouter);

// Health
app.get("/api/health", (req, res) => {
  const scheduler = getSchedulerStatus();
  const db = getDb();
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    articles: db.prepare("SELECT COUNT(*) as n FROM articles").get().n,
    videos:   db.prepare("SELECT COUNT(*) as n FROM videos").get().n,
    scheduler,
    memory: {
      used:  Math.floor(process.memoryUsage().heapUsed  / 1024 / 1024) + "MB",
      total: Math.floor(process.memoryUsage().heapTotal / 1024 / 1024) + "MB",
    },
  });
});

// SSE live stream
app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const send = (ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  send("connected", { message: "📡 Connected to NewsFlow stream" });
  const hb = setInterval(() => send("heartbeat", { time: new Date().toISOString(), scheduler: getSchedulerStatus() }), 30000);
  req.on("close", () => clearInterval(hb));
});

// ── Serve frontend (production) ──────────────────────────────────────────
const distDir = path.join(__dirname, "../frontend/dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA catch-all — serve index.html for any non-/api route
  app.get(/^(?!\/api)/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}
// API 404
app.use((req, res) => res.status(404).json({ success: false, error: `Route ${req.path} not found 🤷` }));
app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(500).json({ success: false, error: "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`🚀 NewsFlow API → http://localhost:${PORT}`);
  logger.info(`📰 RSS sources: ${RSS_SOURCES.length}  |  📺 YouTube channels: ${YOUTUBE_SOURCES.length}`);
  logger.info(`⏰ Refresh: news every 30 min, videos every 60 min`);
  startScheduler();
});

process.on("SIGTERM", () => { logger.info("Shutting down..."); process.exit(0); });
process.on("SIGINT",  () => { logger.info("Shutting down..."); process.exit(0); });
