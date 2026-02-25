import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import NewsCard from "./NewsCard";
import { useNewsStore } from "../../store/newsStore";
import { LoadingGrid } from "../ui/LoadingCard";
import EmptyState from "../ui/EmptyState";

export default function NewsGrid({ articles = [], isLoading, error, onRefresh }) {
  const { viewMode } = useNewsStore();

  // Dedup by id
  const dedupedArticles = useMemo(() => {
    const seen = new Set();
    return articles.filter(a => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [articles]);

  if (isLoading && dedupedArticles.length === 0) {
    return <LoadingGrid count={9} />;
  }

  if (error && dedupedArticles.length === 0) {
    return <EmptyState type="error" onRefresh={onRefresh} />;
  }

  if (!isLoading && dedupedArticles.length === 0) {
    return <EmptyState type="noArticles" onRefresh={onRefresh} />;
  }

  return (
    <div className="space-y-4">
      <AnimatePresence mode="popLayout">
        {viewMode === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {dedupedArticles.map((article, i) => (
              <NewsCard key={article.id} article={article} index={i} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col gap-3"
          >
            {dedupedArticles.map((article, i) => (
              <ListCard key={article.id} article={article} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading && dedupedArticles.length > 0 && (
        <div className="flex justify-center py-4">
          <div className="flex gap-1.5">
            {[0, 0.15, 0.3].map((d, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: d }}
                className="w-2 h-2 bg-brand-blue rounded-full"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact list view card
function ListCard({ article, index }) {
  const [imgError, setImgError] = useState(false);

  const TOPIC_COLORS = {
    top: "#FF3B30", politics: "#007AFF", sports: "#34C759",
    science: "#5AC8FA", ai: "#007AFF", "agentic-ai": "#FF3B30",
    health: "#4CD964", environment: "#30B0C7",
  };

  return (
    <motion.article
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="card card-hover"
    >
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-4 p-4"
      >
        {article.image_url && !imgError && (
          <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-[var(--color-surface2)]">
            <img
              src={article.image_url}
              alt={article.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: TOPIC_COLORS[article.category] || "#007AFF" }}
            >
              {article.category}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {article.source_name}
            </span>
          </div>
          <h3 className="font-semibold text-[var(--color-text)] text-sm leading-snug line-clamp-2">
            {article.title}
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
            {new Date(article.published_at).toLocaleDateString()}
          </p>
        </div>
      </a>
    </motion.article>
  );
}
