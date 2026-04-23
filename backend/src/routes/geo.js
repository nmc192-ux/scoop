/**
 * /api/geo — Lightweight IP-based geolocation for personalization.
 *
 * Resolution order (first win):
 *   1. Cloudflare `CF-IPCountry` header (free, instant)
 *   2. Vercel / Fly.io / Render country headers
 *   3. Fallback fetch to ipapi.co (no key, 1000 req/day free)
 *
 * Returns:
 *   {
 *     countryCode: "PK",
 *     country:     "Pakistan",
 *     region:      "Punjab",
 *     city:        "Lahore",
 *     currency:    "PKR",
 *     timezone:    "Asia/Karachi",
 *     source:      "cf" | "header" | "ipapi" | "default",
 *   }
 *
 * Per-IP cached for 6h. Defaults to US/USD if lookup fails so the UI
 * always has something sensible to work with.
 */

import express from "express";
import axios from "axios";
import { logger } from "../services/logger.js";

const router = express.Router();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const cache = new Map(); // ip -> { data, time }

// ISO 3166-1 alpha-2 → primary currency code (used when ipapi lookup fails)
const COUNTRY_CURRENCY = {
  US: "USD", GB: "GBP", EU: "EUR", CA: "CAD", AU: "AUD", NZ: "NZD",
  JP: "JPY", CN: "CNY", HK: "HKD", SG: "SGD", KR: "KRW", IN: "INR",
  PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  EG: "EGP", TR: "TRY", ZA: "ZAR", NG: "NGN", KE: "KES",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP",
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", PT: "EUR", GR: "EUR", AT: "EUR", FI: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RU: "RUB", UA: "UAH",
  ID: "IDR", MY: "MYR", TH: "THB", PH: "PHP", VN: "VND", TW: "TWD",
  IL: "ILS",
};

const DEFAULT = {
  countryCode: "US",
  country:     "United States",
  region:      null,
  city:        null,
  currency:    "USD",
  timezone:    "America/New_York",
  source:      "default",
};

function normaliseIp(raw) {
  if (!raw) return "";
  // XFF may contain "client, proxy1, proxy2"
  const first = String(raw).split(",")[0].trim();
  // Strip IPv6 bracket/port
  return first.replace(/^\[?([^\]]+)\]?:?\d*$/, "$1");
}

function getClientIp(req) {
  return (
    normaliseIp(req.headers["cf-connecting-ip"]) ||
    normaliseIp(req.headers["x-forwarded-for"]) ||
    normaliseIp(req.headers["x-real-ip"]) ||
    normaliseIp(req.socket?.remoteAddress) ||
    ""
  );
}

async function lookupIpapi(ip) {
  try {
    const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : "https://ipapi.co/json/";
    const { data } = await axios.get(url, { timeout: 3500, headers: { "User-Agent": "scoopfeeds/1.0" } });
    if (!data || data.error) return null;
    return {
      countryCode: data.country_code || data.country || null,
      country:     data.country_name || data.country || null,
      region:      data.region || null,
      city:        data.city || null,
      currency:    data.currency || null,
      timezone:    data.timezone || null,
      source:      "ipapi",
    };
  } catch (e) {
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const ip = getClientIp(req);

    // Per-IP cache
    const hit = cache.get(ip);
    if (hit && Date.now() - hit.time < CACHE_TTL) {
      return res.json({ success: true, data: hit.data, cached: true });
    }

    // 1. Cloudflare header (fastest, most reliable when proxied through CF)
    const cf = (req.headers["cf-ipcountry"] || "").toString().toUpperCase();
    if (cf && cf !== "XX" && cf !== "T1" && cf.length === 2) {
      const data = {
        ...DEFAULT,
        countryCode: cf,
        country:     cf, // display name; frontend can prettify via Intl
        currency:    COUNTRY_CURRENCY[cf] || "USD",
        region:      null,
        city:        null,
        timezone:    null,
        source:      "cf",
      };
      // Best-effort city/timezone refinement via ipapi — don't block on it
      const refined = await lookupIpapi(ip);
      if (refined && refined.countryCode === cf) Object.assign(data, refined, { source: "cf+ipapi" });
      cache.set(ip, { data, time: Date.now() });
      return res.json({ success: true, data, cached: false });
    }

    // 2. Other hosts' country headers
    const headerCountry = (
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      req.headers["fly-client-country"] ||
      ""
    ).toString().toUpperCase();
    if (headerCountry && headerCountry.length === 2) {
      const data = {
        ...DEFAULT,
        countryCode: headerCountry,
        country:     headerCountry,
        currency:    COUNTRY_CURRENCY[headerCountry] || "USD",
        source:      "header",
      };
      cache.set(ip, { data, time: Date.now() });
      return res.json({ success: true, data, cached: false });
    }

    // 3. ipapi.co fallback
    const ipapi = await lookupIpapi(ip);
    if (ipapi && ipapi.countryCode) {
      const data = {
        ...DEFAULT,
        ...ipapi,
        currency: ipapi.currency || COUNTRY_CURRENCY[ipapi.countryCode] || "USD",
      };
      cache.set(ip, { data, time: Date.now() });
      return res.json({ success: true, data, cached: false });
    }

    // 4. Sensible default
    cache.set(ip, { data: DEFAULT, time: Date.now() });
    res.json({ success: true, data: DEFAULT, cached: false });
  } catch (err) {
    logger.warn("geo lookup failed", { error: err.message });
    res.json({ success: true, data: DEFAULT, cached: false });
  }
});

export default router;
