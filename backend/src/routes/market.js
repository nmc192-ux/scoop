/**
 * /api/market — Live financial & business data hub
 *
 * Provides:
 *   • FX rates (PKR)      — open.er-api.com (free, no key)
 *   • Global indices      — Yahoo Finance v8 chart API (incl. sparklines)
 *   • Commodities         — Yahoo Finance v8 (WTI, Brent, Nat Gas, Copper)
 *   • Metals              — Yahoo Finance v8 (Gold, Silver, Platinum, Palladium)
 *   • Crypto              — CoinGecko /coins/markets with 7d sparkline
 *   • Fear & Greed Index  — alternative.me (crypto sentiment)
 *
 * 10-minute in-memory cache per section; Promise.allSettled so partial
 * failures don't break the response.
 */

import express from "express";
import axios from "axios";
import { logger } from "../services/logger.js";

const router = express.Router();

// ─── In-memory cache ────────────────────────────────────────────────────────
let cache = { data: null, time: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Common axios config — rotate through realistic UAs to avoid 429s
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const ax = axios.create({
  timeout: 9000,
  headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
});

// Shorter timeout for Yahoo (often blocks datacenter IPs → want fast failover)
const axFast = axios.create({
  timeout: 3500,
  headers: { "User-Agent": UA, Accept: "application/json, text/plain, */*" },
});

// ─── 1. FX rates (to PKR) ───────────────────────────────────────────────────
async function fetchFxRates() {
  const { data } = await ax.get("https://open.er-api.com/v6/latest/USD");
  const r = data.rates || {};
  const pkr = r.PKR || 0;
  const toPkr = (code) => (r[code] ? pkr / r[code] : null);

  return {
    USD: { code: "USD", name: "US Dollar",       rate: pkr              },
    EUR: { code: "EUR", name: "Euro",            rate: toPkr("EUR")     },
    GBP: { code: "GBP", name: "British Pound",   rate: toPkr("GBP")     },
    CAD: { code: "CAD", name: "Canadian Dollar", rate: toPkr("CAD")     },
    AUD: { code: "AUD", name: "Australian $",    rate: toPkr("AUD")     },
    JPY: { code: "JPY", name: "Japanese Yen",    rate: toPkr("JPY")     },
    CNY: { code: "CNY", name: "Chinese Yuan",    rate: toPkr("CNY")     },
    INR: { code: "INR", name: "Indian Rupee",    rate: toPkr("INR")     },
    AED: { code: "AED", name: "UAE Dirham",      rate: toPkr("AED")     },
    SAR: { code: "SAR", name: "Saudi Riyal",     rate: toPkr("SAR")     },
    TRY: { code: "TRY", name: "Turkish Lira",    rate: toPkr("TRY")     },
    CHF: { code: "CHF", name: "Swiss Franc",     rate: toPkr("CHF")     },
  };
}

// ─── 2. Yahoo Finance v8 chart API (quotes + sparkline) ────────────────────
// Returns { price, prevClose, changePct, currency, spark:[...] } or null
async function fetchYahooChart(symbol, range = "5d", interval = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    const { data } = await axFast.get(url);
    const r = data?.chart?.result?.[0];
    if (!r) return null;
    const meta = r.meta || {};
    const price     = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const changePct = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : null;
    const closes    = (r.indicators?.quote?.[0]?.close || []).filter((x) => x != null);
    return {
      price,
      prevClose,
      change: price != null && prevClose != null ? price - prevClose : null,
      changePct,
      currency: meta.currency || "USD",
      spark: closes.slice(-30),
    };
  } catch (e) {
    return null;
  }
}

