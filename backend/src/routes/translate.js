/**
 * /api/translate — text + HTML translation.
 *
 * Uses the multi-provider translator (DeepL → Google → MyMemory) with a
 * shared grammar-polish pass. Results are cached in SQLite so repeat calls
 * (same text + target) never hit the network.
 *
 * Endpoints:
 *   POST /api/translate        { texts: [...], lang, source? }  → { data: [...] }
 *   POST /api/translate/html   { html, lang, source? }          → { html }
 *   GET  /api/translate/single ?text=…&lang=…                   → { data: "…" }
 *   GET  /api/translate/cache-stats                             → { cached: N }
 */
import express from "express";
import { getDb } from "../models/database.js";
import { logger } from "../services/logger.js";
import { translate, availableProviders, polishText } from "../services/translator.js";

const router = express.Router();

// ─── Schema ────────────────────────────────────────────────────────────────
function initTranslationsTable() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS translations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      source_text TEXT NOT NULL,
      target_lang TEXT NOT NULL DEFAULT 'ur',
      translated  TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      UNIQUE(source_text, target_lang)
    );
    CREATE INDEX IF NOT EXISTS idx_trans_text ON translations(source_text, target_lang);
  `);
}
try { initTranslationsTable(); } catch {}

function getCached(text, lang) {
  try {
    return getDb().prepare(
      "SELECT translated FROM translations WHERE source_text = ? AND target_lang = ?"
    ).get(text, lang)?.translated || null;
  } catch { return null; }
}
function saveCache(text, lang, translated) {
  try {
    getDb().prepare(`
      INSERT OR REPLACE INTO translations (source_text, target_lang, translated, created_at)
      VALUES (?, ?, ?, ?)
    `).run(text, lang, translated, Date.now());
  } catch { /* cache is best-effort */ }
}

// ─── Core translate-with-cache ─────────────────────────────────────────────
async function translateCached(text, target, source = "auto") {
  if (!text || !text.trim() || !target) return text;
  const cached = getCached(text, target);
  if (cached) return cached;
  const translated = await translate(text, target, source);
  if (translated && translated !== text) saveCache(text, target, translated);
  return translated;
}

// ─── POST /api/translate — batch ────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { texts = [], lang = "ur", source = "auto" } = req.body;
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: "texts array required" });
    }
    if (texts.length > 40) {
      return res.status(400).json({ success: false, error: "Max 40 texts per request" });
    }

    const results = await Promise.all(texts.map((t) => translateCached(t, lang, source)));
    res.json({ success: true, data: results, lang });
  } catch (err) {
    logger.error("Translation error", { error: err.message });
    res.status(500).json({ success: false, error: "Translation failed" });
  }
});

// ─── POST /api/translate/html — translate a block of HTML ─────────────────
// Strategy: strip tags to extract text runs, translate runs in a single batch,
// then splice translated text back into the original markup at the matching
// text-node positions. Preserves <img>, <a>, <blockquote>, formatting etc.
router.post("/html", async (req, res) => {
  try {
    const { html = "", lang = "ur", source = "auto" } = req.body;
    if (!html || !lang) {
      return res.status(400).json({ success: false, error: "html and lang required" });
    }
    if (html.length > 200_000) {
      return res.status(400).json({ success: false, error: "html too large" });
    }

    const { runs, template } = splitHtmlRuns(html);
    if (!runs.length) return res.json({ success: true, html });

    // Translate runs in small batches to keep provider payloads reasonable.
    const translated = [];
    const CHUNK = 20;
    for (let i = 0; i < runs.length; i += CHUNK) {
      const batch = runs.slice(i, i + CHUNK);
      const out = await Promise.all(batch.map((t) => translateCached(t, lang, source)));
      translated.push(...out);
    }

    const outHtml = stitchHtmlRuns(template, translated);
    res.json({ success: true, html: outHtml, lang });
  } catch (err) {
    logger.error("HTML translation error", { error: err.message });
    res.status(500).json({ success: false, error: "HTML translation failed" });
  }
});

// ─── GET /api/translate/single ──────────────────────────────────────────────
router.get("/single", async (req, res) => {
  const { text, lang = "ur", source = "auto" } = req.query;
  if (!text) return res.status(400).json({ success: false, error: "text required" });
  try {
    const translated = await translateCached(String(text), String(lang), String(source));
    res.json({ success: true, data: translated });
  } catch (err) {
    res.status(500).json({ success: false, error: "Translation failed" });
  }
});

// ─── GET /api/translate/cache-stats ────────────────────────────────────────
router.get("/cache-stats", (req, res) => {
  try {
    const row = getDb().prepare("SELECT COUNT(*) as count FROM translations").get();
    res.json({ success: true, cached: row.count, providers: availableProviders() });
  } catch {
    res.json({ success: true, cached: 0, providers: availableProviders() });
  }
});

// ─── HTML ↔ text splitter ──────────────────────────────────────────────────
// Replaces each text node with a sentinel (`§§T0§§`, `§§T1§§` …) so we can
// translate text-only and splice back without re-parsing the markup.
function splitHtmlRuns(html) {
  const runs = [];
  const template = html.replace(
    /(<[^>]+>)|([^<]+)/g,
    (_m, tag, text) => {
      if (tag) return tag;
      const trimmed = text.replace(/\s+/g, " ");
      // Skip whitespace-only runs.
      if (!trimmed.trim()) return text;
      const idx = runs.length;
      runs.push(trimmed.trim());
      // Preserve surrounding whitespace to keep spacing natural.
      const leading  = text.match(/^\s*/)[0];
      const trailing = text.match(/\s*$/)[0];
      return `${leading}§§T${idx}§§${trailing}`;
    }
  );
  return { runs, template };
}

function stitchHtmlRuns(template, translated) {
  return template.replace(/§§T(\d+)§§/g, (_m, i) => {
    const idx = parseInt(i, 10);
    const t = translated[idx];
    return t ? polishText(t) : "";
  });
}

export default router;
