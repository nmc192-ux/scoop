/**
 * Client-side feed reranker.
 *
 * Takes a chronologically sorted article list (newest first) and reorders by a
 * score that blends:
 *   - recency (3-hour buckets, same logic as backend)
 *   - user preferred topics (large positive boost)
 *   - user preferred sources (medium boost)
 *   - muted sources (filtered out entirely)
 *   - credibility (small tie-breaker)
 *
 * Pure function — no store access — so it's easy to test and safe to memoize.
 */

const PREF_TOPIC_BOOST  = 8;
const PREF_SOURCE_BOOST = 4;
const CRED_WEIGHT       = 0.3;

export function rankArticles(articles, prefs = {}) {
  const {
    preferredTopics  = [],
    preferredSources = [],
    mutedSources     = [],
  } = prefs;

  if (!Array.isArray(articles) || !articles.length) return articles || [];

  const topicSet  = new Set(preferredTopics);
  const prefSrc   = new Set(preferredSources);
  const mutedSrc  = new Set(mutedSources);
  const hasPrefs  = topicSet.size || prefSrc.size;

  const scored = articles
    .filter((a) => !mutedSrc.has(a.source_name))
    .map((a) => {
      // 3-hour bucket of publish time — articles in same bucket are considered equally "fresh"
      const bucket = Math.floor((a.published_at || 0) / (3 * 60 * 60 * 1000));
      let score = bucket;
      if (topicSet.has(a.category))   score += PREF_TOPIC_BOOST;
      if (prefSrc.has(a.source_name)) score += PREF_SOURCE_BOOST;
      score += (a.credibility || 0) * CRED_WEIGHT;
      return { a, score };
    });

  if (!hasPrefs) {
    // No prefs → just return the muted-filtered list in original order.
    return scored.map((x) => x.a);
  }

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return (y.a.published_at || 0) - (x.a.published_at || 0);
  });
  return scored.map((x) => x.a);
}
