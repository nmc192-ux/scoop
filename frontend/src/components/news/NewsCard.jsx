import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, BookmarkCheck, ExternalLink, Clock, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNewsStore } from "../../store/newsStore";
import { useTranslatedTexts } from "../../hooks/useTranslation";
import clsx from "clsx";

const TOPIC_COLORS = {
  top: "#FF3B30", politics: "#007AFF", international: "#5856D6",
  pakistan: "#01411C", local: "#FF9500", sports: "#34C759",
  science: "#5AC8FA", medicine: "#FF2D55", health: "#4CD964",
  "public-health": "#FF6B35", "self-help": "#AF52DE", environment: "#30B0C7",
  weather: "#64D2FF", ai: "#007AFF", "computer-science": "#5856D6", "agentic-ai": "#FF3B30",
};

const TOPIC_LABELS = {
  top: "Top", politics: "Politics", international: "World", local: "Local",
  pakistan: "Pakistan", sports: "Sports", science: "Science", medicine: "Medicine",
  health: "Health", "public-health": "Public Health", "self-help": "Self Help",
  environment: "Environment", weather: "Weather", ai: "AI",
  "computer-science": "Tech", "agentic-ai": "Agentic AI",
};

const TOPIC_EMOJIS = {
  top: "📰", politics: "🏛️", international: "🌍", pakistan: "🇵🇰",
  local: "📍", sports: "🏆", science: "🔬", medicine: "💊",
  health: "💪", "public-health": "🏥", "self-help": "🌟",
  environment: "🌱", weather: "🌤️", ai: "🤖",
  "computer-science": "💻", "agentic-ai": "🤖",
};

function formatTime(timestamp) {
  try { return formatDistanceToNow(new Date(timestamp), { addSuffix: true }); }
  catch { return "recently"; }
}

function CredibilityDots({ score }) {
  return (
    <div className="flex gap-0.5" title={`Credibility: ${score}/10`}>
      {[...Array(5)].map((_, i) => (
        <div key={i} className={clsx(
          "w-1.5 h-1.5 rounded-full",
          i < Math.ceil(score / 2) ? "bg-brand-green" : "bg-[var(--color-border)]"
        )} />
      ))}
    </div>
  );
}

export default function NewsCard({ article, index = 0, size = "normal" }) {
  const { saveArticle, unsaveArticle, isArticleSaved } = useNewsStore();
  const saved = isArticleSaved(article.id);
  const [imgError, setImgError] = useState(false);
  const [showShare, setShowShare] = useState(false);

  const color = TOPIC_COLORS[article.category] || "#007AFF";
  const label = TOPIC_LABELS[article.category] || article.category;
  const emoji = TOPIC_EMOJIS[article.category] || "📰";
  const isRecent = Date.now() - article.published_at < 3 * 60 * 60 * 1000;

  // Translation
  const textsToTranslate = [article.title || "", article.description || ""];
  const { texts: translatedTexts, isUrdu } = useTranslatedTexts(textsToTranslate);
  const displayTitle = translatedTexts[0] || article.title;
  const displayDesc  = translatedTexts[1] || article.description;

  const handleSave = (e) => {
    e.preventDefault(); e.stopPropagation();
    saved ? unsaveArticle(article.id) : saveArticle(article);
  };

  const handleShare = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (navigator.share) {
      await navigator.share({ title: article.title, url: article.url });
    } else {
      navigator.clipboard.writeText(article.url);
      setShowShare(true);
      setTimeout(() => setShowShare(false), 2000);
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.4, ease: "easeOut" }}
      className={clsx("card card-hover group relative", size === "large" && "sm:col-span-2")}
    >
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block">
        {/* Image */}
        {article.image_url && !imgError ? (
          <div className={clsx("relative overflow-hidden bg-[var(--color-surface2)]", size === "large" ? "h-56 sm:h-72" : "h-44")}>
            <img
              src={article.image_url} alt={article.title} loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="absolute top-3 left-3">
              <span className="topic-pill text-white text-xs px-2.5 py-1 shadow-lg" style={{ backgroundColor: color }}>
                {label}
              </span>
            </div>
            {isRecent && (
              <div className="absolute top-3 right-3">
                <span className="breaking-badge">New</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={clsx("relative flex items-center justify-center", size === "large" ? "h-32" : "h-28")}
            style={{ background: `linear-gradient(135deg, ${color}22, ${color}44)` }}
          >
            <span className="text-4xl opacity-60">{emoji}</span>
            <div className="absolute top-3 left-3">
              <span className="topic-pill text-white text-xs px-2.5 py-1 shadow" style={{ backgroundColor: color }}>
                {label}
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className={clsx("p-4", isUrdu && "text-right")}>
          {/* Source + Time */}
          <div className={clsx("flex items-center justify-between mb-2", isUrdu && "flex-row-reverse")}>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
                {article.source_name}
              </span>
              <CredibilityDots score={article.credibility} />
            </div>
            <div className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)]">
              <Clock size={10} />
              <span>{formatTime(article.published_at)}</span>
            </div>
          </div>

          {/* Title */}
          <h3 className={clsx(
            "font-semibold text-[var(--color-text)] leading-snug mb-2 truncate-title",
            size === "large" ? "text-xl" : "text-base",
            isUrdu && "urdu-text"
          )}>
            {displayTitle}
          </h3>

          {/* Description */}
          {article.description && (
            <p className={clsx(
              "text-sm text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed",
              isUrdu && "urdu-text"
            )}>
              {displayDesc}
            </p>
          )}

          {/* Author */}
          {article.author && !isUrdu && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-2 truncate">
              By {article.author}
            </p>
          )}
        </div>
      </a>

      {/* Action Bar */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-[var(--color-border)] pt-2.5">
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.85 }} onClick={handleSave}
            className={clsx(
              "p-1.5 rounded-lg transition-colors",
              saved ? "text-brand-blue bg-brand-blue/10" : "text-[var(--color-text-tertiary)] hover:text-brand-blue hover:bg-brand-blue/10"
            )}
            title={saved ? "Remove bookmark" : "Bookmark"}
          >
            {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </motion.button>

          <div className="relative">
            <motion.button
              whileTap={{ scale: 0.85 }} onClick={handleShare}
              className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-brand-blue hover:bg-brand-blue/10 transition-colors"
              title="Share"
            >
              <Share2 size={14} />
            </motion.button>
            <AnimatePresence>
              {showShare && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="absolute bottom-full left-0 mb-1 bg-gray-800 text-white text-xs px-2 py-1 rounded-lg whitespace-nowrap"
                >
                  Copied! ✓
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <a
          href={article.url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-brand-blue hover:text-brand-indigo transition-colors"
          onClick={e => e.stopPropagation()}
        >
          {isUrdu ? "پڑھیں" : "Read"} <ExternalLink size={11} />
        </a>
      </div>
    </motion.article>
  );
}
