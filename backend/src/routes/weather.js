/**
 * GET /api/weather
 *
 * Query params (one of):
 *   ?lat=24.86&lon=67.01       ← preferred (browser geolocation)
 *   ?city=Karachi              ← fallback
 *
 * Proxies OpenWeatherMap API (free tier).
 * Requires env var: OPENWEATHER_API_KEY
 *
 * In-memory cache: 15 minutes per location.
 */

import express from "express";
import https from "https";

const router = express.Router();

// ── 15-minute in-memory cache ─────────────────────────────────────────────────
const cache = new Map(); // key → { data, expiresAt }
const TTL_MS = 15 * 60 * 1000;

function fromCache(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data;
  cache.delete(key);
  return null;
}
function toCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + TTL_MS });
}

// ── OpenWeatherMap fetch helper ───────────────────────────────────────────────
function owmFetch(params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      ...params,
      appid: process.env.OPENWEATHER_API_KEY,
      units: "metric",
    }).toString();

    const url = `https://api.openweathermap.org/data/2.5/weather?${query}`;

    https.get(url, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode !== 200) {
            reject(new Error(json.message || `OWM error ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

// ── Shape OWM response ────────────────────────────────────────────────────────
function shape(owm) {
  return {
    city:        owm.name,
    country:     owm.sys?.country ?? "",
    temp:        Math.round(owm.main.temp),
    feelsLike:   Math.round(owm.main.feels_like),
    humidity:    owm.main.humidity,
    wind:        Math.round(owm.wind.speed * 3.6), // m/s → km/h
    condition:   owm.weather[0].main,
    description: owm.weather[0].description,
    icon:        owm.weather[0].icon,
    sunrise:     owm.sys?.sunrise ?? null,
    sunset:      owm.sys?.sunset  ?? null,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  if (!process.env.OPENWEATHER_API_KEY) {
    return res.status(503).json({
      success: false,
      error: "Weather service not configured (missing OPENWEATHER_API_KEY)",
    });
  }

  const { lat, lon, city } = req.query;
  let cacheKey, params;

  if (lat && lon) {
    cacheKey = `ll_${parseFloat(lat).toFixed(2)}_${parseFloat(lon).toFixed(2)}`;
    params   = { lat, lon };
  } else if (city) {
    cacheKey = `city_${city.toLowerCase()}`;
    params   = { q: city };
  } else {
    // Default: Karachi
    cacheKey = "ll_24.86_67.01";
    params   = { lat: "24.86", lon: "67.01" };
  }

  const cached = fromCache(cacheKey);
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  try {
    const owm  = await owmFetch(params);
    const data = shape(owm);
    toCache(cacheKey, data);
    res.json({ success: true, data, cached: false });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
  }
});

export default router;
