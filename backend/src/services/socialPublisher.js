// Per-platform auto-poster. Currently wired for Bluesky; the shape is
// designed so adding Threads / X / LinkedIn is a matter of dropping in a
// new adapter object.
//
// Each cycle picks one fresh, high-credibility article that hasn't been
// posted to that platform yet, composes the platform-specific caption,
// fetches the branded OG card as a thumbnail, and ships it. Result is
// recorded in social_posts so the same story never double-posts.
//
// Cadence guard: each adapter has a `minIntervalMs`. If the last successful
// post on that platform was more recent than that, this cycle is a no-op.

import {
  findFreshUnpostedArticles,
  recordSocialPost,
  lastPostAt,
} from "../models/database.js";
import { composeAllPlatforms } from "./socialComposer.js";
import { ensureCard } from "./cardRenderer.js";
import { isBlueskyConfigured, postToBluesky } from "./blueskyClient.js";
import { logger } from "./logger.js";

const SITE = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");

// One adapter per platform. `enabled()` returns whether the env is set up;
// `post()` returns { url, platformPostId } on success or throws.
const ADAPTERS = {
  bluesky: {
    name: "bluesky",
    minIntervalMs: 30 * 60 * 1000, // 30 min — we hover around 8-12 posts/day max
    composeKey: "bluesky", // matches socialComposer's platform key
    enabled: isBlueskyConfigured,
    async post(article, composed, thumbBuffer) {
      const externalUrl = `${SITE}/article/${encodeURIComponent(article.id)}?utm_source=social_bluesky&utm_medium=social&utm_campaign=scoop_auto`;
      const out = await postToBluesky({
        text: composed.caption,
        externalUrl,
        externalTitle: article.title,
        externalDescription: article.description || "",
        thumbBuffer,
      });
      return { url: out.url, platformPostId: out.uri };
    },
  },
};

function adapterFor(platform) {
  const a = ADAPTERS[platform];
  if (!a) throw new Error(`unknown platform: ${platform}`);
  return a;
}

// Run one platform's cycle. Returns a result object describing what
// happened — never throws (safe to call from cron tail).
export async function runPlatformCycle(platform, { dryRun = false, minCredibility, withinMs } = {}) {
  const adapter = adapterFor(platform);

  if (!adapter.enabled()) {
    return { platform, posted: false, reason: "not_configured" };
  }

  const last = lastPostAt(platform);
  if (last && Date.now() - last < adapter.minIntervalMs && !dryRun) {
    return { platform, posted: false, reason: "cadence_guard", lastAt: last };
  }

  const candidates = findFreshUnpostedArticles({
    platform,
    minCredibility: minCredibility ?? 7,
    withinMs: withinMs ?? 12 * 60 * 60 * 1000,
    limit: 5,
  });

  const article = candidates[0];
  if (!article) return { platform, posted: false, reason: "no_candidate" };

  let composed;
  try {
    const all = composeAllPlatforms(article);
    composed = all.platforms[adapter.composeKey];
    if (!composed) throw new Error(`composer missing platform: ${adapter.composeKey}`);
  } catch (err) {
    return { platform, posted: false, reason: "compose_failed", error: err.message };
  }

  let thumbBuffer = null;
  try { thumbBuffer = (await ensureCard(article, "og")).buffer; }
  catch (err) { logger.warn(`socialPublisher: card render failed for ${article.id}: ${err.message}`); }

  if (dryRun) {
    return {
      platform,
      posted: false,
      reason: "dry_run",
      article: { id: article.id, title: article.title, category: article.category },
      caption: composed.caption,
      thumbBytes: thumbBuffer ? thumbBuffer.length : 0,
    };
  }

  try {
    const result = await adapter.post(article, composed, thumbBuffer);
    recordSocialPost({
      articleId: article.id,
      platform,
      status: "posted",
      platformPostId: result.platformPostId,
      url: result.url,
      caption: composed.caption,
    });
    logger.info(`📣 ${platform} posted: "${article.title.slice(0, 60)}" → ${result.url || result.platformPostId}`);
    return { platform, posted: true, article: { id: article.id, title: article.title }, ...result };
  } catch (err) {
    recordSocialPost({
      articleId: article.id,
      platform,
      status: "failed",
      caption: composed.caption,
      error: String(err.message || err).slice(0, 500),
    });
    logger.error(`socialPublisher ${platform} post failed: ${err.message}`);
    return { platform, posted: false, reason: "post_failed", error: err.message };
  }
}

// Run all configured platforms in series. Used by the scheduler tail step.
export async function runAllPlatformsCycle(opts = {}) {
  const out = {};
  for (const platform of Object.keys(ADAPTERS)) {
    out[platform] = await runPlatformCycle(platform, opts);
  }
  return out;
}

export function listEnabledPlatforms() {
  return Object.entries(ADAPTERS)
    .filter(([, a]) => a.enabled())
    .map(([name]) => name);
}
