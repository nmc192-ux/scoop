/**
 * WeatherWidget — compact sidebar weather card
 *
 * - Requests browser geolocation on mount
 * - Falls back to Karachi on deny / error
 * - Fetches data via /api/weather (OpenWeatherMap proxy)
 * - 15-minute client-side cache via React Query
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wind, Droplets, MapPin, RefreshCw } from "lucide-react";
import { useWeather } from "../../hooks/useWeather";

/* ─── Condition → emoji map ──────────────────────────────────────────────────── */
const CONDITION_EMOJI = {
  Clear:        "☀️",
  Clouds:       "☁️",
  Rain:         "🌧️",
  Drizzle:      "🌦️",
  Thunderstorm: "⛈️",
  Snow:         "❄️",
  Mist:         "🌫️",
  Smoke:        "🌫️",
  Haze:         "🌫️",
  Dust:         "🌫️",
  Fog:          "🌫️",
  Sand:         "🌫️",
  Ash:          "🌫️",
  Squall:       "🌬️",
  Tornado:      "🌪️",
};

function conditionEmoji(condition) {
  return CONDITION_EMOJI[condition] ?? "🌡️";
}

/* ─── Background gradient per condition ──────────────────────────────────────── */
function conditionGradient(condition) {
  const map = {
    Clear:        "from-amber-400/20 to-orange-300/10",
    Clouds:       "from-slate-400/20 to-slate-300/10",
    Rain:         "from-blue-500/20 to-blue-300/10",
    Drizzle:      "from-blue-400/15 to-sky-300/10",
    Thunderstorm: "from-purple-600/20 to-slate-500/10",
    Snow:         "from-sky-200/30 to-blue-100/15",
    Mist:         "from-gray-400/15 to-gray-300/10",
  };
  return map[condition] ?? "from-sky-400/15 to-blue-300/10";
}

/* ─── Skeleton loader ────────────────────────────────────────────────────────── */
function WeatherSkeleton() {
  return (
    <div className="card p-4 mb-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 rounded bg-[var(--color-surface2)]" />
        <div className="w-24 h-3 rounded bg-[var(--color-surface2)]" />
      </div>
      <div className="flex items-end gap-3">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-surface2)]" />
        <div className="flex flex-col gap-1.5">
          <div className="w-20 h-5 rounded bg-[var(--color-surface2)]" />
          <div className="w-16 h-3 rounded bg-[var(--color-surface2)]" />
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function WeatherWidget() {
  const [coords, setCoords] = useState(null);
  const [geoTried, setGeoTried] = useState(false);

  /* Request geolocation once on mount */
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoTried(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGeoTried(true);
      },
      () => {
        // Denied or error → use Karachi as fallback (null coords = backend default)
        setCoords(null);
        setGeoTried(true);
      },
      { timeout: 6000 }
    );
  }, []);

  const { data: weather, isLoading, isError, refetch } = useWeather(
    geoTried ? coords : undefined   // undefined → query disabled until geo attempt done
  );

  /* Don't render until geolocation attempt has completed */
  if (!geoTried || isLoading) return <WeatherSkeleton />;

  if (isError || !weather) {
    return (
      <div className="card p-4 mb-4 text-center">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          🌡️ Weather unavailable
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-xs text-brand-blue hover:underline flex items-center gap-1 mx-auto"
        >
          <RefreshCw size={10} /> Retry
        </button>
      </div>
    );
  }

  const emoji = conditionEmoji(weather.condition);
  const gradient = conditionGradient(weather.condition);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card mb-4 overflow-hidden bg-gradient-to-br ${gradient}`}
    >
      <div className="p-4">
        {/* Header row: location */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <MapPin size={11} />
            <span className="font-semibold">
              {weather.city}{weather.country ? `, ${weather.country}` : ""}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            className="p-1 rounded-full hover:bg-[var(--color-surface2)] text-[var(--color-text-tertiary)] transition-colors"
            title="Refresh weather"
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {/* Main: emoji + temperature */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl leading-none" role="img" aria-label={weather.condition}>
            {emoji}
          </span>
          <div>
            <div className="text-2xl font-bold text-[var(--color-text)] leading-none">
              {weather.temp}°C
            </div>
            <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5 capitalize">
              {weather.description}
            </div>
          </div>
        </div>

        {/* Secondary: feels like, humidity, wind */}
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
          <span>Feels {weather.feelsLike}°C</span>
          <span className="flex items-center gap-1">
            <Droplets size={10} /> {weather.humidity}%
          </span>
          <span className="flex items-center gap-1">
            <Wind size={10} /> {weather.wind} km/h
          </span>
        </div>
      </div>
    </motion.div>
  );
}
