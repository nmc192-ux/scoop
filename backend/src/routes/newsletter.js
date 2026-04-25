/**
 * /api/newsletter — subscribe / unsubscribe / preview digest.
 *
 * Storage: `subscribers` table (see database.js).
 * Delivery: nodemailer via SMTP (optional — if no SMTP env, subscribes are
 * accepted and stored but email sending is skipped with a warning).
 *
 * Required env (when you want real sending):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   NEWSLETTER_FROM  (e.g. "Scoop <digest@scoopfeeds.com>")
 *   PRIMARY_SITE_URL (defaults to https://scoopfeeds.com)
 */
import { Router } from "express";
import crypto from "crypto";
import { getDb } from "../models/database.js";
import { getReferralCount } from "../models/database.js";
import { logger } from "../services/logger.js";
import { getTransport, sendMail } from "../services/mailer.js";

const router = Router();

const SITE_URL = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}
function isEmail(s) {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ─── Subscribe ──────────────────────────────────────────────────────────────
router.post("/subscribe", async (req, res) => {
  const { email, countryCode, language, topics, referredBy } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ success: false, error: "Invalid email" });

  const db = getDb();
  const now = Date.now();
  const token = randomToken();
  const topicsJson = JSON.stringify(Array.isArray(topics) ? topics.slice(0, 20) : []);
  // Validate referredBy is a plausible token string (hex, 48 chars) to prevent injection.
  const refToken = (typeof referredBy === "string" && /^[0-9a-f]{48}$/.test(referredBy))
    ? referredBy : null;

  try {
    db.prepare(`
      INSERT INTO subscribers (email, country_code, language, topics, token, referred_by_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        country_code = excluded.country_code,
        language     = excluded.language,
        topics       = excluded.topics,
        referred_by_token = COALESCE(referred_by_token, excluded.referred_by_token),
        unsubscribed_at = NULL
    `).run(
      email.toLowerCase(),
      countryCode || null,
      language   || "en",
      topicsJson,
      token,
      refToken,
      now
    );

    // Best-effort welcome email
    if (getTransport()) {
      const confirmUrl = `${SITE_URL}/api/newsletter/confirm?token=${token}`;
      const unsubUrl   = `${SITE_URL}/api/newsletter/unsubscribe?token=${token}`;
      sendMail({
        to: email,
        subject: "Welcome to Scoop — confirm your subscription",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:540px;margin:auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">Welcome to Scoop 📰</h2>
            <p>Thanks for subscribing to the Scoop daily digest. Tap below to confirm your email:</p>
            <p><a href="${confirmUrl}" style="display:inline-block;background:#007AFF;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
            <p style="font-size:12px;color:#666;margin-top:24px">
              Didn't sign up? <a href="${unsubUrl}">Unsubscribe</a> — we'll stop immediately.
            </p>
          </div>
        `,
      }).catch(err => logger.warn(`welcome email failed: ${err.message}`));
    } else {
      logger.info(`newsletter: no SMTP configured, storing subscriber ${email} without sending welcome`);
    }

    res.json({ success: true, token });
  } catch (err) {
    logger.error(`subscribe failed: ${err.message}`);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ─── Confirm (token) ────────────────────────────────────────────────────────
router.get("/confirm", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Missing token");
  const db = getDb();
  const result = db.prepare(`UPDATE subscribers SET verified_at = ? WHERE token = ?`)
    .run(Date.now(), token);
  if (result.changes === 0) return res.status(404).send("Invalid token");
  res.redirect(302, `${SITE_URL}/?newsletter=confirmed`);
});

// ─── Unsubscribe (token) ────────────────────────────────────────────────────
router.get("/unsubscribe", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Missing token");
  const db = getDb();
  const result = db.prepare(`UPDATE subscribers SET unsubscribed_at = ? WHERE token = ?`)
    .run(Date.now(), token);
  if (result.changes === 0) return res.status(404).send("Invalid token");
  res.send(`
    <!doctype html><meta charset="utf-8">
    <title>Unsubscribed — Scoop</title>
    <body style="font-family:system-ui,sans-serif;max-width:420px;margin:80px auto;padding:24px;text-align:center">
      <h2>You're unsubscribed</h2>
      <p>We won't send you any more digests. You can resubscribe anytime at
         <a href="${SITE_URL}">${new URL(SITE_URL).hostname}</a>.</p>
    </body>
  `);
});

// ─── Referral stats (per subscriber token) ──────────────────────────────────
// Used by the frontend "invite friends" card to show live referral count.
router.get("/referral-stats", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token || !/^[0-9a-f]{48}$/.test(token)) {
    return res.status(400).json({ success: false, error: "Invalid token" });
  }
  const referrals = getReferralCount(token);
  const referralUrl = `${SITE_URL}/?ref=${token}`;
  res.json({ success: true, referrals, referralUrl });
});

// ─── Preview (admin) ────────────────────────────────────────────────────────
router.get("/preview", (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, email, country_code, language, topics, verified_at, unsubscribed_at, created_at
    FROM subscribers ORDER BY created_at DESC LIMIT 50
  `).all();
  res.json({ success: true, count: rows.length, subscribers: rows });
});

export default router;
