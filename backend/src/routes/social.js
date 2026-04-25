// Admin preview for the auto-generated social captions. Not linked from the
// public site — access by typing the URL directly. Optionally gated by the
// ADMIN_KEY env var: if set, requires `?key=<value>` on each request.
//
// Two endpoints:
//   GET /admin/social-queue.json  — machine-readable, for future cron/API posting
//   GET /admin/social-queue       — human-readable HTML, copy-paste friendly

import { Router } from "express";
import express from "express";
import { getDb, socialPostStats } from "../models/database.js";
import { composeAllPlatforms } from "../services/socialComposer.js";
import { runPlatformCycle, listEnabledPlatforms, runAllPlatformsCycle } from "../services/socialPublisher.js";

const router = Router();

const ADMIN_KEY = process.env.ADMIN_KEY || "";

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) return next();
  if (req.query.key === ADMIN_KEY) return next();
  res.status(404).type("html").send(
    `<!doctype html><html><head><title>Not found</title></head><body><h1>404</h1></body></html>`
  );
}

// Pick the day's top N articles — same logic the frontend uses for the
// featured rail, but capped at 12 so the admin page stays scannable.
function pickArticles(limit = 12) {
  const db = getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return db.prepare(`
    SELECT id, title, description, url, image_url, source_name, category, published_at
    FROM articles
    WHERE credibility >= 7 AND published_at > ?
    ORDER BY
      (published_at / 10800000) DESC,
      CASE category
        WHEN 'top'           THEN 1
        WHEN 'politics'      THEN 2
        WHEN 'pakistan'      THEN 3
        WHEN 'international' THEN 4
        WHEN 'science'       THEN 5
        WHEN 'ai'            THEN 6
        ELSE 7
      END ASC,
      credibility DESC, published_at DESC
    LIMIT ?
  `).all(cutoff, limit);
}

router.get("/social-queue.json", requireAdmin, (_req, res) => {
  const articles = pickArticles(12);
  const composed = articles.map((a) => {
    try { return composeAllPlatforms(a); } catch { return null; }
  }).filter(Boolean);
  res.json({ generatedAt: new Date().toISOString(), count: composed.length, items: composed });
});

router.get("/social-queue", requireAdmin, (_req, res) => {
  const articles = pickArticles(12);
  const composed = articles.map((a) => {
    try { return composeAllPlatforms(a); } catch { return null; }
  }).filter(Boolean);

  res.type("html").send(renderPage(composed));
});

// ── Auto-poster admin endpoints ────────────────────────────────────────
// JSON middleware needed for POST bodies; the queue routes above are GETs.
const jsonParser = express.json({ limit: "8kb" });

router.get("/auto-status", requireAdmin, (_req, res) => {
  res.json({
    ok: true,
    enabled: listEnabledPlatforms(),
    last24h: socialPostStats({ withinMs: 24 * 60 * 60 * 1000 }),
  });
});

