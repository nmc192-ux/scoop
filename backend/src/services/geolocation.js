/**
 * Country detection for affiliate targeting.
 *
 * Strategy (cheapest → priciest):
 *   1. Cloudflare's `cf-ipcountry` header (free, accurate, 0 latency). Hostinger
 *      doesn't set this by default — but if the user routes scoopfeeds.com
 *      through Cloudflare's proxy later, it'll light up automatically.
 *   2. `x-vercel-ip-country` / `x-country-code` — other proxies use these.
 *   3. `Accept-Language` first-tag mapping — very rough (e.g. `en-GB` → GB)
 *      but still better than nothing for sidebar selection.
 *   4. Fallback to env var DEFAULT_COUNTRY or "US".
 *
 * We deliberately DON'T call a paid geo-IP API from request path — that
 * would add 100ms+ to every page load. If precision matters later we can
 * add a cached ipapi.co lookup with a 24-hour TTL.
 */

function fromAcceptLanguage(header) {
  if (!header) return null;
  // e.g. "en-GB,en;q=0.9,ur-PK;q=0.8" → "GB"
  const match = header.match(/^[a-z]{2,3}-([A-Z]{2})/);
  return match ? match[1] : null;
}

export function detectCountry(req) {
  const h = req.headers;
  const direct =
    h["cf-ipcountry"] ||
    h["x-vercel-ip-country"] ||
    h["x-country-code"] ||
    h["x-appengine-country"];
  if (direct && typeof direct === "string" && direct.length === 2 && direct !== "XX") {
    return direct.toUpperCase();
  }
  const fromLang = fromAcceptLanguage(h["accept-language"]);
  if (fromLang) return fromLang.toUpperCase();
  return (process.env.DEFAULT_COUNTRY || "US").toUpperCase();
}
