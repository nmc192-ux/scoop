/**
 * Affiliate program registry — keyed by country + category.
 *
 * How this is used:
 *   1. `/api/affiliate-pick?category=shopping` → returns the best program
 *      for the caller's country (country inferred from cf-ipcountry header
 *      or the geolocation service fallback).
 *   2. `<AffiliateWidget>` on the frontend reads that and renders a single
 *      tasteful sidebar card. If no program matches, the widget collapses
 *      to nothing — same pattern as the empty-AdSense fix.
 *   3. Link-wrapping helpers (e.g. Amazon tag injection) read the per-country
 *      entry directly.
 *
 * Each program slot is optional. If the env var for its tracking ID is
 * missing, the program is filtered out — so signing up for one program at
 * a time just works; we never render a link without an ID attached.
 *
 * Keep this list SHORT. One well-chosen recommendation per user > five
 * generic ones.
 */

function env(name) {
  return (process.env[name] || "").trim();
}

// ── Amazon (per-locale tracking tags) ─────────────────────────────────────
const AMAZON_TAGS = {
  US: env("AMAZON_TAG_US"),    // e.g. scoopnews-20
  GB: env("AMAZON_TAG_UK"),    // e.g. scoopnews-21
  IN: env("AMAZON_TAG_IN"),    // e.g. scoopnews-21
  AE: env("AMAZON_TAG_AE"),
  CA: env("AMAZON_TAG_CA"),
  DE: env("AMAZON_TAG_DE"),
  AU: env("AMAZON_TAG_AU"),
  JP: env("AMAZON_TAG_JP"),
};
const AMAZON_DOMAINS = {
  US: "amazon.com", GB: "amazon.co.uk", IN: "amazon.in", AE: "amazon.ae",
  CA: "amazon.ca", DE: "amazon.de", AU: "amazon.com.au", JP: "amazon.co.jp",
};

function amazonProgram(country) {
  const tag = AMAZON_TAGS[country];
  const domain = AMAZON_DOMAINS[country];
  if (!tag || !domain) return null;
  return {
    id: "amazon",
    network: "Amazon Associates",
    tag,
    domain,
    label: "Shop on Amazon",
    // Link can be updated to a seasonal bestseller list if desired.
    url: `https://www.${domain}/bestsellers/?tag=${encodeURIComponent(tag)}`,
    blurb: "Deals on books, tech and home — earns us a small commission.",
    icon: "shopping-bag",
  };
}

// ── Crypto exchange (Binance is the safe default, adjusted per region) ────
function cryptoProgram(country) {
  const ref = env("BINANCE_REF_ID");
  if (!ref) return null;
  // Binance is restricted in US / UK; we suppress there.
  if (["US", "GB"].includes(country)) return null;
  return {
    id: "binance",
    network: "Binance",
    label: "Track crypto on Binance",
    url: `https://accounts.binance.com/register?ref=${encodeURIComponent(ref)}`,
    blurb: "Zero-fee BTC trading for new signups. We earn a share of fees.",
    icon: "bitcoin",
  };
}

// ── Money transfer (Wise) — especially high-intent for diaspora readers ───
function wiseProgram(country) {
  const ref = env("WISE_REF_ID");
  if (!ref) return null;
  return {
    id: "wise",
    network: "Wise",
    label: "Send money abroad with Wise",
    url: `https://wise.com/invite/u/${encodeURIComponent(ref)}`,
    blurb: "Mid-market FX rates, no markup. Free first transfer up to £500.",
    icon: "send",
  };
}

// ── VPN (NordVPN via Impact; huge demand in PK/IN/MENA) ───────────────────
function vpnProgram(country) {
  const ref = env("NORDVPN_REF_URL");
  if (!ref) return null;
  return {
    id: "nordvpn",
    network: "NordVPN",
    label: "Read global news privately",
    url: ref,
    blurb: "Access region-locked news. 68% off the 2-year plan right now.",
    icon: "shield",
  };
}

// ── Paywalled-news subscription affiliates ────────────────────────────────
// Map source → program ID. Used by the article card to show a subtle
// "Subscribe via Scoop" CTA next to stories from these outlets. All of these
// require signing up on Impact.com (NYT/FT/Economist) or similar.
export const PAYWALL_AFFILIATES = {
  "The New York Times": {
    url: env("NYT_AFFILIATE_URL"),
    network: "Impact",
  },
  "Wall Street Journal": {
    url: env("WSJ_AFFILIATE_URL"),
    network: "Impact",
  },
  "Financial Times": {
    url: env("FT_AFFILIATE_URL"),
    network: "Impact",
  },
  "The Economist": {
    url: env("ECONOMIST_AFFILIATE_URL"),
    network: "Impact",
  },
  "Bloomberg": {
    url: env("BLOOMBERG_AFFILIATE_URL"),
    network: "Impact",
  },
};

export function getPaywallAffiliate(sourceName) {
  if (!sourceName) return null;
  const entry = PAYWALL_AFFILIATES[sourceName];
  if (!entry || !entry.url) return null;
  return entry;
}

// ── Master picker ────────────────────────────────────────────────────────
// Given a country + a category preference, return the one program we want
// to surface. Category is a soft hint; if we have no program in that
// category we fall back to any available.
const CATEGORY_ORDER = {
  shopping: ["amazon"],
  crypto: ["binance"],
  finance: ["wise", "binance"],
  privacy: ["nordvpn"],
  diaspora: ["wise"],
  default: ["amazon", "wise", "binance", "nordvpn"],
};

const BUILDERS = {
  amazon: amazonProgram,
  binance: cryptoProgram,
  wise: wiseProgram,
  nordvpn: vpnProgram,
};

export function pickAffiliate({ country, category = "default" } = {}) {
  const upper = (country || "").toUpperCase();
  const preference = CATEGORY_ORDER[category] || CATEGORY_ORDER.default;
  for (const id of preference) {
    const program = BUILDERS[id]?.(upper);
    if (program) return program;
  }
  // If nothing in the preferred category matched (e.g. no Amazon tag for
  // this country), fall through to any available program.
  for (const id of CATEGORY_ORDER.default) {
    const program = BUILDERS[id]?.(upper);
    if (program) return program;
  }
  return null;
}

// Exposed for the outbound-link wrapper in the frontend.
export function amazonInfoForCountry(country) {
  const upper = (country || "").toUpperCase();
  const tag = AMAZON_TAGS[upper];
  const domain = AMAZON_DOMAINS[upper];
  if (!tag || !domain) return null;
  return { tag, domain };
}

// Skimlinks — if set, the frontend loads their SDK to auto-wrap any outbound
// shopping/travel link in article bodies. Drop-in, no code changes elsewhere.
export function skimlinksPublisherId() {
  return env("SKIMLINKS_ID");
}
