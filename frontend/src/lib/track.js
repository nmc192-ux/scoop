// Lightweight event tracker. Writes to three destinations:
//   1) Scoop backend /api/track  — structured events in the analytics table.
//   2) GA4 (window.gtag)         — when available (currently only article SSR pages).
//   3) Console (dev)             — so we can see what's firing during development.
//
// Events should be from the whitelist in backend/src/routes/track.js; anything
// else is dropped server-side.
//
// Use beacon-style transport (keepalive) so dwell_time / scroll_depth events
// fire on page unload reliably.

const IS_DEV = import.meta.env?.DEV;

function postEvent(payload) {
  const url = "/api/track";
  const body = JSON.stringify(payload);
  try {
    // sendBeacon is the most reliable on unload — text/plain is the only
    // content-type it supports by default.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "text/plain" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function track(event, data = {}) {
  if (!event) return;
  if (IS_DEV) console.debug("[track]", event, data);

  postEvent({ event, ...data });

  // Mirror to GA4 if available (it only loads on SSR article pages today,
  // but this hook is ready for Phase 1 SPA GA4).
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      const { articleId, category, metadata = {} } = data;
      window.gtag("event", event, {
        article_id: articleId,
        category,
        ...metadata,
      });
    }
  } catch {}
}

// Convenience helpers for the most common event shapes.
export const trackPageView = (metadata = {}) => track("page_view", { metadata });
export const trackArticleView = (articleId, category, metadata = {}) =>
  track("article_view", { articleId, category, metadata });
export const trackOutboundClick = (articleId, category, url) =>
  track("article_click_outbound", { articleId, category, metadata: { url } });
export const trackShare = (articleId, network) =>
  track("share_click", { articleId, metadata: { network } });
export const trackSave = (articleId, category) =>
  track("save_article", { articleId, category });
export const trackUnsave = (articleId, category) =>
  track("unsave_article", { articleId, category });
export const trackSearch = (query) =>
  track("search", { metadata: { q: String(query || "").slice(0, 120) } });
export const trackTopicSelect = (topic) =>
  track("topic_select", { metadata: { topic } });

// Attach scroll-depth + dwell-time observers to the window. Idempotent —
// safe to call multiple times.
let observersAttached = false;
export function attachEngagementObservers() {
  if (observersAttached || typeof window === "undefined") return;
  observersAttached = true;

  const fired = { d25: false, d50: false, d75: false, t30: false, t60: false };

  const onScroll = () => {
    const doc = document.documentElement;
    const pct = (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1);
    if (pct > 0.25 && !fired.d25) { fired.d25 = true; track("scroll_depth_25"); }
    if (pct > 0.50 && !fired.d50) { fired.d50 = true; track("scroll_depth_50"); }
    if (pct > 0.75 && !fired.d75) { fired.d75 = true; track("scroll_depth_75"); }
  };

  let lastActivity = Date.now();
  const bumpActivity = () => { lastActivity = Date.now(); };
  const tick = () => {
    // Only count dwell while tab is visible to avoid counting background tabs.
    if (document.visibilityState !== "visible") return;
    const dwellMs = Date.now() - pageLoadedAt;
    if (dwellMs > 30_000 && !fired.t30) { fired.t30 = true; track("dwell_time_30s"); }
    if (dwellMs > 60_000 && !fired.t60) { fired.t60 = true; track("dwell_time_60s"); }
  };

  const pageLoadedAt = Date.now();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("click", bumpActivity, { passive: true });
  window.addEventListener("keydown", bumpActivity);
  const timer = setInterval(tick, 10_000);
  window.addEventListener("beforeunload", () => clearInterval(timer));
}
