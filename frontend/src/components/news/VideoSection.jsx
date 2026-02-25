import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Youtube, ExternalLink, Play, X as XIcon } from "lucide-react";
import VideoCard from "./VideoCard";
import VideoModal from "./VideoModal";
import { useVideos } from "../../hooks/useVideos";
import { useNewsStore } from "../../store/newsStore";
import clsx from "clsx";

/* ─── Platform Tab Config ────────────────────────────────────────────────── */
const PLATFORMS = [
  { id: "youtube",  label: "YouTube",  color: "#FF0000", emoji: "▶️" },
  { id: "shorts",   label: "Shorts",   color: "#FF0000", emoji: "📱" },
  { id: "tiktok",   label: "TikTok",   color: "#010101", emoji: "🎵" },
  { id: "facebook", label: "Facebook", color: "#1877F2", emoji: "📘" },
  { id: "xvideo",   label: "X Videos", color: "#000000", emoji: "𝕏" },
];

/* ─── Topic-based TikTok accounts ────────────────────────────────────────── */
const TIKTOK_ACCOUNTS = {
  top:             [{ handle: "bbc",         name: "BBC News",       followers: "5.8M" },
                   { handle: "cnn",          name: "CNN",            followers: "4.2M" },
                   { handle: "abcnews",      name: "ABC News",       followers: "2.1M" }],
  politics:        [{ handle: "politico",    name: "POLITICO",       followers: "820K" },
                   { handle: "thehill",      name: "The Hill",       followers: "1.1M" }],
  pakistan:        [{ handle: "geonewstv",   name: "Geo News",       followers: "3.2M" },
                   { handle: "arynewspk",    name: "ARY News",       followers: "2.9M" }],
  sports:          [{ handle: "espn",        name: "ESPN",           followers: "12M" },
                   { handle: "bleacherreport", name: "Bleacher Report", followers: "6.4M" }],
  science:         [{ handle: "nasagoddardsfc", name: "NASA",        followers: "3.8M" },
                   { handle: "scientificamerican", name: "Sci Am",   followers: "890K" }],
  ai:              [{ handle: "openai",      name: "OpenAI",         followers: "2.1M" },
                   { handle: "techcrunch",   name: "TechCrunch",     followers: "1.5M" }],
  environment:     [{ handle: "natgeo",      name: "Nat Geo",        followers: "8.1M" },
                   { handle: "greenpeace",   name: "Greenpeace",     followers: "1.2M" }],
};

/* ─── Topic-based Facebook pages ─────────────────────────────────────────── */
const FB_PAGES = {
  top:             [{ handle: "BBCNews",     name: "BBC News",       likes: "58M" },
                   { handle: "CNN",          name: "CNN",            likes: "35M" },
                   { handle: "guardiannews", name: "The Guardian",   likes: "9.4M" }],
  pakistan:        [{ handle: "dawncom",     name: "Dawn",           likes: "6.2M" },
                   { handle: "GeoTV",        name: "Geo News",       likes: "8.7M" },
                   { handle: "arynewspk",    name: "ARY News",       likes: "9.1M" }],
  sports:          [{ handle: "ESPN",        name: "ESPN",           likes: "22M" },
                   { handle: "skysports",    name: "Sky Sports",     likes: "9.3M" }],
  science:         [{ handle: "NASAHubble",  name: "NASA Hubble",    likes: "5.8M" },
                   { handle: "SciAm",        name: "Scientific Am.", likes: "2.1M" }],
  ai:              [{ handle: "TechCrunch",  name: "TechCrunch",     likes: "4.5M" },
                   { handle: "TheVerge",     name: "The Verge",      likes: "2.9M" }],
  international:   [{ handle: "aljazeeraenglish", name: "Al Jazeera", likes: "12M" },
                   { handle: "DWNews",       name: "DW News",        likes: "5.4M" }],
  environment:     [{ handle: "NatGeo",      name: "Nat Geo",        likes: "45M" },
                   { handle: "wwf",          name: "WWF",            likes: "5.2M" }],
};

/* ─── Topic X video accounts ─────────────────────────────────────────────── */
const X_VIDEO_ACCOUNTS = {
  top:      ["Reuters", "BBCBreaking", "AP", "CNN"],
  politics: ["politico", "thehill", "NPR"],
  pakistan: ["dawn_com", "GeoNews", "ARYNewsAlerts"],
  sports:   ["ESPN", "BBCSport", "skysports"],
  science:  ["NASAHubble", "SciAm"],
  ai:       ["OpenAI", "sama"],
  environment: ["NatGeo", "greenpeace"],
};

/* ─── Skeleton Loader ─────────────────────────────────────────────────────── */
function VideoSkeleton() {
  return (
    <div className="card animate-pulse flex-shrink-0 w-64">
      <div className="shimmer-bg aspect-video rounded-t-2xl" />
      <div className="p-3 space-y-2">
        <div className="shimmer-bg h-4 rounded w-full" />
        <div className="shimmer-bg h-4 rounded w-3/4" />
        <div className="shimmer-bg h-3 rounded w-1/2" />
      </div>
    </div>
  );
}

