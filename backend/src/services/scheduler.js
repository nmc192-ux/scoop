import cron from "node-cron";
import { fetchAllSources } from "./rssFetcher.js";
import { fetchAllYouTube } from "./videoFetcher.js";
import { pruneOldArticles } from "../models/database.js";
import { logger } from "./logger.js";
import { RSS_SOURCES, YOUTUBE_SOURCES } from "../config/sources.js";

let isRunning    = false;
let isVideoRun   = false;
let lastRun      = null;
let lastVideoRun = null;
let nextRun      = null;

export function startScheduler() {
  logger.info("⏰ Scheduler initialized — 30 min news, 60 min video");
  runIngestionCycle();
  runVideoCycle();
  cron.schedule("*/30 * * * *", () => runIngestionCycle());
  cron.schedule("0 * * * *",    () => runVideoCycle());
  cron.schedule("0 3 * * *",    async () => {
    logger.info("🧹 Pruning...");
    const n = pruneOldArticles(7);
    logger.info(`🧹 Pruned ${n} records`);
  });
  updateNextRun();
}

async function runIngestionCycle() {
  if (isRunning) { logger.warn("⏸️ News already running"); return; }
  isRunning = true;
  lastRun   = new Date().toISOString();
  logger.info(`🔄 News ingestion [${RSS_SOURCES.length} sources]`);
  try {
    const r = await fetchAllSources(RSS_SOURCES);
    logger.info(`📰 Done: +${r.totalNew} in ${r.duration}ms`);
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
  return { isRunning, isVideoRun, lastRun, lastVideoRun, nextRun,
           sourceCount: RSS_SOURCES.length, videoChannels: YOUTUBE_SOURCES.length };
}

export async function triggerManualRefresh() {
  logger.info("🔄 Manual refresh (news + videos)");
  return Promise.allSettled([
    runIngestionCycle(),
    runVideoCycle(),
  ]);
}
