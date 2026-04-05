/**
 * MagazineSection — Curated Reads / Premium Publications
 *
 * A "newsstand" widget that lets the user browse articles from individually
 * selected premium publications (The Economist, Foreign Affairs, etc.).
 *
 * Design:
 *  • Row of publication "tabs" styled like magazine spines — each has its
 *    own brand colour.
 *  • Selecting a publication loads its latest articles in a horizontal scroll
 *    (up to 20 cards).
 *  • Each card is a compact "cover-style" card: thumbnail + headline + date.
 *  • The whole section is collapsible.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, ExternalLink, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { usePublicationArticles } from "../../hooks/useMarket";

// ─── Publication registry ────────────────────────────────────────────────────
// color:  accent used for the active tab indicator + card tag
// bg:     dark background for the "spine" tab when active

const PUBLICATIONS = [
  {
    id: "The Economist",
    label: "The Economist",
    short: "Economist",
    emoji: "🔴",
    color: "#E3120B",
  },
  {
    id: "Foreign Affairs",
    label: "Foreign Affairs",
    short: "For. Affairs",
    emoji: "🌐",
    color: "#1B3A6B",
  },
  {
    id: "The Atlantic",
    label: "The Atlantic",
    short: "Atlantic",
    emoji: "🌊",
    color: "#0E6BA8",
  },
  {
    id: "Smithsonian",
    label: "Smithsonian",
    short: "Smithsonian",
    emoji: "🏛️",
    color: "#C4122F",
  },
  {
    id: "NY Times",
    label: "NY Times",
    short: "NY Times",
    emoji: "📰",
    color: "#555555",
  },
  {
    id: "The New Yorker",
    label: "The New Yorker",
    short: "New Yorker",
    emoji: "🗽",
    color: "#4A4A4A",
  },
];

// ─── Article card ────────────────────────────────────────────────────────────

function ArticleCard({ article, accentColor, pubEmoji, pubLabel }) {
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
        {article.image_url && (
          <img
            src={article.image_url}
            alt={article.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        {/* Branded placeholder — always rendered, hidden behind image when one exists */}
        {!article.image_url && (
          <div
            className="w-full h-full flex flex-col items-center justify-center gap-2 px-3"
            style={{
              background: `linear-gradient(135deg, ${accentColor}35 0%, ${accentColor}12 60%, transparent 100%)`,
            }}
          >
            <span className="text-3xl leading-none">{pubEmoji}</span>
            <span
              className="text-[10px] font-bold text-center uppercase tracking-widest leading-tight"
              style={{ color: accentColor }}
            >
              {pubLabel}
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

// ─── Publication articles row ─────────────────────────────────────────────────

function PublicationRow({ pub }) {
  const { data: articles = [], isLoading } = usePublicationArticles(pub.id, 20);

  if (!isLoading && articles.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-[var(--color-text-tertiary)]">
          No articles yet — check back after the next refresh.
        </p>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
          Articles appear within ~30 minutes of the first server start.
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
            <ArticleCard key={a.id} article={a} accentColor={pub.color} pubEmoji={pub.emoji} pubLabel={pub.short} />
          ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MagazineSection() {
  const [isOpen, setIsOpen]         = useState(true);
  const [activePub, setActivePub]   = useState(PUBLICATIONS[0].id);

  const currentPub = PUBLICATIONS.find((p) => p.id === activePub) || PUBLICATIONS[0];

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
          <BookOpen size={16} className="text-[var(--color-text-secondary)]" />
          <span className="text-sm font-bold text-[var(--color-text)]">Curated Reads</span>
          <span className="text-xs text-[var(--color-text-tertiary)] hidden sm:inline">
            · premium publications
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
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Publication tabs — styled like magazine spines */}
            <div className="flex gap-2 px-4 pb-3 border-b border-[var(--color-border)] overflow-x-auto hide-scrollbar">
              {PUBLICATIONS.map((pub) => {
                const isActive = pub.id === activePub;
                return (
                  <motion.button
                    key={pub.id}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); setActivePub(pub.id); }}
                    className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold
                      px-3 py-1.5 rounded-full transition-all duration-200 ${
                      isActive
                        ? "text-white shadow-sm"
                        : "bg-[var(--color-surface2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                    }`}
                    style={isActive ? { backgroundColor: pub.color === "#000000" ? "#333" : pub.color } : {}}
                  >
                    <span>{pub.emoji}</span>
                    <span className="hidden sm:inline">{pub.label}</span>
                    <span className="sm:hidden">{pub.short}</span>
                  </motion.button>
                );
              })}
            </div>

            {/* Articles for selected publication */}
            <div className="px-4 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: currentPub.color === "#000000" ? "#555" : currentPub.color }}
                />
                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                  Latest from {currentPub.label}
                </span>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activePub}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <PublicationRow pub={currentPub} />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
