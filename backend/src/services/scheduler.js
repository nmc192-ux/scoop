import cron from "node-cron";
import { fetchAllSources } from "./rssFetcher.js";
import { fetchAllYouTube } from "./videoFetcher.js";
import { enrichBatch } from "./contentEnricher.js";
import { pruneOldArticles, findArticlesForVideoQueue, enqueueVideoJob,
         setVideoJobRendering, setVideoJobReady, setVideoJobFailed,
         getArticleById } from "../models/database.js";
import { logger } from "./logger.js";
import { RSS_SOURCES, YOUTUBE_SOURCES } from "../config/sources.js";
import { sendDailyDigest } from "./digest.js";
import { refreshAllEvents } from "./liveEvents.js";
import { runBreakingNewsPush } from "./breakingNewsPusher.js";
import { runAllPlatformsCycle, listEnabledPlatforms } from "./socialPublisher.js";
import { isVideoConfigured, generateVideo, previewSlide } from "./videoGenerator.js";

let isRunning    = false;
let isVideoRun   = false;   // YouTube ingestion
let isGenRun     = false;   // short-form video generation
let isEnrichRun  = false;
let isEventsRun  = false;
let lastRun      = null;
let lastVideoRun = null;
let lastGenRun   = null;
let lastEnrichRun = null;
let lastEventsRun = null;
let nextRun      = null;

export function startScheduler() {
  logger.info("⏰ Scheduler initialized — 30 min news, 60 min video, 15 min enrich, 60 min events, 2 AM video gen");
  runIngestionCycle();
  runVideoCycle();
  setTimeout(runEnrichCycle, 60_000);
  // Delay first events pass — it needs some ingested articles to work with.
  setTimeout(runEventsCycle, 90_000);
  cron.schedule("*/30 * * * *", () => runIngestionCycle());
  cron.schedule("0 * * * *",    () => runVideoCycle());
  cron.schedule("*/15 * * * *", () => runEnrichCycle());
  cron.schedule("0 * * * *",    () => runEventsCycle());
  // Short-form video generation — runs at 2 AM nightly if ffmpeg is configured.
  // Generates 3 videos per batch, places them in the review queue.
  // Auto-publish is disabled until the admin approves via /scoop-ops/videos-gen.
  cron.schedule("0 2 * * *", () => runVideoGenCycle({ batchSize: 3 }));
  // Daily digest at 07:00 server time — no-op if SMTP is not configured.
  cron.schedule("0 7 * * *", async () => {
    try {
      await sendDailyDigest();
    } catch (err) {
      logger.error("❌ Digest failed", { error: err.message });
    }
  });
  cron.schedule("0 3 * * *",    async () => {
    logger.info("🧹 Pruning...");
    const n = pruneOldArticles(7);
    logger.info(`🧹 Pruned ${n} records`);
  });
  updateNextRun();
}

async function runEventsCycle() {
  if (isEventsRun) return;
  isEventsRun = true;
  lastEventsRun = new Date().toISOString();
  try {
    await refreshAllEvents();
  } catch (err) {
    logger.error("❌ Events refresh failed", { error: err.message });
  } finally {
    isEventsRun = false;
  }
}

async function runEnrichCycle() {
  if (isEnrichRun) return;
  isEnrichRun = true;
  lastEnrichRun = new Date().toISOString();
  try {
    await enrichBatch({ batchSize: 40, concurrency: 4 });
  } catch (err) {
    logger.error("❌ Enrich failed", { error: err.message });
  } finally {
    isEnrichRun = false;
  }
}

