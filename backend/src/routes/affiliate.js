/**
 * /api/affiliate-pick — returns the one program we want to surface for this
 * request, given the reader's country and a soft category hint.
 *
 * The frontend <AffiliateWidget> hits this on mount and renders the card.
 * If we return `null` (no program set up yet, or no country match) the
 * widget collapses silently.
 */

import express from "express";
import { pickAffiliate, getPaywallAffiliate, skimlinksPublisherId } from "../config/affiliates.js";
import { detectCountry } from "../services/geolocation.js";
import { logger } from "../services/logger.js";

const router = express.Router();

router.get("/pick", (req, res) => {
  try {
    const country = detectCountry(req);
    const category = (req.query.category || "default").toString();
    const program = pickAffiliate({ country, category });
    res.set("cache-control", "public, max-age=300"); // 5-min CDN-friendly
    res.json({
      success: true,
      data: program,       // null if nothing configured for this country
      meta: { country, category, skimlinks: Boolean(skimlinksPublisherId()) },
    });
  } catch (err) {
    logger.error("Error picking affiliate", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to pick affiliate" });
  }
});

// Subscribe-via-Scoop deep link for paywalled outlets. Returns the affiliate
// URL (or null) so the article card can show a subtle "Subscribe via Scoop"
// CTA next to a paywalled source badge.
router.get("/paywall", (req, res) => {
  try {
    const source = (req.query.source || "").toString();
    const entry = getPaywallAffiliate(source);
    res.set("cache-control", "public, max-age=600");
    res.json({ success: true, data: entry });
  } catch (err) {
    logger.error("Error resolving paywall affiliate", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to resolve paywall affiliate" });
  }
});

export default router;
