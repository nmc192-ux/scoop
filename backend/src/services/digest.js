/**
 * Daily newsletter digest.
 *
 * Runs from the scheduler (cron) at 07:00 server time. Picks the top articles
 * from the last 24h and sends a per-subscriber email, optionally filtered by
 * that subscriber's preferred topics.
 *
 * No-ops gracefully if SMTP is not configured (mailer returns null) or if
 * there are no verified, non-unsubscribed subscribers.
 */
import { getDb } from "../models/database.js";
import { getTransport, sendMail } from "./mailer.js";
import { logger } from "./logger.js";

const SITE_URL = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");
const PER_DIGEST = 8;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

function pickTopArticles(categories) {
  const db = getDb();
  const since = Date.now() - LOOKBACK_MS;
  if (categories && categories.length) {
    const ph = categories.map(() => "?").join(",");
    return db.prepare(`
      SELECT id, title, description, url, image_url, source_name, category, published_at
      FROM articles
      WHERE published_at >= ? AND category IN (${ph})
      ORDER BY credibility DESC, published_at DESC
      LIMIT ?
    `).all(since, ...categories, PER_DIGEST);
  }
  return db.prepare(`
    SELECT id, title, description, url, image_url, source_name, category, published_at
    FROM articles
    WHERE published_at >= ?
    ORDER BY credibility DESC, published_at DESC
    LIMIT ?
  `).all(since, PER_DIGEST);
}

function renderDigestHtml(articles, unsubUrl) {
  const items = articles.map((a) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #eee">
      <a href="${a.url}" style="color:#111;text-decoration:none">
        <div style="font-weight:700;font-size:15px;line-height:1.35;margin-bottom:4px">${escapeHtml(a.title)}</div>
      </a>
      <div style="font-size:12px;color:#666">${escapeHtml(a.source_name || "")} · ${escapeHtml(a.category || "")}</div>
      ${a.description ? `<div style="font-size:13px;color:#333;margin-top:6px;line-height:1.5">${escapeHtml(trim(a.description, 220))}</div>` : ""}
    </td></tr>
  `).join("");

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
      <div style="font-size:22px;font-weight:800;margin-bottom:4px">Scoop Daily</div>
      <div style="font-size:12px;color:#666;margin-bottom:18px">Top stories from the last 24 hours</div>
      <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
      <div style="margin-top:28px;font-size:12px;color:#888">
        <a href="${SITE_URL}" style="color:#007AFF">Open Scoop</a> ·
        <a href="${unsubUrl}" style="color:#888">Unsubscribe</a>
      </div>
    </div>
  `;
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function trim(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

export async function sendDailyDigest() {
  if (!getTransport()) {
    logger.info("digest: skipped (no SMTP configured)");
    return { sent: 0, skipped: true };
  }
  const db = getDb();
  const subs = db.prepare(`
    SELECT id, email, topics, token
    FROM subscribers
    WHERE verified_at IS NOT NULL AND unsubscribed_at IS NULL
  `).all();

  if (!subs.length) {
    logger.info("digest: no verified subscribers");
    return { sent: 0 };
  }

  let sent = 0;
  for (const sub of subs) {
    let topics = [];
    try { topics = JSON.parse(sub.topics || "[]"); } catch { /* ignore */ }
    const articles = pickTopArticles(topics.length ? topics : null);
    if (!articles.length) continue;

    const unsubUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${sub.token}`;
    try {
      await sendMail({
        to: sub.email,
        subject: `Scoop Daily — ${articles[0].title.slice(0, 60)}`,
        html: renderDigestHtml(articles, unsubUrl),
        text: articles.map((a) => `• ${a.title}\n  ${a.url}`).join("\n\n"),
      });
      db.prepare(`UPDATE subscribers SET last_sent_at = ? WHERE id = ?`).run(Date.now(), sub.id);
      sent++;
    } catch (err) {
      logger.warn(`digest: send failed for ${sub.email}: ${err.message}`);
    }
  }
  logger.info(`📬 Digest sent: ${sent}/${subs.length}`);
  return { sent, total: subs.length };
}