// POST /admin/auto-post?platform=bluesky&dry=1
router.post("/auto-post", requireAdmin, jsonParser, async (req, res) => {
  const platform = (req.query.platform || req.body?.platform || "").toString();
  const dryRun = req.query.dry === "1" || req.body?.dry === true;
  try {
    if (platform) {
      const out = await runPlatformCycle(platform, { dryRun });
      return res.json({ ok: true, ...out });
    }
    const out = await runAllPlatformsCycle({ dryRun });
    res.json({ ok: true, results: out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function xmlEscape(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderPage(composed) {
  const now = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  const cards = composed.map((item, idx) => renderCard(item, idx)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Scoop · Social Queue</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; background: #f8f8fa; color: #111; line-height: 1.5; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0d; color: #e5e5e5; } .card, .platform { background: #141418 !important; border-color: #23232a !important; } textarea { background: #0b0b0d !important; color: #e5e5e5 !important; border-color: #2a2a33 !important; } }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px 60px; }
  h1 { font-size: 24px; margin: 0 0 6px; }
  .meta { font-size: 13px; color: #888; margin-bottom: 24px; }
  .card { background: #fff; border: 1px solid #e5e5e8; border-radius: 14px; padding: 16px; margin-bottom: 18px; }
  .hdr { display: flex; gap: 12px; margin-bottom: 12px; align-items: flex-start; }
  .hdr img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #eee; }
  .hdr h2 { font-size: 16px; line-height: 1.3; margin: 0 0 6px; }
  .hdr .tag { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 4px; background: #DC2626; color: #fff; font-weight: 700; margin-right: 6px; }
  .hdr .src { font-size: 12px; color: #666; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; }
  .platform { border: 1px solid #e5e5e8; border-radius: 10px; padding: 10px 12px; background: #fafafa; }
  .platform .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #DC2626; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
  .platform textarea { width: 100%; min-height: 90px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; padding: 6px 8px; border: 1px solid #e0e0e5; border-radius: 6px; resize: vertical; background: #fff; color: #111; box-sizing: border-box; }
  .platform .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 11px; color: #888; }
  .platform button { font-size: 11px; background: #DC2626; color: #fff; border: 0; padding: 3px 10px; border-radius: 999px; font-weight: 600; cursor: pointer; }
  .platform button:hover { opacity: 0.9; }
  .platform button.copied { background: #22c55e; }
  .platform .warn { color: #DC2626; font-weight: 600; }
  .note { font-size: 11px; color: #888; margin-top: 4px; font-style: italic; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Scoop · Social Queue</h1>
    <div class="meta">${composed.length} articles · generated ${xmlEscape(now)} · copy the caption you want, paste it on the platform.</div>
    ${cards}
  </div>
  <script>
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-copy]");
      if (!btn) return;
      const ta = document.getElementById(btn.dataset.copy);
      if (!ta) return;
      ta.select();
      navigator.clipboard.writeText(ta.value).then(() => {
        const old = btn.textContent;
        btn.textContent = "Copied ✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = old;
          btn.classList.remove("copied");
          window.getSelection()?.removeAllRanges();
        }, 1500);
      });
    });
  </script>
</body>
</html>`;
}

const PLATFORM_LIMITS = {
  x: 280,
  threads: 500,
  facebook: 63206,
  linkedin: 3000,
  instagram_feed: 2200,
  pinterest: 500,
  bluesky: 300,
};

function renderCard(item, idx) {
  const a = item.article;
  const platforms = Object.entries(item.platforms).map(([name, p]) => {
    const limit = PLATFORM_LIMITS[name] || 0;
    const over = limit && p.characterCount > limit;
    const id = `ta-${idx}-${name}`;
    return `
    <div class="platform">
      <div class="label">
        ${name.replace("_", " ")}
        <button data-copy="${id}">Copy</button>
      </div>
      <textarea id="${id}" readonly>${xmlEscape(p.caption)}</textarea>
      <div class="footer">
        <span ${over ? 'class="warn"' : ""}>${p.characterCount}${limit ? ` / ${limit}` : ""} chars</span>
        <a href="${xmlEscape(p.url)}" target="_blank" rel="noopener">open url →</a>
      </div>
      ${p.meta?.note ? `<div class="note">${xmlEscape(p.meta.note)}</div>` : ""}
    </div>`;
  }).join("");

  return `
  <section class="card">
    <div class="hdr">
      ${a.image_url ? `<img src="${xmlEscape(a.image_url)}" alt="" onerror="this.style.display='none'">` : ""}
      <div>
        <h2>${xmlEscape(a.title)}</h2>
        <span class="tag">${xmlEscape(a.category || "news")}</span>
        <span class="src">${xmlEscape(a.source_name || "")}</span>
      </div>
    </div>
    <div class="grid">${platforms}</div>
  </section>`;
}

export default router;
