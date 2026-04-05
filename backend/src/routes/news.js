import express from "express";
import crypto from "crypto";
import {
  getArticles,
  getDb,
  getFeaturedArticles,
  getArticleById,
  incrementViewCount,
  getTopicCounts,
  getArticleCount,
  getAnalyticsSummary,
  trackEvent,
} from "../models/database.js";
import { getSchedulerStatus, triggerManualRefresh } from "../services/scheduler.js";
import { TOPICS } from "../config/sources.js";
import { logger } from "../services/logger.js";

const router = express.Router();

const COUNTRY_REGION_MAP = {
  pakistan: "pk",
  usa: "us",
  uk: "uk",
  india: "in",
  uae: "ae",
};

const TAB_CATEGORY_MAP = {
  top: null,
  world: ["international", "politics", "publications"],
  "business-finance": ["business"],
  "entertainment-sports": ["sports", "cars"],
  "health-fitness": ["health", "medicine", "public-health", "self-help"],
  ai: ["ai", "agentic-ai"],
  "science-technology": ["science", "computer-science", "tech", "environment", "weather"],
};

const COUNTRY_LABEL_MAP = {
  pakistan: "Pakistan",
  usa: "USA",
  uk: "UK",
  india: "India",
  uae: "UAE",
};

function normalizeCountry(country = "pakistan") {
  const key = String(country || "").toLowerCase().trim();
  return COUNTRY_REGION_MAP[key] ? key : "pakistan";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + "salt_news_2024").digest("hex").slice(0, 16);
}

// GET /api/news - paginated news with optional filters
router.get("/", (req, res) => {
  try {
    const {
      category = null,
      limit = 50,
      offset = 0,
      search = null,
      minCredibility = 0,
      source = null,
      country = "pakistan",
    } = req.query;

    const normalizedCountry = normalizeCountry(country);
    const countryRegion = COUNTRY_REGION_MAP[normalizedCountry];
    let mappedCategory = category || null;
    let mappedCategories = null;
    let regionPrefix = null;

    if (category === "country-focus") {
      if (normalizedCountry === "pakistan") {
        mappedCategory = "pakistan";
      } else {
        mappedCategory = null;
        mappedCategories = null;
        regionPrefix = countryRegion;
      }
    } else if (Array.isArray(TAB_CATEGORY_MAP[category])) {
      mappedCategory = null;
      mappedCategories = TAB_CATEGORY_MAP[category];
    }

    const articles = getArticles({
      category: mappedCategory,
      categories: mappedCategories,
      regionPrefix,
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset),
      search: search || null,
      minCredibility: parseInt(minCredibility),
      source: source || null,
    });

    // Track analytics (privacy-safe, no PII)
    trackEvent("page_view", {
      category,
      ipHash: hashIp(req.ip),
      metadata: { limit, offset },
    });

    res.json({
      success: true,
      data: articles,
      meta: {
        count: articles.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        category,
        country: normalizedCountry,
      },
    });
  } catch (err) {
    logger.error("Error fetching articles", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch articles" });
  }
});

// GET /api/news/featured - featured/hero articles
router.get("/featured", (req, res) => {
  try {
    const { limit = 7 } = req.query;
    const articles = getFeaturedArticles(Math.min(parseInt(limit), 20));
    res.json({ success: true, data: articles });
  } catch (err) {
    logger.error("Error fetching featured articles", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch featured articles" });
  }
});

// GET /api/news/topics - topic list with counts
router.get("/topics", (req, res) => {
  try {
    const normalizedCountry = normalizeCountry(req.query.country);
    const counts = getTopicCounts();
    const countMap = {};
    counts.forEach(({ category, count }) => { countMap[category] = count; });

    const topics = TOPICS.map((t) => {
      if (t.id === "country-focus") {
        const countryCount = normalizedCountry === "pakistan"
          ? (countMap.pakistan || 0)
          : getDb()
              .prepare("SELECT COUNT(*) as n FROM articles WHERE region LIKE ?")
              .get(`${COUNTRY_REGION_MAP[normalizedCountry]}%`).n;
        return {
          ...t,
          label: COUNTRY_LABEL_MAP[normalizedCountry],
          count: countryCount,
        };
      }
      if (Array.isArray(TAB_CATEGORY_MAP[t.id])) {
        const count = TAB_CATEGORY_MAP[t.id].reduce((sum, c) => sum + (countMap[c] || 0), 0);
        return { ...t, count };
      }
      return { ...t, count: countMap[t.id] || 0 };
    });

    res.json({ success: true, data: topics });
  } catch (err) {
    logger.error("Error fetching topics", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch topics" });
  }
});

// GET /api/news/stats - system stats
router.get("/stats", (req, res) => {
  try {
    const summary = getAnalyticsSummary();
    const scheduler = getSchedulerStatus();
    res.json({
      success: true,
      data: {
        ...summary,
        scheduler,
      },
    });
  } catch (err) {
    logger.error("Error fetching stats", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

// GET /api/news/:id - single article
router.get("/:id", (req, res) => {
  try {
    const article = getArticleById(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, error: "Article not found" });
    }

    incrementViewCount(req.params.id);
    trackEvent("article_view", {
      articleId: req.params.id,
      category: article.category,
      ipHash: hashIp(req.ip),
    });

    res.json({ success: true, data: article });
  } catch (err) {
    logger.error("Error fetching article", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to fetch article" });
  }
});

// POST /api/news/refresh - manual refresh trigger
router.post("/refresh", async (req, res) => {
  try {
    const status = getSchedulerStatus();
    if (status.isRunning) {
      return res.json({ success: false, message: "Ingestion already in progress" });
    }

    // Don't await — let it run in background
    triggerManualRefresh().catch(err => logger.error("Manual refresh error", { error: err.message }));

    res.json({ success: true, message: "Refresh triggered in background" });
  } catch (err) {
    logger.error("Error triggering refresh", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to trigger refresh" });
  }
});

export default router;
