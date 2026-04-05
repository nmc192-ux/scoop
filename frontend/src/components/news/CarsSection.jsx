/**
 * CarsSection — Cars & Automotive News
 *
 * Follows the exact MagazineSection pattern:
 *  • Row of source "tabs" with brand colours
 *  • Selecting a source shows its latest articles in a horizontal scroll
 *  • The whole section is collapsible (default: open)
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useCarSourceArticles } from "../../hooks/useMarket";

/* ─── Source registry ────────────────────────────────────────────────────────── */
const CAR_SOURCES = [
  {
    id:    "PakWheels Blog",
    label: "PakWheels",
    short: "PakWheels",
    emoji: "🇵🇰",
    color: "#009900",
  },
  {
    id:    "Top Gear",
    label: "Top Gear",
    short: "Top Gear",
    emoji: "🏎️",
    color: "#CC0000",
  },
  {
    id:    "Car and Driver",
    label: "Car & Driver",
    short: "C&D",
    emoji: "🚘",
    color: "#0057A8",
  },
  {
    id:    "MotorTrend",
    label: "MotorTrend",
    short: "MotorTrend",
    emoji: "🏁",
    color: "#E63946",
  },
  {
    id:    "Road & Track",
    label: "Road & Track",
    short: "R&T",
    emoji: "🛣️",
    color: "#1A1A2E",
  },
];

/* ─── Article card ───────────────────────────────────────────────────────────── */
function CarCard({ article, accentColor, sourceEmoji, sourceLabel }) {
  const ago = article.published_at
    ? formatDistanceToNow(new Date(article.published_at), { addSuffix: true })
    : "";

  return (
    <motion.a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      whileHover={{ y: -2 }}
      className="flex-shrink-0 w-52 sm:w-60 flex flex-col rounded-xl overflow-hidden
                 bg-[var(--color-surface)] border border-[var(--color-border)]
                 hover:border-[var(--color-text-tertiary)] hover:shadow-md transition-all duration-200"
    >
      {/* Thumbnail */}
      <div className="relative h-32 bg-[var(--color-surface2)] overflow-hidden flex-shrink-0">
        {article.image_url ? (
          <img
            src={article.image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 px-3"
            style={{
              background: `linear-gradient(135deg, ${accentColor}35 0%, ${accentColor}12 60%, transparent 100%)`,
            }}
          >
            <span className="text-3xl leading-none">{sourceEmoji}</span>
            <span
              className="text-[10px] font-bold text-center uppercase tracking-widest leading-tight"
              style={{ color: accentColor }}
            >
              {sourceLabel}
            </span>
          </div>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      </div>

      {/* Body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <h4 className="text-xs font-semibold text-[var(--color-text)] leading-snug line-clamp-3">
          {article.title}
        </h4>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="text-[10px] text-[var(--color-text-tertiary)]">{ago}</span>
          <ExternalLink size={11} className="text-[var(--color-text-tertiary)] flex-shrink-0" />
        </div>
      </div>
    </motion.a>
  );
}

/* ─── Source row ─────────────────────────────────────────────────────────────── */
function SourceRow({ source }) {
  const { data: articles = [], isLoading } = useCarSourceArticles(source.id, 20);

  if (!isLoading && articles.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">
          No articles yet — check back after the next refresh (every 30 min).
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
      {isLoading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-52 sm:w-60 h-[200px] rounded-xl bg-[var(--color-surface2)] animate-pulse"
            />
          ))
        : articles.map((a) => (
            <CarCard
              key={a.id}
              article={a}
              accentColor={source.color}
              sourceEmoji={source.emoji}
              sourceLabel={source.short}
            />
          ))}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function CarsSection() {
  const [isOpen,       setIsOpen]       = useState(true);
  const [activeSource, setActiveSource] = useState(CAR_SOURCES[0].id);

  const currentSource = CAR_SOURCES.find((s) => s.id === activeSource) || CAR_SOURCES[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 card overflow-hidden"
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🚗</span>
          <span className="text-sm font-bold text-[var(--color-text)]">Cars &amp; Auto</span>
          <span className="text-xs text-[var(--color-text-tertiary)] hidden sm:inline">
            · {CAR_SOURCES.length} sources
          </span>
        </div>
        {isOpen
          ? <ChevronUp  size={15} className="text-[var(--color-text-tertiary)]" />
          : <ChevronDown size={15} className="text-[var(--color-text-tertiary)]" />
        }
      </div>

      {/* ── Body ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="cars-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Source tabs */}
            <div className="flex gap-2 px-4 pb-3 border-b border-[var(--color-border)] overflow-x-auto hide-scrollbar">
              {CAR_SOURCES.map((src) => {
                const isActive = src.id === activeSource;
                return (
                  <motion.button
                    key={src.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); setActiveSource(src.id); }}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold
                      px-3 py-1.5 rounded-full transition-all duration-200 ${
                      isActive
                        ? "text-white shadow-sm"
                        : "bg-[var(--color-surface2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                    }`}
                    style={isActive ? { backgroundColor: src.color } : {}}
                  >
                    <span>{src.emoji}</span>
                    <span className="hidden sm:inline">{src.label}</span>
                    <span className="sm:hidden">{src.short}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Articles for selected source */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: currentSource.color }}
                />
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Latest from {currentSource.label}
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSource}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <SourceRow source={currentSource} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
