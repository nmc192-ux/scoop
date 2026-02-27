import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "./components/layout/Header";
import TopicNav from "./components/layout/TopicNav";
import FeaturedCard from "./components/news/FeaturedCard";
import NewsGrid from "./components/news/NewsGrid";
import StatsBar from "./components/news/StatsBar";
import VideoSection from "./components/news/VideoSection";
import XFeedSection from "./components/news/XFeedSection";
import MarketStrip from "./components/news/MarketStrip";
import MagazineSection from "./components/news/MagazineSection";
import { LoadingHero } from "./components/ui/LoadingCard";
import { BackendOffline } from "./components/ui/EmptyState";
import { useNews, useFeatured, useHealth, useRefresh } from "./hooks/useNews";
import { useNewsStore } from "./store/newsStore";
import ScoopMascot from "./components/mascot/KhabriMascot";

export default function App() {
  const { activeTopics, searchQuery, lastRefreshed, language } = useNewsStore();
  const { data: articles = [], isLoading, error, refetch } = useNews();
  const { data: featured = [], isLoading: featuredLoading } = useFeatured();
  const { data: health, isError: isOffline } = useHealth();
  const refresh = useRefresh();
  const isUrdu = language === "ur";

  // SSE live update stream
  useEffect(() => {
    let es;
    try {
      es = new EventSource("/api/events");
      es.onerror = () => es.close();
    } catch {}
    return () => es?.close();
  }, []);

  if (isOffline) return <BackendOffline />;

  const heroArticle  = featured[0] || null;
  const featuredGrid = featured.slice(1, 4);
  const showFeatured = activeTopics.includes("top") && !searchQuery;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] transition-colors duration-300">
      <Header />
      <TopicNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats bar */}
        <StatsBar />

        {/* ── Market Data Strip ──────────────────────────────────────── */}
        <MarketStrip />

        {/* ── Hero / Featured (Top Stories) ─────────────────────────── */}
        <AnimatePresence mode="wait">
          {showFeatured && (
            <motion.section
              key="hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mb-8"
            >
              {featuredLoading ? (
                <LoadingHero />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {heroArticle && (
                    <div className="lg:col-span-2">
                      <FeaturedCard article={heroArticle} />
                    </div>
                  )}
                  {featuredGrid.length > 0 && (
                    <div className="flex flex-col gap-4">
                      {featuredGrid.map(a => <SideCard key={a.id} article={a} />)}
                    </div>
                  )}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Video Section ─────────────────────────────────────────── */}
        <VideoSection />

        {/* ── Curated Reads / Publications ──────────────────────────── */}
        <MagazineSection />

        {/* ── X (Twitter) Accounts ──────────────────────────────────── */}
        <XFeedSection />

        {/* ── News Articles header ───────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h2 className={isUrdu ? "text-lg font-bold text-[var(--color-text)] urdu-text" : "text-lg font-bold text-[var(--color-text)]"}>
            {searchQuery
              ? (isUrdu ? `"${searchQuery}" کے نتائج` : `Results for "${searchQuery}"`)
              : activeTopics.includes("top")
              ? (isUrdu ? "تازہ ترین خبریں" : "Latest Stories")
              : activeTopics.map(t => t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, " ")).join(" · ")}
          </h2>
          {articles.length > 0 && (
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {articles.length} {isUrdu ? "خبریں" : "stories"}
            </span>
          )}
        </div>

        <NewsGrid
          articles={articles}
          isLoading={isLoading}
          error={error}
          onRefresh={() => { refetch(); refresh(); }}
        />

        {/* ── Empty mascot state ────────────────────────────────────── */}
        {!isLoading && !error && articles.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-16 text-center"
          >
            <ScoopMascot size="lg" mood="reading" animated />
            <div>
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {isUrdu ? "کوئی خبر نہیں ملی" : "Nothing sniffed out yet"}
              </p>
              <p className="text-sm text-[var(--color-text-tertiary)] mt-1">
                {isUrdu ? "دوسرا موضوع منتخب کریں" : "Try a different topic or hit refresh"}
              </p>
            </div>
          </motion.div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="mt-12 py-8 border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-text-tertiary)]">
            <div className="flex items-center gap-2.5">
              <ScoopMascot size="sm" animated={false} />
              <div>
                <span
                  className="text-[var(--color-text)]"
                  style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: "14px", fontWeight: 700, letterSpacing: "-0.02em" }}
                >Scoop</span>
                <span className="ml-2 text-[var(--color-text-tertiary)]">— News, sniffed out.</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span>📰 {health?.articles || 0} articles</span>
              <span>•</span>
              <span>📺 {health?.videos || 0} videos</span>
              <span>•</span>
              <span>🔄 Refreshes every 30 min</span>
              <span>•</span>
              <span>🌐 EN + اردو</span>
              <span>•</span>
              <span className="text-brand-green">● Live</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Refresh toast */}
      <AnimatePresence>
        {lastRefreshed && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: "-50%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                       bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-2xl
                       flex items-center gap-2"
          >
            ✓ {isUrdu ? "خبریں تازہ ہو رہی ہیں..." : "Refreshing news + videos..."}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SideCard({ article }) {
  const COLORS = {
    top: "#FF3B30", politics: "#007AFF", sports: "#34C759",
    science: "#5AC8FA", ai: "#007AFF", health: "#4CD964",
    pakistan: "#01411C", international: "#5856D6",
  };
  return (
    <motion.a
      href={article.url} target="_blank" rel="noopener noreferrer"
      whileHover={{ scale: 1.01 }}
      className="card card-hover flex gap-3 p-4"
    >
      {article.image_url && (
        <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-[var(--color-surface2)]">
          <img
            src={article.image_url} alt={article.title} loading="lazy"
            className="w-full h-full object-cover"
            onError={e => e.target.style.display = "none"}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span
          className="text-xs font-bold text-white px-2 py-0.5 rounded"
          style={{ backgroundColor: COLORS[article.category] || "#007AFF" }}
        >
          {article.category}
        </span>
        <h4 className="text-sm font-semibold text-[var(--color-text)] leading-snug mt-1 line-clamp-3">
          {article.title}
        </h4>
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{article.source_name}</p>
      </div>
    </motion.a>
  );
}