/* ─── Social Platform Card (TikTok / Facebook / X) ──────────────────────── */
function SocialCard({ platform, account, topicColor }) {
  const configs = {
    tiktok:   { base: "https://tiktok.com/@", bg: "#010101", accent: "#69C9D0", icon: "🎵" },
    facebook: { base: "https://facebook.com/", bg: "#1877F2", accent: "#ffffff", icon: "📘" },
    xvideo:   { base: "https://x.com/", bg: "#000000", accent: "#ffffff", icon: "𝕏" },
  };
  const cfg = configs[platform] || configs.tiktok;
  const url = cfg.base + account.handle;

  return (
    <motion.a
      href={url} target="_blank" rel="noopener noreferrer"
      whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
      className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)]
                 bg-[var(--color-surface)] hover:shadow-md transition-all duration-200 group flex-shrink-0"
      style={{ minWidth: "200px" }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow"
        style={{ background: cfg.bg, color: cfg.accent }}
      >
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[var(--color-text)] truncate">{account.name}</p>
        <p className="text-xs text-[var(--color-text-tertiary)]">@{account.handle}</p>
        {account.followers && (
          <p className="text-xs font-medium mt-0.5" style={{ color: topicColor }}>
            {account.followers} followers
          </p>
        )}
        {account.likes && (
          <p className="text-xs font-medium mt-0.5" style={{ color: topicColor }}>
            {account.likes} likes
          </p>
        )}
      </div>
      <ExternalLink size={13} className="text-[var(--color-text-tertiary)] group-hover:text-brand-blue flex-shrink-0" />
    </motion.a>
  );
}

