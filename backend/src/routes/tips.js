/**
 * /api/tips — Stripe Checkout tip jar.
 *
 * Routes:
 *   POST /api/tips/create-session  { amount }
 *       → creates a Stripe Checkout session, returns { url }.
 *       `amount` is one of: 3, 5, 10 (USD dollars).
 *
 *   POST /api/tips/webhook
 *       → Stripe webhook endpoint (raw body required for signature verification).
 *         Handles checkout.session.completed → marks tip as completed in DB.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY     — sk_live_... or sk_test_...
 *   STRIPE_PUBLISHABLE_KEY — pk_live_... or pk_test_... (optional, exposed to frontend via /api/public-config)
 *   STRIPE_WEBHOOK_SECRET — whsec_... (set in Stripe Dashboard → Webhooks)
 *   PRIMARY_SITE_URL      — used for success/cancel redirect URLs
 *
 * No Stripe account → endpoints return { configured: false }; the frontend
 * hides the tip button entirely via /api/public-config.
 */

import { Router } from "express";
import { createTipRecord, completeTip, getTipStats } from "../models/database.js";
import { logger } from "../services/logger.js";

const router = Router();

const SITE_URL = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");

const getSecretKey = () => process.env.STRIPE_SECRET_KEY || "";
const getWebhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET || "";

export function isStripeConfigured() {
  return Boolean(getSecretKey());
}

// Allowed tip amounts in cents.
const ALLOWED_AMOUNTS = { 3: 300, 5: 500, 10: 1000 };

// Lazy-load stripe to avoid crashing the server when not installed yet.
let _stripe = null;
async function getStripe() {
  if (_stripe) return _stripe;
  try {
    const { default: Stripe } = await import("stripe");
    _stripe = new Stripe(getSecretKey(), { apiVersion: "2024-04-10" });
    return _stripe;
  } catch (err) {
    logger.warn(`tips: failed to load stripe: ${err.message}`);
    return null;
  }
}

// ─── POST /api/tips/create-session ──────────────────────────────────────────
router.post("/create-session", async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ success: false, error: "Stripe not configured" });
  }

  const rawAmount = Number(req.body?.amount) || 5;
  const amountCents = ALLOWED_AMOUNTS[rawAmount] || 500;

  const stripe = await getStripe();
  if (!stripe) return res.status(503).json({ success: false, error: "Stripe unavailable" });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Support Scoop ☕",
              description: "Help keep independent news aggregation free. One-time tip.",
              images: [`${SITE_URL}/api/cards/og/scoop-tip.png`],
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${SITE_URL}/?payment=success`,
      cancel_url:  `${SITE_URL}/?payment=cancelled`,
      // Allow customer to enter their email (shown in Stripe dashboard).
      customer_creation: "if_required",
      // Store amount in metadata so the webhook can record it.
      metadata: { amount_cents: String(amountCents), source: "tip_jar" },
    });

    // Create a pending tip record so we can track even abandoned sessions.
    createTipRecord({ id: session.id, amountCents, currency: "usd" });

    res.json({ success: true, url: session.url });
  } catch (err) {
    logger.error(`tips: create-session failed: ${err.message}`);
    res.status(500).json({ success: false, error: "Failed to create payment session" });
  }
});

// ─── POST /api/tips/webhook ──────────────────────────────────────────────────
// IMPORTANT: must receive raw body — express.json() must be skipped for this route.
// Registered in server.js BEFORE the express.json() middleware using express.raw().
router.post(
  "/webhook",
  (req, _res, next) => {
    // If the request already has raw buffer (from express.raw middleware), skip.
    // Otherwise fall through (will fail sig verification; we log and return 400).
    next();
  },
  async (req, res) => {
    const secret = getWebhookSecret();
    const sig = req.headers["stripe-signature"];

    if (!isStripeConfigured()) return res.sendStatus(503);

    const stripe = await getStripe();
    if (!stripe) return res.sendStatus(503);

    let event;
    try {
      if (secret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
      } else {
        // Dev mode: no signature verification.
        event = typeof req.body === "string" || Buffer.isBuffer(req.body)
          ? JSON.parse(req.body.toString())
          : req.body;
      }
    } catch (err) {
      logger.warn(`tips: webhook signature error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      completeTip(session.id, {
        stripePaymentIntent: session.payment_intent,
        email: session.customer_details?.email || null,
      });
      logger.info(`💰 Tip completed: ${session.id} $${(session.amount_total || 0) / 100}`);
    }

    res.json({ received: true });
  }
);

// ─── GET /api/tips/stats ─────────────────────────────────────────────────────
router.get("/stats", (_req, res) => {
  const stats = getTipStats();
  res.json({
    success: true,
    totalTips: stats.completed_count,
    totalAmountUsd: ((stats.completed_cents || 0) / 100).toFixed(2),
  });
});

export default router;
