/**
 * /api/videos-gen — video generation job queue admin API.
 *
 * All routes are WAF-protected via the /scoop-ops/* prefix configured in
 * server.js. No external auth beyond the shared OPS_SECRET header.
 *
 * GET  /api/videos-gen/status       — pipeline + queue stats
 * GET  /api/videos-gen/queue        — list jobs (filterable by status)
 * POST /api/videos-gen/enqueue      — manually queue an article
 * POST /api/videos-gen/approve/:id  — approve a 'ready' job for auto-publish
 * POST /api/videos-gen/reject/:id   — reject a 'ready' job
 * POST /api/videos-gen/run          — run one batch cycle (renders up to N jobs)
 * GET  /api/videos-gen/preview/:id  — return base64 thumbnail PNG for a job
 */

import { Router } from "express";
import {
  listVideoJobs,
  getVideoJobById,
  approveVideoJob,
  rejectVideoJob,
  enqueueVideoJob,
  setVideoJobRendering,
  setVideoJobReady,
  setVideoJobFailed,
  findArticlesForVideoQueue,
  getArticleById,
} from "../models/database.js";
import { isVideoConfigured, generateVideo, previewSlide } from "../services/videoGenerator.js";
import { isTtsConfigured, ttsProvider } from "../services/ttsService.js";
import { logger } from "../services/logger.js";

const router = Router();

// ─── Status ──────────────────────────────────────────────────────────────────
router.get("/status", (_req, res) => {
  const jobs = listVideoJobs({ limit: 1000 });
  const byStatus = {};
  for (const j of jobs) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  }
  res.json({
    configured: isVideoConfigured(),
    ttsConfigured: isTtsConfigured(),
    ttsProvider: ttsProvider(),
    jobsByStatus: byStatus,
    totalJobs: jobs.length,
  });
});

// ─── Queue listing ───────────────────────────────────────────────────────────
router.get("/queue", (req, res) => {
  const { status = null, limit = 50, offset = 0 } = req.query;
  const jobs = listVideoJobs({ status: status || null, limit: parseInt(limit), offset: parseInt(offset) });
  res.json({ jobs, count: jobs.length });
});

// ─── Manually enqueue ────────────────────────────────────────────────────────
router.post("/enqueue", (req, res) => {
  const { articleId } = req.body || {};
  if (!articleId) return res.status(400).json({ error: "articleId required" });
  const article = getArticleById(articleId);
  if (!article) return res.status(404).json({ error: "article not found" });
  const jobId = enqueueVideoJob(articleId);
  res.json({ jobId, article: { id: article.id, title: article.title } });
});

// ─── Approve / reject ─────────────────────────────────────────────────────────
router.post("/approve/:id", (req, res) => {
  const job = getVideoJobById(parseInt(req.params.id));
  if (!job) return res.status(404).json({ error: "job not found" });
  if (!["ready", "review_approved"].includes(job.status)) {
    return res.status(400).json({ error: `job status is '${job.status}', cannot approve` });
  }
  approveVideoJob(job.id);
  res.json({ ok: true, jobId: job.id, status: "review_approved" });
});

router.post("/reject/:id", (req, res) => {
  const job = getVideoJobById(parseInt(req.params.id));
  if (!job) return res.status(404).json({ error: "job not found" });
  rejectVideoJob(job.id);
  res.json({ ok: true, jobId: job.id, status: "review_rejected" });
});

// ─── Preview thumbnail ───────────────────────────────────────────────────────
router.get("/preview/:id", async (req, res) => {
  const job = getVideoJobById(parseInt(req.params.id));
  if (!job) return res.status(404).json({ error: "job not found" });

  if (job.thumbnail_b64) {
    return res.json({ thumbnailB64: job.thumbnail_b64 });
  }

  // Render on demand
  const article = getArticleById(job.article_id);
  if (!article) return res.status(404).json({ error: "article not found" });

  const b64 = await previewSlide(article).catch(() => null);
  res.json({ thumbnailB64: b64 });
});

// ─── Run batch ───────────────────────────────────────────────────────────────
// Picks up to `batchSize` queued jobs, renders them, marks ready for review.
// This is safe to call from a cron (idempotent, serial within request).
router.post("/run", async (req, res) => {
  if (!isVideoConfigured()) {
    return res.json({ ok: false, reason: "ffmpeg not configured", processed: 0 });
  }

  const batchSize = Math.min(parseInt(req.body?.batchSize || 3), 10);
  const results = [];

  // 1. Find queued jobs
  const queued = listVideoJobs({ status: "queued", limit: batchSize });

  // 2. If fewer than batchSize queued jobs, auto-enqueue fresh articles
  if (queued.length < batchSize) {
    const toQueue = findArticlesForVideoQueue({
      minCredibility: 7,
      withinMs: 24 * 60 * 60 * 1000,
      limit: batchSize - queued.length,
    });
    for (const a of toQueue) {
      const jid = enqueueVideoJob(a.id);
      queued.push({ id: jid, article_id: a.id });
    }
  }

  // 3. Render each job
  for (const job of queued.slice(0, batchSize)) {
    const jobId = job.id;
    const articleId = job.article_id;
    setVideoJobRendering(jobId);

    try {
      const article = getArticleById(articleId);
      if (!article) throw new Error("article not found");

      const result = await generateVideo(article);

      if (!result) {
        setVideoJobFailed(jobId, "generateVideo returned null (ffmpeg/fonts unavailable)");
        results.push({ jobId, articleId, ok: false, reason: "ffmpeg unavailable" });
        continue;
      }

      // Optionally render a thumbnail for the admin UI
      const thumbB64 = await previewSlide(article).catch(() => null);

      setVideoJobReady(jobId, {
        outputPath:   result.outputPath,
        hasAudio:     result.hasAudio,
        durationSecs: result.durationSecs,
        thumbnailB64: thumbB64,
      });

      results.push({
        jobId, articleId, ok: true,
        outputPath: result.outputPath,
        hasAudio: result.hasAudio,
        durationSecs: result.durationSecs,
      });

      logger.info(`video batch: job ${jobId} → ready (${result.outputPath})`);
    } catch (err) {
      setVideoJobFailed(jobId, err.message);
      results.push({ jobId, articleId, ok: false, reason: err.message });
      logger.error(`video batch: job ${jobId} failed: ${err.message}`);
    }
  }

  res.json({ ok: true, processed: results.length, results });
});

export default router;
