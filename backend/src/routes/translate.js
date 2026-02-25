import express from "express";
import axios from "axios";
import { getDb } from "../models/database.js";
import { logger } from "../services/logger.js";

const router = express.Router();
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
// Email param gives 10,000 words/day instead of 1,000
const MYMEMORY_EMAIL = "khabari.app@gmail.com";

// ─── Global serial queue — prevents parallel MyMemory API calls ───────────
let translationQueue = Promise.resolve();
function enqueue(fn) {
  translationQueue = translationQueue.then(fn).catch(() => {});
  return translationQueue;
}

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

function getCached(text, lang) {
  try {
    return getDb().prepare(
      "SELECT translated FROM translations WHERE source_text = ? AND target_lang = ?"
    ).get(text, lang);
  } catch { return null; }
}

function saveCache(text, lang, translated) {
  try {
    getDb().prepare(`
      INSERT OR REPLACE INTO translations (source_text, target_lang, translated, created_at)
      VALUES (?, ?, ?, ?)
    `).run(text, lang, translated, Date.now());
  } catch {}
}

// ─── Core translate function (with global queue + email param) ─────────────
async function translateText(text, targetLang = "ur") {
  if (!text || text.trim().length === 0) return text;

  // Check SQLite cache first — no API call needed
  const cached = getCached(text, targetLang);
  if (cached) return cached.translated;

  // Use global queue so only one MyMemory call happens at a time
  return new Promise((resolve) => {
    translationQueue = translationQueue.then(async () => {
      try {
        const { data } = await axios.get(MYMEMORY_URL, {
          params: {
            q:        text.slice(0, 500),
            langpair: `en|${targetLang}`,
            de:       MYMEMORY_EMAIL,   // registered email = 10x quota
          },
          timeout: 10000,
        });

        const translated = data?.responseData?.translatedText || text;

        // MyMemory returns error strings or repeats source on quota-exceed
        if (
          translated.startsWith("PLEASE SELECT") ||
          translated === text ||
          data?.responseStatus === 429
        ) {
          resolve(text);
          return;
        }

        saveCache(text, targetLang, translated);
        resolve(translated);
      } catch (err) {
        logger.warn(`Translation failed: ${err.message}`);
        resolve(text);
      }
      // 200ms between API calls to stay within rate limits
      await new Promise(r => setTimeout(r, 200));
    });
  });
}

// ─── POST /api/translate ────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { texts = [], lang = "ur" } = req.body;
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: "texts array required" });
    }
    if (texts.length > 20) {
      return res.status(400).json({ success: false, error: "Max 20 texts per request" });
    }

    // Serve all cache hits immediately, only queue uncached
    const results = await Promise.all(
      texts.map(text => translateText(text, lang))
    );

    res.json({ success: true, data: results, lang });
  } catch (err) {
    logger.error("Translation error", { error: err.message });
    res.status(500).json({ success: false, error: "Translation failed" });
  }
});

// ─── GET /api/translate/single ──────────────────────────────────────────────
router.get("/single", async (req, res) => {
  const { text, lang = "ur" } = req.query;
  if (!text) return res.status(400).json({ success: false, error: "text required" });
  try {
    const translated = await translateText(text, lang);
    res.json({ success: true, data: translated });
  } catch (err) {
    res.status(500).json({ success: false, error: "Translation failed" });
  }
});

// ─── GET /api/translate/cache-stats ────────────────────────────────────────
router.get("/cache-stats", (req, res) => {
  try {
    const row = getDb().prepare("SELECT COUNT(*) as count FROM translations").get();
    res.json({ success: true, cached: row.count });
  } catch {
    res.json({ success: true, cached: 0 });
  }
});

// Initialize table on load
try { initTranslationsTable(); } catch {}

export default router;
