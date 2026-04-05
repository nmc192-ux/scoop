/**
 * /api/market — Live currency rates, stock indices, and precious metals
 * Data sources:
 *   • Currency rates: open.er-api.com (free, no key)
 *   • Stocks + Metals: Yahoo Finance v7 quote API
 *
 * 15-minute in-memory cache to stay well within free-tier limits
 */

import express from "express";
import axios from "axios";
import { logger } from "../services/logger.js";

const router = express.Router();

// ─── In-memory cache ────────────────────────────────────────────────────────
let cache = { data: null, time: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchFxRates() {
  const { data } = await axios.get("https://open.er-api.com/v6/latest/USD", {
    timeout: 8000,
    headers: { Accept: "application/json" },
  });

  const r = data.rates || {};
  const pkr = r.PKR || 0;

  // All rates are "how many of this currency per 1 USD"
  // So PKR per 1 unit of foreign currency = pkr / r[code]
  return {
    USD: { code: "USD", name: "US Dollar",         rate: pkr },
    CAD: { code: "CAD", name: "Canadian Dollar",   rate: pkr / (r.CAD || 1) },
    GBP: { code: "GBP", name: "British Pound",     rate: pkr / (r.GBP || 1) },
    INR: { code: "INR", name: "Indian Rupee",      rate: pkr / (r.INR || 1) },
    AED: { code: "AED", name: "UAE Dirham",        rate: pkr / (r.AED || 1) },
    SAR: { code: "SAR", name: "Saudi Riyal",       rate: pkr / (r.SAR || 1) },
  };
}

// ── stooq.com market data (free, no API key, no rate limits) ────────────────
// Symbols:  ^SPX = S&P 500 | ^NDQ = NASDAQ | ^DJI = Dow Jones
//           ^UKX = FTSE 100 (UK)
//           XAUUSD = Gold spot (USD/oz) | XAGUSD = Silver spot (USD/oz)
// Note: KSE-100 (Pakistan) is not in stooq — omitted for now.

const STOOQ_SYMBOLS = [
  { sym: "^SPX",   name: "S&P 500",   isStock: true  },
  { sym: "^NDQ",   name: "NASDAQ",    isStock: true  },
  { sym: "^DJI",   name: "Dow Jones", isStock: true  },
  { sym: "^UKX",   name: "FTSE 100",  isStock: true  },
  { sym: "XAUUSD", name: "Gold",      isStock: false },
  { sym: "XAGUSD", name: "Silver",    isStock: false },
];

function parseStooqCsv(csv) {
  // CSV: Date,Open,High,Low,Close[,Volume]
  const lines = csv.trim().split("\n").filter((l) => l && !l.startsWith("Date"));
  if (lines.length === 0) return null;
  const last = lines[lines.length - 1].split(",");
  const prev = lines.length > 1 ? lines[lines.length - 2].split(",") : null;
  const price = parseFloat(last[4]);
  const prevPrice = prev ? parseFloat(prev[4]) : null;
  if (isNaN(price)) return null;
  const change    = prevPrice != null ? price - prevPrice : null;
  const changePct = prevPrice != null && prevPrice !== 0 ? ((price - prevPrice) / prevPrice) * 100 : null;
  return { price, change, changePct };
}

async function fetchOneStooq(sym) {
  const encoded = encodeURIComponent(sym);
  const url = `https://stooq.com/q/d/l/?s=${encoded}&i=d`;
  const { data } = await axios.get(url, {
    timeout: 8000,
    responseType: "text",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  return parseStooqCsv(data);
}

async function fetchMarketQuotes() {
  // Parallel fetch for all symbols
  const results = await Promise.allSettled(
    STOOQ_SYMBOLS.map((s) => fetchOneStooq(s.sym))
  );

  return STOOQ_SYMBOLS.map((s, i) => {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value) return null;
    return {
      symbol:    s.sym,
      name:      s.name,
      isStock:   s.isStock,
      price:     r.value.price,
      change:    r.value.change,
      changePct: r.value.changePct,
      currency:  "USD",
    };
  }).filter(Boolean);
}

// ─── Route ──────────────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    // Serve from cache if still fresh
    if (cache.data && Date.now() - cache.time < CACHE_TTL) {
      return res.json({ success: true, data: cache.data, cached: true });
    }

    // Parallel fetch — if one fails the other still succeeds
    const [fxResult, quotesResult] = await Promise.allSettled([
      fetchFxRates(),
      fetchMarketQuotes(),
    ]);

    const currencies = fxResult.status === "fulfilled" ? fxResult.value : {};
    const rawQuotes  = quotesResult.status === "fulfilled" ? quotesResult.value : [];

    if (fxResult.status === "rejected") {
      logger.warn("FX rates fetch failed", { error: fxResult.reason?.message });
    }
    if (quotesResult.status === "rejected") {
      logger.warn("Yahoo Finance fetch failed", { error: quotesResult.reason?.message });
    }

    // Separate stocks from metals based on isStock flag
    const stocks = [];
    const metals = {};

    for (const q of rawQuotes) {
      if (!q || q.price == null) continue;
      const item = { symbol: q.symbol, name: q.name, price: q.price, change: q.change, changePct: q.changePct, currency: q.currency };
      if (q.isStock) {
        stocks.push(item);
      } else if (q.name === "Gold") {
        metals.gold   = item;
      } else if (q.name === "Silver") {
        metals.silver = item;
      }
    }

    const payload = {
      currencies,
      stocks,
      metals,
      updatedAt: new Date().toISOString(),
    };

    cache = { data: payload, time: Date.now() };
    res.json({ success: true, data: payload, cached: false });

  } catch (err) {
    logger.error("Market data fetch error", { error: err.message });

    // Return stale cache if available rather than a hard error
    if (cache.data) {
      return res.json({ success: true, data: cache.data, cached: true, stale: true });
    }

    res.status(500).json({ success: false, error: "Failed to fetch market data" });
  }
});

export default router;
