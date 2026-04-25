// Picks the freshest, highest-credibility article that hasn't been pushed
// yet and broadcasts it to every active push subscription. Runs as a tail
// step inside the news-ingest cron so a story typically reaches subscribers
// within a single 30-min cycle of being published.
//
// Conservative on purpose:
//   - One push per cycle, max — never spam-bomb the device's notification tray
//   - Hard credibility floor (default 8) — bad sources can't trigger pushes
//   - Skip categories that read poorly as auto-pushes (death/violence framing)
//   - Per-article + topic dedupe via pushed_articles table
//   - Quiet hours: 22:00–07:00 server time, defer until morning
//
// The push payload deep-links into /article/{id} so opening the notification
// lands on the SSR detail page (better than the homepage for attribution).

import { findFreshUnpushedArticles, recordArticlePush } from "../models/database.js";
import { broadcastPush } from "./pushService.js";
import { logger } from "./logger.js";

// Categories where auto-broadcast is risky (sober tone needed, human review
// preferred). The breaking-news worker silently skips these.
const SKIP_CATEGORIES = new Set([
  // Add categories here when we have signal that auto-pushing is wrong-tone.
  // For now everything passes; specific blocklist will accrete with experience.
]);

// Headlines containing any of these substrings get held back. Lowercased
// match; the list is intentionally conservative to avoid false positives.
const HEADLINE_BLOCKLIST = [
  "killed",
  "dead",
  "shooting",
  "stabbed",
  "massacre",
  "suicide",
];

const QUIET_HOUR_START = Number(process.env.PUSH_QUIET_START ?? 22); // 22:00
const QUIET_HOUR_END   = Number(process.env.PUSH_QUIET_END   ?? 7);  // 07:00

function inQuietHours(now = new Date()) {
  const h = now.getHours();
  if (QUIET_HOUR_START === QUIET_HOUR_END) return false;
  if (QUIET_HOUR_START < QUIET_HOUR_END) return h >= QUIET_HOUR_START && h < QUIET_HOUR_END;
  return h >= QUIET_HOUR_START || h < QUIET_HOUR_END;
}

function isSafeToAutoPush(article) {
  if (!article || !article.title) return false;
  if (SKIP_CATEGORIES.has(article.category)) return false;
  const t = String(article.title).toLowerCase();
  if (HEADLINE_BLOCKLIST.some((k) => t.includes(k))) return false;
  return true;
}

function buildPayload(article) {
  const title = String(article.title || "Scoop").slice(0, 110);
  const desc  = String(article.description || "").trim();
  const body  = (desc || article.source_name || "").slice(0, 220);
  const url   = `/article/${encodeURIComponent(article.id)}?utm_source=push&utm_medium=push&utm_campaign=breaking`;
  return {
    title,
    body,
    url,
    icon: "/news-icon.svg",
    badge: "/news-icon.svg",
    tag: `scoop-${article.id}`,
    timestamp: Date.now(),
  };
}

// Public API: returns a result describing what (if anything) was pushed.
// Pass { dryRun: true } to skip the actual broadcast — useful for the admin
// preview endpoint and the smoke test.
export async function runBreakingNewsPush({ dryRun = false, minCredibility, withinMs } = {}) {
  if (inQuietHours()) {
    return { pushed: false, reason: "quiet_hours" };
  }

  const candidates = findFreshUnpushedArticles({
    minCredibility: minCredibility ?? 8,
    withinMs: withinMs ?? 30 * 60 * 1000,
    limit: 10,
  });

  const article = candidates.find(isSafeToAutoPush);
  if (!article) {
    return { pushed: false, reason: "no_candidate", candidates: candidates.length };
  }

  const payload = buildPayload(article);

  if (dryRun) {
    return { pushed: false, reason: "dry_run", article: { id: article.id, title: article.title }, payload };
  }

  const result = await broadcastPush(payload, { topic: article.category });
  recordArticlePush(article.id, "*", { sent: result.sent, failed: result.failed });

  logger.info(`📣 breaking push: "${article.title.slice(0, 60)}" → ${result.sent}/${result.total} subs`);
  return { pushed: true, article: { id: article.id, title: article.title }, payload, result };
}