/* ─── YouTube Shorts Player ──────────────────────────────────────────────── */
function ShortsCard({ video, onPlay }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      className="card group cursor-pointer flex-shrink-0 overflow-hidden"
      style={{ width: "160px" }}
      onClick={() => onPlay?.(video)}
    >
      <div className="relative" style={{ aspectRatio: "9/16" }}>
        <img
          src={video.thumbnail || `https://img.youtube.com/vi/${video.video_id}/hqdefault.jpg`}
          alt={video.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-10 h-10 bg-red-600/90 rounded-full flex items-center justify-center">
            <Play size={16} fill="white" className="text-white ml-0.5" />
          </div>
        </div>
        {/* Shorts badge */}
        <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          SHORTS
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className="text-white text-[11px] font-medium line-clamp-2 leading-tight">{video.title}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main VideoSection ──────────────────────────────────────────────────── */
export default function VideoSection() {
  const { data: videos = [], isLoading } = useVideos();
  const { activeTopics } = useNewsStore();
  const [activeVideo, setActiveVideo] = useState(null);
  const [activePlatform, setActivePlatform] = useState("youtube");
  const [activeFilter, setActiveFilter] = useState("all");
  const scrollRef = useRef(null);

  const currentTopic = activeTopics.includes("top") ? "top" : activeTopics[0] || "top";
  const topicColor = {
    top: "#FF3B30", politics: "#007AFF", pakistan: "#01411C", sports: "#34C759",
    science: "#5AC8FA", ai: "#007AFF", environment: "#30B0C7", international: "#5856D6",
    medicine: "#FF2D55", health: "#4CD964", weather: "#64D2FF",
  }[currentTopic] || "#FF0000";

  const categories = ["all", ...new Set(videos.map(v => v.category).filter(Boolean))];
  const filtered = activeFilter === "all" ? videos : videos.filter(v => v.category === activeFilter);

  // Shorts = short titles or those with duration hints
  const shortsVideos = videos.filter(v =>
    v.title?.toLowerCase().includes("#shorts") ||
    v.title?.toLowerCase().includes("shorts") ||
    (v.description?.toLowerCase().includes("#shorts"))
  ).slice(0, 20);
  // Fallback: just take recent short-titled ones
  const shortsFallback = videos.slice(0, 10);

  const tiktokAccounts = TIKTOK_ACCOUNTS[currentTopic] || TIKTOK_ACCOUNTS.top || [];
  const fbPages        = FB_PAGES[currentTopic]        || FB_PAGES.top || [];
  const xVideoHandles  = X_VIDEO_ACCOUNTS[currentTopic] || X_VIDEO_ACCOUNTS.top || [];
  const xVideoAccounts = xVideoHandles.map(h => ({ handle: h, name: h }));

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 280, behavior: "smooth" });
  };

  if (!isLoading && videos.length === 0) return null;

  return (
    <section className="mb-8">
      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-xl flex items-center justify-center shadow-md">
            <Youtube size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">Video News</h2>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              {videos.length} videos · YouTube, Shorts, TikTok, Facebook & X
            </p>
          </div>
        </div>

        {/* Category filter for YouTube tab */}
        {activePlatform === "youtube" && (
          <div className="hidden sm:flex items-center gap-2 overflow-x-auto hide-scrollbar max-w-xs">
            {categories.slice(0, 5).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveFilter(cat)}
                className={clsx(
                  "text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-all",
                  activeFilter === cat
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)]"
                )}
              >
                {cat === "all" ? "All" : cat.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Platform Tabs ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto hide-scrollbar pb-1">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePlatform(p.id)}
            className={clsx(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border",
              activePlatform === p.id
                ? "text-white shadow-md border-transparent"
                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)]"
            )}
            style={activePlatform === p.id ? { backgroundColor: p.color } : {}}
          >
            <span>{p.emoji}</span>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Content Area ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {/* YouTube Videos */}
        {activePlatform === "youtube" && (
          <motion.div key="youtube" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="relative group/scroll">
              <motion.button
                initial={{ opacity: 0 }} whileHover={{ scale: 1.1 }}
                onClick={() => scroll(-1)}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full
                           bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg
                           items-center justify-center hidden group-hover/scroll:flex
                           text-[var(--color-text-secondary)] hover:text-[var(--color-text)] -translate-x-4 transition-all"
              >
                <ChevronLeft size={18} />
              </motion.button>

              <div ref={scrollRef} className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => <VideoSkeleton key={i} />)
                  : filtered.map((video, i) => (
                      <div key={video.id} className="flex-shrink-0 w-64">
                        <VideoCard video={video} index={i} onPlay={setActiveVideo} />
                      </div>
                    ))
                }
              </div>

              <motion.button
                initial={{ opacity: 0 }} whileHover={{ scale: 1.1 }}
                onClick={() => scroll(1)}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full
                           bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg
                           items-center justify-center hidden group-hover/scroll:flex
                           text-[var(--color-text-secondary)] hover:text-[var(--color-text)] translate-x-4 transition-all"
              >
                <ChevronRight size={18} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* YouTube Shorts */}
        {activePlatform === "shorts" && (
          <motion.div key="shorts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-40 animate-pulse">
                      <div className="shimmer-bg rounded-xl" style={{ aspectRatio: "9/16" }} />
                    </div>
                  ))
                : (shortsVideos.length > 0 ? shortsVideos : shortsFallback).map((video, i) => (
                    <ShortsCard key={video.id} video={video} onPlay={setActiveVideo} />
                  ))
              }
            </div>
            <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
              📱 Tap to play short-form news clips inline
            </p>
          </motion.div>
        )}

        {/* TikTok */}
        {activePlatform === "tiktok" && (
          <motion.div key="tiktok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#010101]/10 dark:bg-[#010101]/30 border border-[#010101]/20">
                <span className="text-sm">🎵</span>
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Top TikTok news accounts for <strong>{currentTopic.replace(/-/g, " ")}</strong>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiktokAccounts.map((acct, i) => (
                <motion.div key={acct.handle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <SocialCard platform="tiktok" account={acct} topicColor={topicColor} />
                </motion.div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-secondary)]">
                💡 <strong>TikTok note:</strong> Due to platform restrictions, TikTok videos cannot be embedded directly.
                Click any account above to view their live feed on TikTok.
              </p>
            </div>
          </motion.div>
        )}

        {/* Facebook */}
        {activePlatform === "facebook" && (
          <motion.div key="facebook" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1877F2]/10 border border-[#1877F2]/20">
                <span className="text-sm">📘</span>
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Top Facebook news pages for <strong>{currentTopic.replace(/-/g, " ")}</strong>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fbPages.map((page, i) => (
                <motion.div key={page.handle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <SocialCard platform="facebook" account={page} topicColor="#1877F2" />
                </motion.div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-xl bg-[var(--color-surface2)] border border-[var(--color-border)]">
              <a
                href={`https://www.facebook.com/watch/?category=news`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#1877F2] hover:underline font-medium"
              >
                📺 Watch live news on Facebook Watch →
              </a>
            </div>
          </motion.div>
        )}

        {/* X Videos */}
        {activePlatform === "xvideo" && (
          <motion.div key="xvideo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20">
                <span className="text-sm font-bold">𝕏</span>
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                  Video journalists on X for <strong>{currentTopic.replace(/-/g, " ")}</strong>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {xVideoAccounts.map((acct, i) => (
                <motion.div key={acct.handle} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <SocialCard platform="xvideo" account={acct} topicColor="#000000" />
                </motion.div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`https://x.com/search?q=${encodeURIComponent(currentTopic + " video")}&f=live&src=typed_query`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-black text-white text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                🔍 Search live videos on X →
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video modal */}
      <AnimatePresence>
        {activeVideo && (
          <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
