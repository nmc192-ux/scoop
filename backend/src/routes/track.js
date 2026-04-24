import express, { Router } from "express";
import crypto from "crypto";
import { trackEvent } from "../models/database.js";
import { logger } from "../services/logger.js";

const router = Router();

// sendBeacon from browsers submits as text/plain by default — accept that on
// this router so the dwell/unload paths work reliably.
router.use(express.text({ type: ["text/plain", "application/octet-stream"], limit: "8kb" }));
router.use((req, _res, next) => {
  if (typeof req.body === "string" && req.body.length > 0) {
    try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  }
  next();
});

// Whitelist of accepted event types. Anything else is silently dropped to
// keep the analytics table clean and prevent abuse.
const ALLOWED_EVENTS = new Set([
  "page_view",
  "article_view",
  "article_click_outbound",
  "share_click",
  "save_article",
  "unsave_article",
  "newsletter_signup_start",
  "newsletter_signup_complete",
  "search",
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "dwell_time_30s",
  "dwell_time_60s",
  "reader_open",
  "reader_close",
  "topic_select",
  "refresh_click",
]);

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 16);
}

function hashUa(ua) {
  if (!ua) return null;
  return crypto.createHash("sha256").update(String(ua)).digest("hex").slice(0, 16);
}

// POST /api/track — accepts a single event or a batch via { events: [...] }
// Body shape for a single event:
//   { event, articleId?, category?, metadata? }
// Privacy: IP + UA are SHA-256 hashed before storage.
router.post("/", (req, res) => {
  try {
    const ipHash = hashIp(req.ip);
    const uaHash = hashUa(req.get("user-agent"));
    const incoming = Array.isArray(req.body?.events) ? req.body.events : [req.body || {}];
    let accepted = 0;

    for (const ev of incoming) {
      const type = String(ev?.event || "").trim();
      if (!ALLOWED_EVENTS.has(type)) continue;
      const metadata = (ev.metadata && typeof ev.metadata === "object") ? ev.metadata : {};
      // Cap metadata payload to keep storage bounded (defensive against
      // untrusted client payloads).
      const safeMetadata = JSON.stringify(metadata).slice(0, 2000);
      trackEvent(type, {
        articleId: ev.articleId ? String(ev.articleId).slice(0, 64) : null,
        category:  ev.category  ? String(ev.category).slice(0, 40) : null,
        ipHash,
        uaHash,
        metadata: JSON.parse(safeMetadata),
      });
      accepted++;
    }
    res.json({ ok: true, accepted });
  } catch (err) {
    logger.warn("track failed", { error: err.message });
    // Never fail the client — tracking is best-effort.
    res.json({ ok: true, accepted: 0 });
  }
});

export default router;