// ─── 2b. Stooq fallback (datacenter-friendly) ──────────────────────────────
// Fetches last close from stooq.com CSV. Then fetches 30-day history for sparkline.
// Returns { price, prevClose, change, changePct, currency, spark:[...] } or null
async function fetchStooq(symbol, currency = "USD") {
  try {
    const s = encodeURIComponent(symbol.toLowerCase());
    // Single quote endpoint: Symbol,Date,Time,Open,High,Low,Close,Volume
    const { data: quoteCsv } = await ax.get(
      `https://stooq.com/q/l/?s=${s}&f=sd2t2ohlcv&h&e=csv`,
      { responseType: "text", headers: { Accept: "text/csv" } }
    );
    const lines = String(quoteCsv).trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const row = lines[1].split(",");
    // Stooq returns "N/D" for unknown/dead symbols
    if (row.slice(1).some((c) => c === "N/D")) return null;
    const close = parseFloat(row[6]);
    const open  = parseFloat(row[3]);
    if (!Number.isFinite(close) || close === 0) return null;

    // 30-day history for sparkline & prev close
    let spark = [];
    let prevClose = open || close;
    try {
      const { data: histCsv } = await ax.get(
        `https://stooq.com/q/d/l/?s=${s}&i=d`,
        { responseType: "text", headers: { Accept: "text/csv" } }
      );
      const hLines = String(histCsv).trim().split(/\r?\n/).slice(1);
      const closes = hLines.map((l) => parseFloat(l.split(",")[4])).filter((v) => Number.isFinite(v));
      spark = closes.slice(-30);
      if (closes.length >= 2) prevClose = closes[closes.length - 2];
    } catch {}

    return {
      price: close,
      prevClose,
      change: close - prevClose,
      changePct: prevClose ? ((close - prevClose) / prevClose) * 100 : null,
      currency,
      spark,
    };
  } catch (e) {
    return null;
  }
}

// Try Yahoo first; fall back to Stooq if Yahoo is blocked (e.g. on datacenter IPs)
async function fetchQuote(def) {
  const y = await fetchYahooChart(def.sym);
  if (y && y.price != null && y.price !== 0) return y;
  if (def.stooq) {
    const s = await fetchStooq(def.stooq, def.currency || "USD");
    if (s && s.price != null) return s;
  }
  return null;
}

// World indices — Pakistan indices come from PSX scraper (see fetchPsx())
// stooq codes are fallbacks when Yahoo blocks the request
const INDICES = [
  { sym: "^GSPC", stooq: "^spx", name: "S&P 500",     region: "US", flag: "🇺🇸", currency: "USD" },
  { sym: "^IXIC", stooq: "^ndq", name: "NASDAQ",      region: "US", flag: "🇺🇸", currency: "USD" },
  { sym: "^DJI",  stooq: "^dji", name: "Dow Jones",   region: "US", flag: "🇺🇸", currency: "USD" },
  { sym: "^FTSE", stooq: "^ukx", name: "FTSE 100",    region: "UK", flag: "🇬🇧", currency: "GBP" },
  { sym: "^GDAXI",stooq: "^dax", name: "DAX",         region: "DE", flag: "🇩🇪", currency: "EUR" },
  { sym: "^FCHI", stooq: "^cac", name: "CAC 40",      region: "FR", flag: "🇫🇷", currency: "EUR" },
  { sym: "^N225", stooq: "^nkx", name: "Nikkei 225",  region: "JP", flag: "🇯🇵", currency: "JPY" },
  { sym: "^HSI",  stooq: "^hsi", name: "Hang Seng",   region: "HK", flag: "🇭🇰", currency: "HKD" },
  { sym: "^BSESN",stooq: "^snx", name: "Sensex",      region: "IN", flag: "🇮🇳", currency: "INR" },
];

const COMMODITIES = [
  // Energy
  { sym: "CL=F", stooq: "cl.f", name: "Crude Oil (WTI)",  unit: "bbl",   icon: "🛢️", currency: "USD", group: "Energy" },
  { sym: "BZ=F", stooq: "cb.f", name: "Brent Crude",      unit: "bbl",   icon: "🛢️", currency: "USD", group: "Energy" },
  { sym: "NG=F", stooq: "ng.f", name: "Natural Gas",      unit: "MMBtu", icon: "🔥",  currency: "USD", group: "Energy" },
  { sym: "HO=F", stooq: "ho.f", name: "Heating Oil",      unit: "gal",   icon: "⛽",  currency: "USD", group: "Energy" },
  { sym: "RB=F", stooq: "rb.f", name: "RBOB Gasoline",    unit: "gal",   icon: "⛽",  currency: "USD", group: "Energy" },
  // Industrial metal (non-precious)
  { sym: "HG=F", stooq: "hg.f", name: "Copper",           unit: "lb",    icon: "🟤",  currency: "USD", group: "Metals" },
  // Grains
  { sym: "ZC=F", stooq: "zc.f", name: "Corn",             unit: "bu",    icon: "🌽",  currency: "USD", group: "Grains" },
  { sym: "ZW=F", stooq: "zw.f", name: "Wheat",            unit: "bu",    icon: "🌾",  currency: "USD", group: "Grains" },
  { sym: "ZS=F", stooq: "zs.f", name: "Soybeans",         unit: "bu",    icon: "🌱",  currency: "USD", group: "Grains" },
  // Softs
  { sym: "KC=F", stooq: "kc.f", name: "Coffee",           unit: "lb",    icon: "☕",  currency: "USD", group: "Softs" },
  { sym: "SB=F", stooq: "sb.f", name: "Sugar",            unit: "lb",    icon: "🍬",  currency: "USD", group: "Softs" },
  { sym: "CC=F", stooq: "cc.f", name: "Cocoa",            unit: "mt",    icon: "🍫",  currency: "USD", group: "Softs" },
  { sym: "CT=F", stooq: "ct.f", name: "Cotton",           unit: "lb",    icon: "🧺",  currency: "USD", group: "Softs" },
  // Livestock
  { sym: "LE=F", stooq: "le.f", name: "Live Cattle",      unit: "lb",    icon: "🐄",  currency: "USD", group: "Livestock" },
  { sym: "HE=F", stooq: "he.f", name: "Lean Hogs",        unit: "lb",    icon: "🐖",  currency: "USD", group: "Livestock" },
];

