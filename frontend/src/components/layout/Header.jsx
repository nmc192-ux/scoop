import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun, Moon, Search, X, RefreshCw,
  Activity, Grid3x3, List
} from "lucide-react";
import { useNewsStore } from "../../store/newsStore";
import { useHealth, useRefresh } from "../../hooks/useNews";
import { ScoopLogo } from "../mascot/KhabriMascot";
import CountryPicker from "./CountryPicker";
import clsx from "clsx";

export default function Header() {
  const {
    darkMode, toggleDarkMode,
    searchQuery, setSearchQuery,
    viewMode, setViewMode,
    language, setLanguage,
  } = useNewsStore();
  const { data: health } = useHealth();
  const refresh = useRefresh();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 4000);
  };

  const articleCount = health?.articles || 0;
  const isUrdu = language === "ur";

  return (
    <header
      className={clsx(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "glass border-b border-[var(--color-border)] shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">

          {/* ── Logo / Brand ───────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5"
          >
            <div className="relative">
              <ScoopLogo size={36} />
              {health?.status === "ok" && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-brand-green rounded-full border-2 border-[var(--color-bg)] animate-pulse" />
              )}
            </div>
            <div className="hidden sm:flex flex-col leading-none gap-[3px]">
              <span
                className="text-[var(--color-text)]"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "21px", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}
              >
                Scoop
              </span>
              <span
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "10px", fontWeight: 400, letterSpacing: "0.01em", color: "var(--color-text-tertiary)" }}
              >
                News, sniffed out.
              </span>
            </div>
          </motion.div>

          {/* ── Live indicator ──────────────────────────────────────────── */}
          <AnimatePresence>
            {articleCount > 0 && !showSearch && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="hidden md:flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]"
              >
                <Activity size={12} className="text-brand-green" />
                <span>{articleCount.toLocaleString()} articles</span>
                {health?.scheduler?.isRunning && (
                  <span className="breaking-badge">Live</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Search bar ──────────────────────────────────────────────── */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex-1 max-w-sm mx-4"
              >
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={isUrdu ? "خبریں تلاش کریں..." : "Search news..."}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className={clsx(
                      "w-full pl-8 pr-4 py-2 text-sm rounded-full",
                      "bg-[var(--color-surface2)] border border-[var(--color-border)]",
                      "text-[var(--color-text)] placeholder-[var(--color-text-tertiary)]",
                      "focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue",
                      isUrdu && "text-right pr-8 pl-4"
                    )}
                    style={isUrdu ? { fontFamily: "'Noto Nastaliq Urdu', serif" } : {}}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Actions ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <HeaderBtn
              onClick={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(""); }}
              title="Search"
            >
              {showSearch ? <X size={16} /> : <Search size={16} />}
            </HeaderBtn>

            <HeaderBtn onClick={handleRefresh} title="Refresh news" disabled={isRefreshing}>
              <RefreshCw size={16} className={clsx(isRefreshing && "animate-spin")} />
            </HeaderBtn>

            {/* View mode */}
            <div className="hidden sm:flex items-center rounded-lg bg-[var(--color-surface2)] border border-[var(--color-border)] p-0.5 gap-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={clsx(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "grid"
                    ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]"
                    : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
                )}
              >
                <Grid3x3 size={14} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={clsx(
                  "p-1.5 rounded-md transition-all",
                  viewMode === "list"
                    ? "bg-[var(--color-surface)] shadow-sm text-[var(--color-text)]"
                    : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
                )}
              >
                <List size={14} />
              </button>
            </div>

            {/* ── EN / Urdu language toggle ──────────────────────────── */}
            <div className="flex items-center rounded-full bg-[var(--color-surface2)] border border-[var(--color-border)] p-0.5 gap-0.5">
              <button
                onClick={() => setLanguage("en")}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200",
                  language === "en"
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("ur")}
                className={clsx(
                  "px-2.5 py-1 rounded-full text-xs font-bold transition-all duration-200",
                  language === "ur"
                    ? "bg-[var(--color-accent)] text-white shadow-sm"
                    : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]"
                )}
                style={{ fontFamily: "'Noto Nastaliq Urdu', serif" }}
              >
                اُردُو
              </button>
            </div>

            {/* Country picker */}
            <CountryPicker />

            {/* Dark mode */}
            <HeaderBtn onClick={toggleDarkMode} title="Toggle dark mode">
              <AnimatePresence mode="wait">
                <motion.div
                  key={darkMode ? "moon" : "sun"}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {darkMode ? <Sun size={16} /> : <Moon size={16} />}
                </motion.div>
              </AnimatePresence>
            </HeaderBtn>
          </div>
        </div>
      </div>
    </header>
  );
}

function HeaderBtn({ children, onClick, title, disabled = false }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center",
        "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]",
        "hover:bg-[var(--color-surface2)] transition-all duration-200",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </motion.button>
  );
}
