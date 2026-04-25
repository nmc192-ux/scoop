import cron from "node-cron";
import { fetchAllSources } from "./rssFetcher.js";
import { fetchAllYouTube } from "./videoFetcher.js";
import { enrichBatch } from "./contentEnricher.js";
import { pruneOldArticles } from "../models/database.js";
import { logger } from "./logger.js";
import { RSS_SOURCES, YOUTUBE_SOURCES } from "../config/sources.js";
import { sendDailyDigest } from "./digest.js";
import { refreshAllEvents } from "./liveEvents.js";
import { runBreakingNewsPush } from "./breakingNewsPusher.js";

let isRunning    = false;
let isVideoRun   = false;
let isEnrichRun  = false;
let isEventsRun  = false;
let lastRun      = null;
let lastVideoRun = null;
let lastEnrichRun = null;
let lastEventsRun = null;
let nextRun      = null;

export function startScheduler() {
  logger.info("⏰ Scheduler initialized — 30 min news, 60 min video, 15 min enrich, 60 min events");
  runIngestionCycle();
  runVideoCycle();
  setTimeout(runEnrichCycle, 60_000);
  // Delay first events pass — it needs some ingested articles to work with.
  setTimeout(runEventsCycle, 90_000);
  cron.schedule("*/30 * * * *", () => runIngestionCycle());
  cron.schedule("0 * * * *",    () => runVideoCycle());
  cron.schedule("*/15 * * * *", () => runEnrichCycle());
  cron.schedule("0 * * * *",    () => runEventsCycle());
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

function updateNextRun() {
  nextRun = new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

export function getSchedulerStatus() {
  return { isRunning, isVideoRun, isEnrichRun, isEventsRun,
           lastRun, lastVideoRun, lastEnrichRun, lastEventsRun, nextRun,
           sourceCount: RSS_SOURCES.length, videoChannels: YOUTUBE_SOURCES.length };
}

export async function triggerManualRefresh() {
  logger.info("🔄 Manual refresh (news + videos)");
  return Promise.allSettled([
    runIngestionCycle(),
    runVideoCycle(),
  ]);
}
