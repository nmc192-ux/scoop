import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Youtube, ThumbsUp, Share2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function VideoModal({ video, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!video) return null;

  const embedUrl = `https://www.youtube.com/embed/${video.video_id}?autoplay=1&rel=0&modestbranding=1`;

  const handleShare = async () => {
    try {
      await navigator.share({ title: video.title, url: video.url });
    } catch {
      navigator.clipboard.writeText(video.url).catch(() => {});
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl bg-[var(--color-surface)] rounded-2xl overflow-hidden shadow-2xl"
        >
          {/* Video player */}
          <div className="relative bg-black" style={{ paddingTop: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={embedUrl}
              title={video.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            <button
              onClick={onClose}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Info panel */}
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-[var(--color-text)] leading-snug line-clamp-2 mb-2">
                  {video.title}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                      <Youtube size={12} className="text-white" />
                    </div>
                    <span className="font-medium">{video.channel_name}</span>
                  </div>
                  <span className="text-[var(--color-text-tertiary)]">
                    {formatDistanceToNow(new Date(video.published_at), { addSuffix: true })}
                  </span>
                  {video.category && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-blue/15 text-brand-blue text-xs font-medium capitalize">
                      {video.category.replace(/-/g, " ")}
                    </span>
                  )}
                </div>
                {video.description && (
                  <p className="mt-3 text-sm text-[var(--color-text-secondary)] line-clamp-3 leading-relaxed">
                    {video.description}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
              <a
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-full transition-colors"
              >
                <Youtube size={14} /> Watch on YouTube
              </a>
              <button
                onClick={handleShare}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--color-surface2)] text-[var(--color-text-secondary)] text-sm font-medium rounded-full hover:bg-[var(--color-border)] transition-colors"
              >
                <Share2 size={14} /> Share
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
