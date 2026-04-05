import express from "express";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import { logger } from "../services/logger.js";

const router = express.Router();
const SUMMARY_TTL_MS = 30 * 60 * 1000;
const summaryCache = new Map();

function getCacheKey({ title = "", description = "", content = "", language = "en" }) {
  return crypto
    .createHash("sha256")
    .update(`${language}::${title}::${description}::${content.slice(0, 1200)}`)
    .digest("hex");
}

function getCachedSummary(key) {
  const hit = summaryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > SUMMARY_TTL_MS) {
    summaryCache.delete(key);
    return null;
  }
  return hit.summary;
}

function setCachedSummary(key, summary) {
  summaryCache.set(key, { summary, createdAt: Date.now() });
  if (summaryCache.size > 500) {
    const oldestKey = summaryCache.keys().next().value;
    summaryCache.delete(oldestKey);
  }
}

router.post("/summarize", async (req, res) => {
  try {
    const { title = "", description = "", content = "", language = "en" } = req.body || {};
    if (!title && !description && !content) {
      return res.status(400).json({ success: false, error: "title, description, or content is required" });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ success: false, error: "AI service is not configured" });
    }

    const cacheKey = getCacheKey({ title, description, content, language });
    const cached = getCachedSummary(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { summary: cached, cached: true } });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const articleText = [title, description, content].filter(Boolean).join("\n\n").slice(0, 7000);
    const prompt =
      language === "ur"
        ? `مندرجہ ذیل خبر کا 2 جملوں میں سادہ اور غیر جانبدار خلاصہ اردو میں کریں:\n\n${articleText}`
        : `Summarize the following news article in exactly 2 concise, neutral sentences:\n\n${articleText}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const summary = response.text?.trim();
    if (!summary) {
      return res.status(502).json({ success: false, error: "AI returned an empty summary" });
    }

    setCachedSummary(cacheKey, summary);
    res.json({ success: true, data: { summary, cached: false } });
  } catch (err) {
    logger.error("AI summarize error", { error: err.message });
    res.status(500).json({ success: false, error: "Failed to summarize article" });
  }
});

export default router;