// Commodity indices (via broad ETFs, since stooq lacks direct index symbols)
const COMMODITY_INDICES = [
  { sym: "DBC",  stooq: "dbc.us", name: "DB Commodity Index",      note: "Broad basket (DBC ETF)",      icon: "📊", currency: "USD" },
  { sym: "GSG",  stooq: "gsg.us", name: "S&P GSCI Commodity",      note: "Energy-heavy (GSG ETF)",      icon: "📊", currency: "USD" },
  { sym: "DJP",  stooq: "djp.us", name: "Bloomberg Commodity",     note: "Diversified (DJP ETN)",       icon: "📊", currency: "USD" },
  { sym: "BNO",  stooq: "bno.us", name: "Brent Oil Fund",          note: "Brent proxy (BNO ETF)",       icon: "🛢️", currency: "USD" },
  { sym: "UNG",  stooq: "ung.us", name: "Natural Gas Fund",        note: "UNG ETF",                     icon: "🔥", currency: "USD" },
  { sym: "UGA",  stooq: "uga.us", name: "Gasoline Fund",           note: "UGA ETF",                     icon: "⛽", currency: "USD" },
  { sym: "DBA",  stooq: "dba.us", name: "Agriculture Fund",        note: "DBA ETF",                     icon: "🌾", currency: "USD" },
  { sym: "PDBC", stooq: "pdbc.us",name: "Optimum Yield Commodity", note: "PDBC ETF",                    icon: "📊", currency: "USD" },
];

const METALS = [
  { sym: "GC=F", stooq: "gc.f", key: "gold",      name: "Gold",      icon: "🥇", currency: "USD" },
  { sym: "SI=F", stooq: "si.f", key: "silver",    name: "Silver",    icon: "🥈", currency: "USD" },
  { sym: "PL=F", stooq: "pl.f", key: "platinum",  name: "Platinum",  icon: "⚪", currency: "USD" },
  { sym: "PA=F", stooq: "pa.f", key: "palladium", name: "Palladium", icon: "⚫", currency: "USD" },
];

async function fetchList(defs) {
  // Serialize with small delay to avoid Stooq rate-limiting
  const out = [];
  for (const d of defs) {
    try {
      const r = await fetchQuote(d);
      if (r && r.price != null) out.push({ ...d, ...r });
    } catch {}
    await new Promise((res) => setTimeout(res, 120));
  }
  return out;
}

// ─── 3. Pakistan Stock Exchange (scraped from dps.psx.com.pk) ───────────────
const PSX_NAMES = {
  KSE100: "KSE-100",
  KSE30:  "KSE-30",
  KMI30:  "KMI-30",
  ALLSHR: "All Share",
};
async function fetchPsx() {
  const { data: html } = await ax.get("https://dps.psx.com.pk/indices", {
    responseType: "text",
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  const re = /<div class="topIndices__item__name">([^<]+)<\/div><div class="topIndices__item__val">([^<]+)<\/div><\/div><div class="[^"]+"><div class="topIndices__item__change">[^<]*<i class="([^"]+)"><\/i>\s*([\-0-9,.]+)<\/div><div class="topIndices__item__changep">\(([^)]+)\)/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, code, priceStr, dir, changeStr, pctStr] = m;
    if (!PSX_NAMES[code]) continue;
    const price     = parseFloat(priceStr.replace(/,/g, ""));
    const change    = parseFloat(changeStr.replace(/,/g, ""));
    const changePct = parseFloat(pctStr.replace(/[%\s]/g, ""));
    if (Number.isNaN(price)) continue;
    out.push({
      sym: code, name: PSX_NAMES[code],
      region: "PK", flag: "🇵🇰",
      price, change, changePct,
      currency: "PKR",
      spark: [],
    });
  }
  return out;
}

