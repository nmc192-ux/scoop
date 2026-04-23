/**
 * Media Authenticity — how much Scoop trusts each outlet for a given
 * beat. Used by the live-events synthesizer to rank which articles feed
 * into the LLM prompt (or the fallback timeline) so the most reputable
 * on-the-ground reporting surfaces first.
 *
 * Shape:
 *   GLOBAL[outlet]            → baseline credibility 0..10
 *   BY_TOPIC[topic][outlet]   → override for a specific beat
 *   BY_REGION[region][outlet] → override for a specific region
 *
 * Scores are deliberately coarse — this is a ranking signal, not a
 * rating system. The intent follows the user's direction: "Scoop should
 * be able to decide which is the most authentic source in each case"
 * (e.g. Al Jazeera for Middle East, Reuters for wire reporting, local
 * outlets for their own country).
 *
 * When we add dynamic scoring later it will layer on top of these
 * baselines (correction history, primary-source weighting, etc.).
 */

// ── Baseline credibility for globally-active outlets ──────────────────
export const GLOBAL = {
  "Reuters":              9.5,
  "Associated Press":     9.5,
  "AP":                   9.5,
  "BBC News":             9.2,
  "BBC":                  9.2,
  "BBC World":            9.2,
  "The Guardian":         8.8,
  "Financial Times":      9.0,
  "The Wall Street Journal": 8.9,
  "The New York Times":   8.8,
  "The Washington Post":  8.6,
  "NPR":                  8.8,
  "PBS NewsHour":         8.8,
  "Bloomberg":            8.8,
  "The Economist":        8.9,
  "Al Jazeera":           8.6,
  "Al Jazeera English":   8.6,
  "Deutsche Welle":       8.5,
  "DW News":              8.5,
  "France 24":            8.3,
  "CNN":                  7.8,
  "Axios":                8.0,
  "POLITICO":             8.2,
  "The Hill":             7.5,
};

// ── Topic-specific overrides — "who does this beat best?" ─────────────
// Higher values (↑) mean this outlet is especially strong on this beat;
// lower (↓) mean we trust them less here than their global baseline.
export const BY_TOPIC = {
  "middle-east": {
    "Al Jazeera":         9.4,  // ↑ on-the-ground ME coverage
    "Al Jazeera English": 9.4,
    "Reuters":            9.5,
    "BBC News":           9.2,
    "The Times of Israel": 8.6,
  },
  "tech": {
    "Ars Technica":       8.8,
    "The Verge":          8.4,
    "Wired":              8.5,
    "TechCrunch":         7.8,
    "MIT Technology Review": 9.0,
  },
  "business": {
    "Financial Times":    9.4,
    "Bloomberg":          9.2,
    "The Wall Street Journal": 9.1,
    "Reuters":            9.5,
  },
  "science": {
    "Nature":             9.6,
    "Science":            9.6,
    "Scientific American": 9.0,
    "BBC News":           8.8,
  },
};

// ── Regional overrides — trusted local outlets per country ────────────
export const BY_REGION = {
  "PK": {
    "Dawn":                  8.8,
    "The News International": 8.2,
    "Express Tribune":       7.8,
    "Geo News":              7.4,
  },
  "IN": {
    "The Hindu":             8.6,
    "The Indian Express":    8.4,
    "Hindustan Times":       7.8,
    "NDTV":                  7.8,
  },
  "GB": {
    "BBC News":              9.3, // ↑ home country
    "The Guardian":          8.9,
    "Financial Times":       9.2,
  },
  "US": {
    "The New York Times":    8.9,
    "The Washington Post":   8.7,
    "Associated Press":      9.5,
    "NPR":                   8.9,
  },
  "AE": {
    "The National":          8.2,
    "Gulf News":             7.6,
  },
};

/**
 * Resolve the best score for an outlet, optionally considering a topic
 * and/or a region. Specificity wins: region-override > topic-override >
 * global baseline > default (7.0).
 */
export function scoreFor(outletName, { topic = null, region = null } = {}) {
  if (!outletName) return 7.0;
  if (region && BY_REGION[region]?.[outletName] != null) {
    return BY_REGION[region][outletName];
  }
  if (topic && BY_TOPIC[topic]?.[outletName] != null) {
    return BY_TOPIC[topic][outletName];
  }
  return GLOBAL[outletName] ?? 7.0;
}

/**
 * Given a list of article-like objects, return them sorted by
 * authenticity score descending. Articles must have a `source_name`.
 */
export function rankByAuthenticity(articles, ctx = {}) {
  return [...articles].sort((a, b) => {
    const sa = scoreFor(a.source_name, ctx);
    const sb = scoreFor(b.source_name, ctx);
    if (sa !== sb) return sb - sa;
    return (b.published_at || 0) - (a.published_at || 0);
  });
}
