import express from "express";
import { getVideos, getVideosByCategories, getVideoCount } from "../models/database.js";
import { logger } from "../services/logger.js";

const router = express.Router();

// GET /api/videos — list videos, optionally filtered by category
router.get("/", (req, res) => {
  try {
    const { category, limit = 24, offset = 0 } = req.query;
    const videos = getVideos({
      category: category || null,
      limit: Math.min(parseInt(limit), 60),
      offset: parseInt(offset),
    });
    res.json({ success: true, data: videos, meta: { count: videos.length } });
  } catch (err) {
    logger.error("Error fetching videos", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch videos" });
  }
});

// GET /api/videos/by-categories — videos for multiple categories (sidebar/widgets)
router.get("/by-categories", (req, res) => {
  try {
    const { categories, limit = 12 } = req.query;
    const cats = categories ? categories.split(",").filter(Boolean) : [];
    const videos = getVideosByCategories(cats, Math.min(parseInt(limit), 30));
    res.json({ success: true, data: videos });
  } catch (err) {
    logger.error("Error fetching videos by categories", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch videos" });
  }
});

// GET /api/videos/stats
router.get("/stats", (req, res) => {
  try {
    const count = getVideoCount();
    res.json({ success: true, data: count });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch video stats" });
  }
});

export default router;
