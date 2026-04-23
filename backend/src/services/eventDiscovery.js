/**
 * Event Discovery — proposes new "Live" events based on volume spikes
 * in the ingested article stream.
 *
 * The full vision (user's direction): "Scoop should be intelligent
 * enough to decide what events to include. Maybe rely on Twitter/X or
 * Google Trends…" Until we have a Trends API key wired up, we bootstrap
 * from what we already have in hand — our own ingested articles — and
 * flag the entity/phrase combinations that are seeing a sudden burst
 * of coverage across credible outlets.
 *
 * Phase C ships this as a read-only "candidates" endpoint so an editor
 * (or, later, an autopromote job) can decide which spikes graduate to
 * full dossiers. Phase D will add Google Trends + X trending-topics
 * signals on top.
 */

import { getDb } from "../models/database.js";
import { scoreFor } from "../config/mediaAuthenticity.js";
import { LIVE_EVENTS } from "../config/liveEvents.js";

// Stop-words we never want as entity candidates.
const STOP = new Set([
  "the","and","for","with","from","that","this","have","about","into","over",
  "been","after","before","will","than","them","says","said","today","news",
  "report","reports","update","updates","live","breaking","video","photos",
  "watch","here","could","would","should","according","amid","among","while",
  "what","when","where","who","why","how","his","her","its","our","your",
  "new","old","big","top","one","two","off","out","back","down","upon",
]);

function normalize(s) {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

// Very lightweight "entity" extraction — proper-noun bigrams/trigrams
// that occur with a real outlet's byline. Works shockingly well as a
// ranking signal because the names of evolving events ("gaza truce",
// "trump tariff", "south korea martial law") are naturally capitalized.
function extractCapPhrases(title) {
  const tokens = (title || "").split(/\s+/);
  const phrases = [];
  let current = [];
  for (const tok of tokens) {
    // Capitalized token (ignores the first token of a sentence by
    // requiring length ≥3 and non-stopword).
    const clean = tok.replace(/[^\p{L}\p{N}-]/gu, "");
    if (clean.length >= 3 && clean[0] === clean[0].toUpperCase() && !STOP.has(clean.toLowerCase())) {
      current.push(clean);
    } else {
      if (current.length >= 2) phrases.push(current.slice(0, 3).join(" "));
      current = [];
    }
  }
  if (current.length >= 2) phrases.push(current.slice(0, 3).join(" "));
  return phrases;
}

/**
 * Scan the last `windowHours` of articles and return candidate events
 * scored by (volume × source-diversity × authenticity). Candidates
 * already covered by a seed event (LIVE_EVENTS) are filtered out.
 */
export function discoverCandidates({ windowHours = 24, minArticles = 5, limit = 10 } = {}) {
  const db = getDb();
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;
  const rows = db.prepare(`
    SELECT title, source_name, category, published_at
    FROM articles WHERE published_at > ?
    ORDER BY published_at DESC
    LIMIT 1000
  `).all(cutoff);

  const phraseMap = new Map(); // phrase → { articles:Set, sources:Set, authSum:number }
  for (const row of rows) {
    const phrases = extractCapPhrases(row.title);
    for (const phrase of phrases) {
      const key = normalize(phrase);
      if (key.length < 5) continue;
      let entry = phraseMap.get(key);
      if (!entry) {
        entry = { display: phrase, articles: 0, sources: new Set(), authSum: 0 };
        phraseMap.set(key, entry);
      }
      entry.articles += 1;
      entry.sources.add(row.source_name);
      entry.authSum += scoreFor(row.source_name);
    }
  }

  // Existing event keywords — drop any candidate that overlaps substantially.
  const covered = new Set(
    LIVE_EVENTS.flatMap((e) => (e.keywords || []).map((k) => k.toLowerCase()))
  );

  const candidates = [];
  for (const [key, e] of phraseMap) {
    if (e.articles < minArticles) continue;
    if ([...covered].some((k) => key.includes(k))) continue;

    const diversity = e.sources.size;
    const avgAuth = e.authSum / e.articles;
    // Score: volume weighted by source diversity & avg authenticity.
    const score = e.articles * Math.log2(diversity + 1) * (avgAuth / 10);
    candidates.push({
      phrase: e.display,
      articles: e.articles,
      sources: diversity,
      avgAuthenticity: Number(avgAuth.toFixed(2)),
      score: Number(score.toFixed(2)),
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}
