import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tv2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useLiveStreams } from "../../hooks/useLiveStreams";

/* ─── Channel config ─────────────────────────────────────────────────────────
   All channels are rendered in-app through YouTube embeds.
   We prefer live video IDs from /api/live-stream and fall back to channel embeds.
   ────────────────────────────────────────────────────────────────────────── */
const LIVE_CHANNELS = [
  {
    id:              "aljazeera",
    name:            "Al Jazeera",
    flag:            "🌍",
    color:           "#C8A951",
    fallbackVideoId: "gCNeDWCI0vo",
    channelId:       "UCNye-wNBqNL5ZzHSJj3l8Bg",
  },
  {
    id:              "bbc",
    name:            "BBC News",
    flag:            "🇬🇧",
    color:           "#BB1919",
    fallbackVideoId: null,
    channelId:       "UC16niRr50-MSBwiO3YDb3RA",
  },
  {
    id:              "skynews",
    name:            "Sky News",
    flag:            "🇬🇧",
    color:           "#E8000D",
    fallbackVideoId: "9lFYDRvw7ns",
    channelId:       "UCoMdktPbSTixAyNGwb-UYkQ",
  },
  {
    id:              "dw",
    name:            "DW News",
    flag:            "🇩🇪",
    color:           "#0000A0",
    fallbackVideoId: "LuKwFajn37U",
    channelId:       "UCknLrEdhRCp1aegoMqRaCZg",
  },
  {
    id:              "france24",
    name:            "France 24",
    flag:            "🇫🇷",
    color:           "#003F8F",
    fallbackVideoId: "Ap-UM1O9RBU",
    channelId:       "UCQfwfsi5VrQ8yKZ-UWmAEFg",
  },
  {
    id:              "geo",
    name:            "Geo News",
    flag:            "🇵🇰",
    color:           "#009900",
    fallbackVideoId: "_FwympjOSNE",
    channelId:       "UCxKj5OJM26Kue68JrXjmYxg",
  },
  {
    id:              "ary",
    name:            "ARY News",
    flag:            "🇵🇰",
    color:           "#003399",
    fallbackVideoId: null,
    channelId:       "UCMmpLL2ucRHAXbNHiCPyIyg",
  },
  {
    id:              "wion",
    name:            "WION",
    flag:            "🌏",
    color:           "#E63946",
    fallbackVideoId: null,
    channelId:       "UC_gUM8rL-Lrg6O3adPW9K1g",
  },
  {
    id:              "bloomberg",
    name:            "Bloomberg",
    flag:            "📈",
    color:           "#1F8EFA",
    fallbackVideoId: null,
    channelId:       "UChLynHKFOBCPHb8JMmQZiXA",
  },
];

function getOriginParam() {
  if (typeof window === "undefined" || !window.location?.origin) return "";
  return `&origin=${encodeURIComponent(window.location.origin)}`;
}

function makeVideoEmbed(host, videoId) {
  return `https://${host}/embed/${videoId}?autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${getOriginParam()}`;
}

function makeChannelEmbed(host, channelId) {
  return `https://${host}/embed/live_stream?channel=${channelId}&autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1${getOriginParam()}`;
}

function getEmbedCandidates(ch, liveVideoId) {
  const urls = [];
  const add = (url) => { if (url && !urls.includes(url)) urls.push(url); };

  const videoIds = [liveVideoId, ch.fallbackVideoId].filter(Boolean);
  for (const id of videoIds) {
    add(makeVideoEmbed("www.youtube-nocookie.com", id));
    add(makeVideoEmbed("www.youtube.com", id));
  }

  add(makeChannelEmbed("www.youtube-nocookie.com", ch.channelId));
  add(makeChannelEmbed("www.youtube.com", ch.channelId));

  return urls;
}

/* ─── Pulsing red dot ──────────────────────────────────────────────────────── */
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
  const [isOpen,     setIsOpen]     = useState(true);
  const [activeId,   setActiveId]   = useState(LIVE_CHANNELS[0].id);
  const [loadFailed, setLoadFailed] = useState({});
  const [attemptMap, setAttemptMap] = useState({});
  const iframeRef = useRef(null);

  const { streams } = useLiveStreams();

  const activeChannel = LIVE_CHANNELS.find(c => c.id === activeId) || LIVE_CHANNELS[0];
  const embedCandidates = useMemo(
    () => getEmbedCandidates(activeChannel, streams[activeChannel.id]),
    [activeChannel, streams]
  );
  const activeAttempt = attemptMap[activeId] ?? 0;
  const embedUrl = embedCandidates[Math.min(activeAttempt, Math.max(embedCandidates.length - 1, 0))];
  const canTryAnother = activeAttempt < embedCandidates.length - 1;

  const handleChannelChange = (id) => {
    setActiveId(id);
    setLoadFailed(prev => ({ ...prev, [id]: false }));
    setAttemptMap(prev => ({ ...prev, [id]: 0 }));
  };

  const tryNextSource = () => {
    if (!canTryAnother) {
      setLoadFailed(prev => ({ ...prev, [activeId]: true }));
      return;
    }
    setAttemptMap(prev => ({ ...prev, [activeId]: (prev[activeId] ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!isOpen || loadFailed[activeId]) return undefined;
    let sawPlayerSignal = false;

    const onMessage = (event) => {
      if (!event.origin.includes("youtube.com")) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const data = typeof event.data === "string" ? event.data : JSON.stringify(event.data ?? "");
      if (data.includes("onReady") || data.includes("infoDelivery")) sawPlayerSignal = true;
      if (data.includes("onError")) {
        tryNextSource();
      }
    };

    const timeout = setTimeout(() => {
      if (!sawPlayerSignal) tryNextSource();
    }, 8000);

    window.addEventListener("message", onMessage);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [isOpen, activeId, embedUrl, loadFailed, canTryAnother]);

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
              {LIVE_CHANNELS.length} channels · in-app playback
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

            {/* Player / Link card */}
            <motion.div
              key={activeId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              {!loadFailed[activeId] ? (
                <div className="card overflow-hidden">
                  <div className="relative bg-black" style={{ paddingTop: "56.25%" }}>
                    <iframe
                      ref={iframeRef}
                      key={embedUrl}
                      className="absolute inset-0 w-full h-full"
                      src={embedUrl}
                      title={`${activeChannel.name} Live`}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      onError={tryNextSource}
                    />
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--color-border)]">
                    <div className="flex items-center gap-2">
                      <LiveDot />
                      <span className="text-sm font-semibold text-[var(--color-text)]">{activeChannel.name}</span>
                      <span className="text-xs text-[var(--color-text-tertiary)]">· Live stream</span>
                    </div>
                    <span className="text-xs font-medium text-brand-blue">Playing in app</span>
                  </div>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div
                    className="flex flex-col items-center justify-center gap-4 py-16"
                    style={{ background: `linear-gradient(135deg, ${activeChannel.color}22, ${activeChannel.color}11)` }}
                  >
                    <span className="text-5xl">{activeChannel.flag}</span>
                    <div className="text-center">
                      <p className="font-semibold text-[var(--color-text)] mb-1">{activeChannel.name} Live</p>
                      <p className="text-sm text-[var(--color-text-tertiary)] mb-4">Unable to load this stream right now. The channel may restrict external embeds.</p>
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => {
                            setLoadFailed(prev => ({ ...prev, [activeId]: false }));
                            setAttemptMap(prev => ({ ...prev, [activeId]: 0 }));
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)] transition-colors"
                        >
                          <RefreshCw size={13} /> Retry
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