async function runIngestionCycle() {
  if (isRunning) { logger.warn("⏸️ News already running"); return; }
  isRunning = true;
  lastRun   = new Date().toISOString();
  logger.info(`🔄 News ingestion [${RSS_SOURCES.length} sources]`);
  try {
    const r = await fetchAllSources(RSS_SOURCES);
    logger.info(`📰 Done: +${r.totalNew} in ${r.duration}ms`);
    // Tail step: if a fresh high-credibility article landed, fan it out as a
    // push. Skipped silently if no candidate, in quiet hours, or push is
    // disabled. Errors here must not break the ingest cycle.
    if (String(process.env.ENABLE_BREAKING_PUSH ?? "true").toLowerCase() !== "false") {
      try { await runBreakingNewsPush(); }
      catch (err) { logger.error("❌ Breaking push failed", { error: err.message }); }
    }
    // Tail step: auto-post to social. Each adapter's own minIntervalMs
    // throttles how often it actually fires; if no platform is configured
    // (env vars missing) this is a near-instant no-op.
    if (String(process.env.ENABLE_AUTO_SOCIAL ?? "true").toLowerCase() !== "false") {
      const enabled = listEnabledPlatforms();
      if (enabled.length) {
        try { await runAllPlatformsCycle(); }
        catch (err) { logger.error("❌ Auto-social failed", { error: err.message }); }
      }
    }
  } catch (err) {
    logger.error("❌ News failed", { error: err.message });
  } finally {
    isRunning = false;
    updateNextRun();
  }
}

async function runVideoCycle() {
  if (isVideoRun) { logger.warn("⏸️ Videos already running"); return; }
  isVideoRun   = true;
  lastVideoRun = new Date().toISOString();
  logger.info(`📺 YouTube ingestion [${YOUTUBE_SOURCES.length} channels]`);
  try {
    const r = await fetchAllYouTube();
    logger.info(`📺 Done: +${r.totalNew} videos`);
  } catch (err) {
    logger.error("❌ YouTube failed", { error: err.message });
  } finally {
    isVideoRun = false;
  }
}

// ─── Short-form video generation ────────────────────────────────────────────
// Renders short-form MP4 clips for fresh articles and queues them for review.
// This is resource-intensive — run off-peak (2 AM) and keep batches small.
export async function runVideoGenCycle({ batchSize = 3 } = {}) {
  if (isGenRun) { logger.warn("⏸️ Video gen already running"); return; }
  if (!isVideoConfigured()) return; // silent no-op when ffmpeg not installed

  isGenRun   = true;
  lastGenRun = new Date().toISOString();
  logger.info(`🎬 Video gen batch (size=${batchSize})`);

  try {
    const toRender = findArticlesForVideoQueue({ minCredibility: 7, limit: batchSize });
    if (!toRender.length) { logger.info("🎬 No candidates for video gen"); return; }

    for (const article of toRender) {
      const jobId = enqueueVideoJob(article.id);
      setVideoJobRendering(jobId);
      try {
        const result = await generateVideo(article);
        if (!result) { setVideoJobFailed(jobId, "generate returned null"); continue; }
        const thumbB64 = await previewSlide(article).catch(() => null);
        setVideoJobReady(jobId, {
          outputPath:   result.outputPath,
          hasAudio:     result.hasAudio,
          durationSecs: result.durationSecs,
          thumbnailB64: thumbB64,
        });
        logger.info(`🎬 Rendered job ${jobId} for "${article.title?.slice(0, 50)}"`);
      } catch (err) {
        setVideoJobFailed(jobId, err.message);
        logger.error(`🎬 Job ${jobId} failed: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error("❌ Video gen cycle failed", { error: err.message });
  } finally {
    isGenRun = false;
  }
}

function updateNextRun() {
  nextRun = new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

export function getSchedulerStatus() {
  return {
    isRunning, isVideoRun, isGenRun, isEnrichRun, isEventsRun,
    lastRun, lastVideoRun, lastGenRun, lastEnrichRun, lastEventsRun, nextRun,
    sourceCount: RSS_SOURCES.length, videoChannels: YOUTUBE_SOURCES.length,
    videoGenConfigured: isVideoConfigured(),
  };
}

export async function triggerManualRefresh() {
  logger.info("🔄 Manual refresh (news + videos)");
  return Promise.allSettled([
    runIngestionCycle(),
    runVideoCycle(),
  ]);
}
