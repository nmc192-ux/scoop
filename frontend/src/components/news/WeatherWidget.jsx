/**
 * WeatherWidget — compact sidebar weather card
 *
 * Strategy:
 *  1. Fetch Karachi weather immediately (no geo wait = no spinner delay)
 *  2. Request geolocation in background
 *  3. If granted, update coords → React Query fetches actual location data
 *  4. Graceful error card with retry button if the API is unreachable
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Wind, Droplets, MapPin, RefreshCw } from "lucide-react";
import { useWeather } from "../../hooks/useWeather";

/* ─── Condition → emoji ─────────────────────────────────────────────────────── */
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

/* ─── Condition → inline style gradient (avoids Tailwind purge issues) ───────── */
function conditionStyle(condition) {
  const gradients = {
    Clear:        "linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(253,186,116,0.10) 100%)",
    Clouds:       "linear-gradient(135deg, rgba(148,163,184,0.18) 0%, rgba(203,213,225,0.10) 100%)",
    Rain:         "linear-gradient(135deg, rgba(59,130,246,0.18) 0%, rgba(147,197,253,0.10) 100%)",
    Drizzle:      "linear-gradient(135deg, rgba(96,165,250,0.15) 0%, rgba(186,230,253,0.10) 100%)",
    Thunderstorm: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(100,116,139,0.10) 100%)",
    Snow:         "linear-gradient(135deg, rgba(186,230,253,0.25) 0%, rgba(224,242,254,0.15) 100%)",
    Mist:         "linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(203,213,225,0.10) 100%)",
  };
  return {
    background: gradients[condition]
      ?? "linear-gradient(135deg, rgba(56,189,248,0.15) 0%, rgba(147,197,253,0.10) 100%)",
  };
}

/* ─── Skeleton ───────────────────────────────────────────────────────────────── */
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
  // Start with null → backend uses Karachi as default
  const [coords, setCoords] = useState(null);

  /* Request geolocation in the background — don't block the initial render */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => { /* denied / error — stay on Karachi */ },
      { timeout: 8000 }
    );
  }, []);

  // Query starts immediately with Karachi (null coords), updates when geo resolves
  const { data: weather, isLoading, isError, refetch, isFetching } = useWeather(coords);

  if (isLoading) return <WeatherSkeleton />;

  if (isError || !weather) {
    return (
      <div className="card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">🌡️ Weather</span>
        </div>
        <p className="text-xs text-[var(--color-text-tertiary)] mb-3">
          Could not load weather data.
        </p>
        <button
          onClick={() => refetch()}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold
                     bg-[var(--color-surface2)] text-[var(--color-text-secondary)]
                     hover:bg-[var(--color-border)] transition-colors"
        >
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-4 overflow-hidden"
      style={conditionStyle(weather.condition)}
    >
      <div className="p-4">
        {/* Location + refresh */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <MapPin size={11} />
            <span className="font-semibold">
              {weather.city}{weather.country ? `, ${weather.country}` : ""}
            </span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1 rounded-full hover:bg-[var(--color-surface2)] text-[var(--color-text-tertiary)]
                       transition-colors disabled:opacity-40"
            title="Refresh weather"
          >
            <RefreshCw size={11} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Temperature + emoji */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl leading-none" role="img" aria-label={weather.condition}>
            {CONDITION_EMOJI[weather.condition] ?? "🌡️"}
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

        {/* Secondary stats */}
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
