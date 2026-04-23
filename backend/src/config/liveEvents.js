/**
 * Live Events — seed config for the "Live" tab.
 *
 * Each entry describes a single ongoing global event that Scoop tracks
 * separately from the main news feed. Phase B hard-codes a short list
 * (currently just the US–Iran situation); Phase C will swap this for an
 * auto-discovered set driven by Google Trends + X/Twitter signals.
 *
 * Shape notes:
 *   keywords      — used by the synthesizer to pull related articles out of
 *                   the DB for brief generation. Matched against title +
 *                   description (case-insensitive, OR).
 *   preferredSources — media outlets Scoop trusts most for this specific
 *                   beat (e.g. Al Jazeera for Middle East tensions). The
 *                   synthesizer up-weights these when selecting source
 *                   articles for each timeline point.
 *   metrics       — which numeric tiles to render. Each entry declares a
 *                   fetcher id; the actual numbers are resolved at refresh
 *                   time by services/liveEvents.js.
 *   ceasefire     — optional ISO timestamp when the current ceasefire
 *                   expires (null if no active ceasefire). Renders as a
 *                   countdown tile.
 */

export const LIVE_EVENTS = [
  {
    id: "us-iran-conflict",
    title: "US–Iran Conflict",
    subtitle: "Middle East tensions, sanctions, and ceasefire talks",
    emoji: "🛡️",
    region: "middle-east",
    status: "active",
    keywords: [
      "iran", "tehran", "ayatollah", "khamenei", "irgc",
      "israel", "netanyahu", "idf",
      "us strike", "us iran", "hormuz", "persian gulf",
      "houthi", "yemen strike",
      "nuclear deal", "jcpoa", "uranium enrichment",
      "ceasefire", "hostage",
    ],
    preferredSources: [
      "Al Jazeera", "Al Jazeera English",
      "Reuters", "BBC News", "Associated Press", "AP",
      "The Times of Israel",
    ],
    topicBeat: "middle-east",   // drives media-authenticity overrides
    // X / Truth Social handles relevant to this event. Ingested via the
    // self-hosted RSSHub instance (RSSHUB_URL). Empty safely → no social
    // section in the dossier.
    xHandles: [
      "AJEnglish",      // Al Jazeera English
      "Reuters",
      "BBCBreaking",
      "AP",
      "netanyahu",      // primary source
      "IDF",
      "khamenei_ir",    // primary source
    ],
    truthSocialHandles: [
      "realDonaldTrump",
    ],
    ceasefire: null, // set to an ISO date like "2026-05-01T00:00:00Z" when active
    metrics: [
      { id: "casualties",     label: "Reported casualties",  icon: "🕊️" },
      { id: "economicLoss",   label: "Economic losses (est.)", icon: "💸" },
      { id: "crudeOil",       label: "Brent crude",            icon: "🛢️" },
      { id: "ceasefireClock", label: "Ceasefire status",       icon: "⏳" },
    ],
    // Manual starting-point metrics (overridden by live fetchers where
    // available). Keeps the UI populated even before the first scheduler
    // run, and gives the LLM a known-good baseline to reconcile against.
    baseline: {
      casualties: { value: null, unit: "people", note: "Aggregated from credible outlets; updates as the synthesizer ingests new reports." },
      economicLoss: { value: null, unit: "USD", note: "Estimates vary widely; Scoop reports the median of cited figures." },
    },
  },
];

export function getEventConfig(id) {
  return LIVE_EVENTS.find((e) => e.id === id) || null;
}
