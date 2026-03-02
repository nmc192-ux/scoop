import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

/* ─── Channel config ─────────────────────────────────────────────────────────
   videoId  = direct YouTube video ID (most reliable for 24/7 streams)
   channelId = fallback if no stable videoId exists (uses live_stream embed)
   ────────────────────────────────────────────────────────────────────────── */
const LIVE_CHANNELS = [
  {
    id:        "aljazeera",
    name:      "Al Jazeera",
    flag:      "🌍",
    color:     "#C8A951",
    videoId:   "gCNeDWCI0vo",
    ytUrl:     "https://www.youtube.com/@AlJazeeraEnglish/live",
  },
  {
    id:        "bbc",
    name:      "BBC News",
    flag:      "🇬🇧",
    color:     "#BB1919",
    channelId: "UC16niRr50-MSBwiO3YDb3RA",
    ytUrl:     "https://www.youtube.com/@BBCNews/live",
  },
  {
    id:        "skynews",
    name:      "Sky News",
    flag:      "🇬🇧",
    color:     "#E8000D",
    videoId:   "9Auq9mYxFEE",
    ytUrl:     "https://www.youtube.com/@SkyNews/live",
  },
  {
    id:        "dw",
    name:      "DW News",
    flag:      "🇩🇪",
    color:     "#0000A0",
    videoId:   "LuKwFajn37U",
    ytUrl:     "https://www.youtube.com/@DWNews/live",
  },
  {
    id:        "france24",
    name:      "France 24",
    flag:      "🇫🇷",
    color:     "#003F8F",
    videoId:   "Ap-UM1O9RBU",
    ytUrl:     "https://www.youtube.com/@FRANCE24English/live",
  },
  {
    id:        "wion",
    name:      "WION",
    flag:      "🌏",
    color:     "#E63946",
    channelId: "UC_gUM8rL-Lrg6O3adPW9K1g",
    ytUrl:     "https://www.youtube.com/@WION/live",
  },
  {
    id:        "geo",
    name:      "Geo News",
    flag:      "🇵🇰",
    color:     "#009900",
    videoId:   "_FwympjOSNE",
    ytUrl:     "https://www.youtube.com/@geonews/live",
  },
  {
    id:        "ary",
    name:      "ARY News",
    flag:      "🇵🇰",
    color:     "#003399",
    videoId:   "0_riyxKLdxU",
    ytUrl:     "https://www.youtube.com/@arynewspk/live",
  },
];

function getEmbedUrl(ch) {
  const base = ch.videoId
    ? `https://www.youtube.com/embed/${ch.videoId}`
    : `https://www.youtube.com/embed/live_stream?channel=${ch.channelId}`;
  return base + (ch.videoId
    ? "?autoplay=0&rel=0&modestbranding=1&showinfo=0"
    : "&autoplay=0&rel=0&modestbranding=1&showinfo=0");
}

/* ─── Pulsing red dot ────────────────────────────────────────────────────────── */
function LiveDot() {
  return (
    <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600" />
    </span>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────────── */
export default function LiveTVSection() {
  const [isOpen,     setIsOpen]     = useState(false);
  const [activeId,   setActiveId]   = useState(LIVE_CHANNELS[0].id);
  const [loadFailed, setLoadFailed] = useState({});

  const activeChannel = LIVE_CHANNELS.find(c => c.id === activeId) || LIVE_CHANNELS[0];
  const embedUrl = getEmbedUrl(activeChannel);

  const handleChannelChange = (id) => {
    setActiveId(id);
    setLoadFailed(prev => ({ ...prev, [id]: false }));
  };

  return (
    <section className="mb-8">
      {/* ── Section header ────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-4 cursor-pointer select-none"
        onClick={() => setIsOpen(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gray-900 dark:bg-gray-800 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 border border-[var(--color-border)]">
            <Tv2 size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--color-text)] leading-tight">Live TV</h2>
              <LiveDot />
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] leading-tight">
              {LIVE_CHANNELS.length} channels · 24/7 live
            </p>
          </div>
        </div>

        <button className="p-1.5 rounded-full hover:bg-[var(--color-surface2)] text-[var(--color-text-tertiary)] transition-colors">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Collapsible body ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="livetv-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            {/* Channel selector tabs */}
            <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-4 pb-1">
              {LIVE_CHANNELS.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => handleChannelChange(ch.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                    whitespace-nowrap flex-shrink-0 transition-all duration-200 border
                    ${activeId === ch.id
                      ? "text-white shadow-md border-transparent"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)]"
                    }
                  `}
                  style={activeId === ch.id ? { backgroundColor: ch.color } : {}}
                >
                  <span>{ch.flag}</span>
                  {ch.name}
                </button>
              ))}
            </div>

            {/* Player */}
            <motion.div
              key={activeId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="card overflow-hidden"
            >
              {/* 16:9 iframe */}
              {!loadFailed[activeId] ? (
                <div className="relative bg-black" style={{ paddingTop: "56.25%" }}>
                  <iframe
                    key={activeId}
                    className="absolute inset-0 w-full h-full"
                    src={embedUrl}
                    title={`${activeChannel.name} Live`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    onError={() => setLoadFailed(prev => ({ ...prev, [activeId]: true }))}
                  />

                  {/* Channel name overlay */}
                  <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
                    <span
                      className="text-white text-xs font-bold px-2.5 py-1 rounded-full backdrop-blur-sm"
                      style={{ backgroundColor: activeChannel.color + "cc" }}
                    >
                      {activeChannel.flag} {activeChannel.name}
                    </span>
                    <span className="flex items-center gap-1 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Live
                    </span>
                  </div>
                </div>
              ) : (
                /* Fallback when embed fails */
                <div
                  className="flex flex-col items-center justify-center gap-4 py-16"
                  style={{ background: `linear-gradient(135deg, ${activeChannel.color}22, ${activeChannel.color}11)` }}
                >
                  <span className="text-5xl">{activeChannel.flag}</span>
                  <div className="text-center">
                    <p className="font-semibold text-[var(--color-text)] mb-1">
                      {activeChannel.name} Live
                    </p>
                    <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
                      Live stream not available in embedded view
                    </p>
                    <a
                      href={activeChannel.ytUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: activeChannel.color }}
                    >
                      Watch on YouTube <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )}

              {/* Footer bar */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <LiveDot />
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {activeChannel.name}
                  </span>
                  <span className="text-xs text-[var(--color-text-tertiary)]">· Live stream</span>
                </div>
                <a
                  href={activeChannel.ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-medium text-brand-blue hover:underline"
                >
                  YouTube <ExternalLink size={11} />
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
