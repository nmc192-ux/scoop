/**
 * Live Events synthesizer — builds the dossiers rendered on the "Live" tab.
 *
 * For each seeded event:
 *   1. Pull related articles from the DB (keyword OR-match, preferred-
 *      source boost). See findArticlesForEvent.
 *   2. Ask Gemini 1.5 Flash (free tier, 15 RPM) to collapse them into a
 *      timestamped point-wise brief + extract metric estimates. If no
 *      GEMINI_API_KEY is configured, fall back to a deterministic brief
 *      built straight from article headlines (no hallucination risk).
 *   3. Fetch live metrics (crude oil quote) and overlay them onto the
 *      LLM output.
 *   4. Cache the dossier in live_events (JSON blobs).
 *
 * Why Gemini 1.5 Flash: it's free, fast, and handles 30–50 article
 * excerpts in one prompt without hitting the free-tier rate limits when
 * refreshed hourly. Phase C will route this through a self-hosted model
 * on HF if the free tier is insufficient.
 */

import axios from "axios";
import { LIVE_EVENTS } from "../config/liveEvents.js";
import {
  findArticlesForEvent,
  upsertLiveEvent,
} from "../models/database.js";
import { logger } from "./logger.js";

const GEMINI_MODEL = "gemini-1.5-flash-latest";
const GEMINI_ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

// ─── Metric fetchers ───────────────────────────────────────────────────────

// Brent crude via Yahoo Finance v8 (same pattern used in routes/market.js).
// Returns { price, change, pctChange, currency, asOf } or null on failure.
async function fetchBrentCrude() {
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=5d";
  try {
    const { data } = await axios.get(url, {
      timeout: 6000,
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    const r = data?.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const change = price - prevClose;
    const pctChange = (change / prevClose) * 100;
    return {
      value: Number(price.toFixed(2)),
      unit: "USD/bbl",
      change: Number(change.toFixed(2)),
      pctChange: Number(pctChange.toFixed(2)),
      source: "Yahoo Finance (BZ=F)",
      asOf: new Date(meta.regularMarketTime * 1000).toISOString(),
    };
  } catch (err) {
    logger.warn("Brent crude fetch failed", { error: err.message });
    return null;
  }
}

function buildCeasefireTile(ceasefireIso) {
  if (!ceasefireIso) {
    return {
      value: null,
      unit: "—",
      note: "No active ceasefire agreement tracked",
      source: null,
    };
  }
  const ts = new Date(ceasefireIso).getTime();
  const now = Date.now();
  const ms = ts - now;
  if (ms < 0) {
    return { value: "Expired", unit: "", note: `Expired on ${new Date(ts).toDateString()}`, source: null };
  }
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return {
    value: `${days}d ${hours}h`,
    unit: "remaining",
    note: `Until ${new Date(ts).toDateString()}`,
    source: null,
  };
}

// ─── Gemini synthesizer ────────────────────────────────────────────────────

function buildPrompt(event, articles) {
  const items = articles.map((a, i) => {
    const when = new Date(a.published_at).toISOString();
    const desc = (a.description || "").slice(0, 400);
    return `[${i + 1}] ${when} — ${a.source_name} — ${a.title}\n    ${desc}\n    URL: ${a.url}`;
  }).join("\n\n");

  return `You are Scoop's live-events desk editor. Build a neutral, timestamped briefing on the "${event.title}".

Ground rules:
- Only use facts supported by the sources below. If a fact appears in just one source, flag it with "(single-source)".
- Order points newest first.
- Each point: 1-2 short sentences, specific, factual. No speculation, no adjectives like "shocking".
- Cite 1-3 source numbers per point as sourceIndices (1-based).
- Also return rough metric estimates if the sources support them. Use null when unknown — NEVER guess.

Return ONLY valid JSON with this exact shape:
{
  "summary": "One-sentence headline (max 140 chars)",
  "brief": [
    { "ts": "ISO-8601 timestamp", "text": "...", "sourceIndices": [1, 3] }
  ],
  "metrics": {
    "casualties":   { "value": <number or null>, "unit": "people", "note": "short qualifier" },
    "economicLoss": { "value": <number or null>, "unit": "USD",    "note": "..." }
  }
}

Sources:
${items}`;
}

async function synthesizeWithGemini(event, articles) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (articles.length === 0) return null;

  try {
    const prompt = buildPrompt(event, articles);
    const { data } = await axios.post(
      GEMINI_ENDPOINT(key),
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      },
      { timeout: 20000 }
    );
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text);
    // Attach source objects using the indices Gemini returned.
    const brief = (parsed.brief || []).map((p) => ({
      ts: p.ts,
      text: p.text,
      sources: (p.sourceIndices || [])
        .map((i) => articles[i - 1])
        .filter(Boolean)
        .map((a) => ({ name: a.source_name, url: a.url })),
    }));
    return {
      summary: parsed.summary || null,
      brief,
      metrics: parsed.metrics || {},
    };
  } catch (err) {
    logger.warn("Gemini synthesis failed", { event: event.id, error: err.message });
    return null;
  }
}

// Deterministic fallback — no LLM, no hallucination. Just the most recent
// headlines from preferred sources, presented as a timeline.
function fallbackSynthesize(event, articles) {
  const brief = articles.slice(0, 12).map((a) => ({
    ts: new Date(a.published_at).toISOString(),
    text: a.title,
    sources: [{ name: a.source_name, url: a.url }],
  }));
  const summary = articles.length > 0
    ? `${articles.length} recent updates from ${new Set(articles.slice(0, 10).map((a) => a.source_name)).size} outlets`
    : "No recent updates found in ingested feeds yet";
  return { summary, brief, metrics: {} };
}

// ─── Per-event refresh ─────────────────────────────────────────────────────

export async function refreshEvent(eventConfig) {
  const articles = findArticlesForEvent({
    keywords: eventConfig.keywords,
    preferredSources: eventConfig.preferredSources,
    limit: 30,
  });

  // Try LLM first, fall back to deterministic brief.
  let synth = await synthesizeWithGemini(eventConfig, articles);
  if (!synth) synth = fallbackSynthesize(eventConfig, articles);

  // Merge LLM metrics with live fetchers.
  const brent = await fetchBrentCrude();
  const metrics = {
    ...(eventConfig.baseline || {}),
    ...(synth.metrics || {}),
  };
  if (brent) metrics.crudeOil = brent;
  metrics.ceasefireClock = buildCeasefireTile(eventConfig.ceasefire);

  const ceasefireAt = eventConfig.ceasefire
    ? new Date(eventConfig.ceasefire).getTime()
    : null;

  upsertLiveEvent({
    id: eventConfig.id,
    title: eventConfig.title,
    subtitle: eventConfig.subtitle,
    emoji: eventConfig.emoji,
    status: eventConfig.status,
    region: eventConfig.region,
    brief: synth.brief,
    metrics,
    summary: synth.summary,
    updated_at: Date.now(),
    ceasefire_at: ceasefireAt,
  });

  return { id: eventConfig.id, briefCount: synth.brief.length, articlesUsed: articles.length };
}

export async function refreshAllEvents() {
  const results = [];
  for (const evt of LIVE_EVENTS) {
    try {
      results.push(await refreshEvent(evt));
    } catch (err) {
      logger.error("Event refresh failed", { event: evt.id, error: err.message });
    }
  }
  logger.info(`🛰️  Live events refreshed: ${results.length}`);
  return results;
}
