/**
 * welcomeSequence.js — multi-stage welcome email sequence for new subscribers.
 *
 * Day 0 confirmation is sent inline by /api/newsletter/subscribe. This module
 * handles the follow-up touches that warm up the relationship:
 *
 *   Day 1 (≥ 18h after verification): "Here's what we send" — sets
 *     expectations on cadence + content so people don't unsubscribe at the
 *     first digest because it wasn't what they were looking for.
 *   Day 3 (≥ 60h after verification): "Pick your topics" — nudges to set
 *     preferences so the digest can personalize. Also gives them an excuse
 *     to come back to the site.
 *
 * Triggered hourly by the scheduler (`runWelcomeSequenceCycle`). Safe to
 * call repeatedly — `welcome_d{1,3}_sent_at` columns ensure each email
 * only fires once per subscriber.
 *
 * No-op when SMTP is not configured (returns 0 sends rather than crashing).
 */

import {
  findWelcomeRecipients,
  markWelcomeSent,
} from "../models/database.js";
import { getTransport, sendMail } from "./mailer.js";
import { logger } from "./logger.js";

const SITE_URL = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");

// Email body templates — kept inline so each stage is one self-contained file.
function renderD1Email({ email, token }) {
  const unsubUrl = `${SITE_URL}/api/newsletter/unsubscribe?token=${token}`;
  return {
    subject: "What to expect from Scoop ☕",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#111;line-height:1.6">
        <h2 style="margin:0 0 14px;font-size:22px">Welcome aboard 🐾</h2>
        <p style="margin:0 0 14px">You're confirmed and on the list. Quick rundown of what's coming your way:</p>
        <ul style="padding-left:22px;margin:0 0 18px">
          <li><strong>One digest every weekday at 7am.</strong> The day's biggest stories — politics, AI, science, your country's headlines — synthesized so you can scan in 60 seconds.</li>
          <li><strong>No noise.</strong> We aggregate from credible sources only and skip clickbait. If a topic doesn't have substantive news, we leave it out.</li>
          <li><strong>One sponsor slot at the top, clearly labeled.</strong> That's how Scoop stays free and independent.</li>
          <li><strong>Cross-source synthesis.</strong> When multiple newsrooms cover the same story differently, we surface the disagreement — not just one outlet's framing.</li>
        </ul>
        <p style="margin:18px 0">In the meantime, today's stories are live at
          <a href="${SITE_URL}" style="color:#DC2626;font-weight:600">scoopfeeds.com</a>.</p>
        <p style="font-size:12px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
          Sent to ${email}. <a href="${unsubUrl}" style="color:#888">Unsubscribe</a> any time.
        </p>
      </div>
    `,
    text:
`Welcome aboard.

You're confirmed and on the list. Here's what to expect:

• One digest every weekday at 7am — the day's biggest stories synthesized for a 60-second read.
• No noise. We aggregate from credible sources only.
• One sponsor slot at the top, clearly labeled.
• Cross-source synthesis: when newsrooms cover a story differently, we surface the disagreement.

Today's stories: ${SITE_URL}

Unsubscribe: ${unsubUrl}`,
  };
}

function renderD3Email({ email, token }) {
  const unsubUrl   = `${SITE_URL}/api/newsletter/unsubscribe?token=${token}`;
  const settingsUrl = `${SITE_URL}/?onboard=topics&t=${token}`;
  return {
    subject: "Pick the topics you want — 30 seconds 🎯",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#111;line-height:1.6">
        <h2 style="margin:0 0 14px;font-size:22px">Make your digest yours</h2>
        <p style="margin:0 0 14px">Three days in. Want the digest weighted toward the topics you actually read? Takes 30 seconds:</p>
        <p style="margin:24px 0">
          <a href="${settingsUrl}" style="display:inline-block;background:#DC2626;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Pick my topics →</a>
        </p>
        <p style="margin:14px 0;color:#555;font-size:14px">
          Pakistan, AI, politics, science, cars, sports, international, health — pick a few and the morning digest will lead with the categories you want.
        </p>
        <p style="margin:24px 0 0;color:#555;font-size:14px">
          You can also <a href="${SITE_URL}/?ref=${token}" style="color:#DC2626">share Scoop with a friend</a> — every confirmed referral shows up on your weekly leaderboard.
        </p>
        <p style="font-size:12px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:16px">
          Sent to ${email}. <a href="${unsubUrl}" style="color:#888">Unsubscribe</a> any time.
        </p>
      </div>
    `,
    text:
`Make your digest yours.

Three days in. Want the digest weighted toward the topics you actually read? Takes 30 seconds.

Pick your topics: ${settingsUrl}

You can also share Scoop with a friend — referral link: ${SITE_URL}/?ref=${token}

Unsubscribe: ${unsubUrl}`,
  };
}

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;

/**
 * Run one pass of the welcome sequence — sends d1 and d3 emails to anyone
 * eligible. Returns counts per stage.
 *
 * @param {Object} [opts]
 * @param {number} [opts.maxPerStage=50] — cap per stage to avoid SMTP rate limits.
 */
export async function runWelcomeSequenceCycle({ maxPerStage = 50 } = {}) {
  if (!getTransport()) {
    return { sent: 0, skippedReason: "smtp_not_configured" };
  }

  const counts = { d1: 0, d3: 0, failed: 0 };

  // Day 1 — verified at least 18h ago, at most 7 days ago (don't send to old
  // subscribers who'd find the welcome flow weird).
  const d1Recipients = findWelcomeRecipients("d1", {
    ageMin: 18 * HOUR,
    ageMax: 7 * DAY,
    limit:  maxPerStage,
  });
  for (const sub of d1Recipients) {
    try {
      const { subject, html, text } = renderD1Email(sub);
      await sendMail({ to: sub.email, subject, html, text });
      markWelcomeSent(sub.id, "d1");
      counts.d1++;
    } catch (err) {
      counts.failed++;
      logger.warn(`welcomeSequence: d1 send failed for ${sub.email}: ${err.message}`);
    }
  }

  // Day 3 — verified at least 60h ago, at most 14 days ago.
  const d3Recipients = findWelcomeRecipients("d3", {
    ageMin: 60 * HOUR,
    ageMax: 14 * DAY,
    limit:  maxPerStage,
  });
  for (const sub of d3Recipients) {
    try {
      const { subject, html, text } = renderD3Email(sub);
      await sendMail({ to: sub.email, subject, html, text });
      markWelcomeSent(sub.id, "d3");
      counts.d3++;
    } catch (err) {
      counts.failed++;
      logger.warn(`welcomeSequence: d3 send failed for ${sub.email}: ${err.message}`);
    }
  }

  if (counts.d1 + counts.d3 > 0) {
    logger.info(`📧 Welcome sequence sent — d1=${counts.d1} d3=${counts.d3} failed=${counts.failed}`);
  }
  return counts;
}