// ─── 4. Crypto via CoinGecko ────────────────────────────────────────────────
async function fetchCrypto() {
  const ids = [
    "bitcoin", "ethereum", "binancecoin", "solana",
    "ripple",  "dogecoin", "cardano",     "tron",
  ].join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h`;
  const { data } = await ax.get(url);
  return (data || []).map((c) => ({
    id:         c.id,
    symbol:     c.symbol?.toUpperCase(),
    name:       c.name,
    image:      c.image,
    price:      c.current_price,
    changePct:  c.price_change_percentage_24h,
    marketCap:  c.market_cap,
    volume24h:  c.total_volume,
    high24h:    c.high_24h,
    low24h:     c.low_24h,
    spark:      (c.sparkline_in_7d?.price || []).filter((v, i, a) => i % 4 === 0).slice(-30),
  }));
}

// ─── 4. Crypto Fear & Greed Index ──────────────────────────────────────────
async function fetchFearGreed() {
  const { data } = await ax.get("https://api.alternative.me/fng/?limit=1");
  const d = data?.data?.[0];
  if (!d) return null;
  return {
    value:          parseInt(d.value, 10),
    classification: d.value_classification,  // Extreme Fear / Fear / Neutral / Greed / Extreme Greed
    timestamp:      parseInt(d.timestamp, 10) * 1000,
  };
}

// ─── Route ──────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.time < CACHE_TTL) {
      return res.json({ success: true, data: cache.data, cached: true });
    }

    const [fxR, idxR, psxR, commR, cidxR, metR, cryR, fgR] = await Promise.allSettled([
      fetchFxRates(),
      fetchList(INDICES),
      fetchPsx(),
      fetchList(COMMODITIES),
      fetchList(COMMODITY_INDICES),
      fetchList(METALS),
      fetchCrypto(),
      fetchFearGreed(),
    ]);

    const currencies   = fxR.status   === "fulfilled" ? fxR.value   : {};
    const globalIndices = idxR.status === "fulfilled" ? idxR.value  : [];
    const psxIndices    = psxR.status === "fulfilled" ? psxR.value  : [];
    const indices       = [...psxIndices, ...globalIndices];
    const commodities      = commR.status  === "fulfilled" ? commR.value  : [];
    const commodityIndices = cidxR.status === "fulfilled" ? cidxR.value : [];
    const metalsList  = metR.status  === "fulfilled" ? metR.value  : [];
    const crypto      = cryR.status  === "fulfilled" ? cryR.value  : [];
    const fearGreed   = fgR.status   === "fulfilled" ? fgR.value   : null;

    // Map metals list to named object (for backward compat + nicer UX)
    const metals = {};
    for (const m of metalsList) metals[m.key] = m;

    // Keep legacy `stocks` field so older clients don't break
    const stocks = indices.map((i) => ({
      symbol: i.sym, name: i.name,
      price: i.price, change: i.change, changePct: i.changePct,
      currency: i.currency,
    }));

    const payload = {
      currencies,
      indices,
      commodities,
      commodityIndices,
      metals,
      crypto,
      fearGreed,
      stocks, // legacy
      updatedAt: new Date().toISOString(),
    };

    // Log partial failures for observability
    for (const [label, r] of [["fx", fxR], ["indices", idxR], ["psx", psxR], ["commodities", commR], ["commodityIndices", cidxR], ["metals", metR], ["crypto", cryR], ["fearGreed", fgR]]) {
      if (r.status === "rejected") logger.warn(`market: ${label} fetch failed`, { error: r.reason?.message });
    }

    cache = { data: payload, time: Date.now() };
    res.json({ success: true, data: payload, cached: false });
  } catch (err) {
    logger.error("Market data fetch error", { error: err.message });
    if (cache.data) return res.json({ success: true, data: cache.data, cached: true, stale: true });
    res.status(500).json({ success: false, error: "Failed to fetch market data" });
  }
});

export default router;
