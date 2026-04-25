// Generates branded PNG cards (OG / square / story) for each article using
// satori (JSX tree → SVG) + @resvg/resvg-js (SVG → PNG). Output is cached on
// disk keyed by article id + preset + a short content hash so edits invalidate.
//
// The card is intentionally typographic — no source image. Many publishers'
// hero images are licensed, so reusing them on our own cards is a copyright
// hazard. Clean headline + category badge + Scoop mark reads well on every
// platform and sidesteps the licensing problem.

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const BACKEND_ROOT = path.resolve(__dirname, "../..");

const CARDS_DIR = path.join(BACKEND_ROOT, "data", "cards");
if (!existsSync(CARDS_DIR)) mkdirSync(CARDS_DIR, { recursive: true });

const FONT_DIR = path.join(BACKEND_ROOT, "assets", "fonts");
const FONT_SEMIBOLD = readFontOnce(path.join(FONT_DIR, "Inter-SemiBold.otf"));
const FONT_BOLD     = readFontOnce(path.join(FONT_DIR, "Inter-Bold.otf"));

function readFontOnce(p) {
  try { return readFileSync(p); }
  catch (e) {
    logger.warn(`card renderer: font missing at ${p} — card rendering disabled`);
    return null;
  }
}

export function isCardRendererReady() {
  return Boolean(FONT_SEMIBOLD && FONT_BOLD);
}

// Preset dimensions chosen to match the platform's native aspect ratios so we
// don't get center-cropped weirdly. OG is the Open Graph standard; square is
// IG feed; story is IG/FB/TikTok stories and the Shorts thumbnail frame.
export const PRESETS = {
  og:     { width: 1200, height: 630,  headlineSize: 58, padding: 72 },
  square: { width: 1080, height: 1080, headlineSize: 68, padding: 80 },
  story:  { width: 1080, height: 1920, headlineSize: 78, padding: 96 },
};

const CATEGORY_COLORS = {
  top:            "#DC2626",
  politics:       "#7C3AED",
  pakistan:       "#059669",
  international:  "#2563EB",
  science:        "#0891B2",
  medicine:       "#DB2777",
  "public-health":"#EA580C",
  health:         "#F59E0B",
  environment:    "#16A34A",
  "self-help":    "#9333EA",
  sports:         "#EF4444",
  cars:           "#475569",
  ai:             "#0EA5E9",
};

const CATEGORY_LABELS = {
  top: "TOP STORIES",
  politics: "POLITICS",
  pakistan: "PAKISTAN",
  international: "WORLD",
  science: "SCIENCE",
  medicine: "MEDICINE",
  "public-health": "PUBLIC HEALTH",
  health: "HEALTH",
  environment: "ENVIRONMENT",
  "self-help": "SELF-HELP",
  sports: "SPORTS",
  cars: "AUTOMOTIVE",
  ai: "AI",
};

function labelFor(category) {
  if (!category) return "NEWS";
  return CATEGORY_LABELS[category] || String(category).toUpperCase();
}

function colorFor(category) {
  return CATEGORY_COLORS[category] || "#DC2626";
}

function truncate(s, limit) {
  const str = String(s || "").trim();
  if (str.length <= limit) return str;
  return str.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
}

function headlineCap(preset) {
  // Rough per-preset headline character budget — tuned so text fills 3-4 lines
  // at the configured font size without overflowing.
  if (preset === "og") return 140;
  if (preset === "square") return 160;
  return 200;
}

// Hash that invalidates the cache if the headline or category changes.
function contentHash(article) {
  const h = createHash("sha1");
  h.update(String(article.title || ""));
  h.update("|");
  h.update(String(article.category || ""));
  h.update("|");
  h.update(String(article.source_name || ""));
  return h.digest("hex").slice(0, 10);
}

function cachePath(articleId, preset, hash) {
  const safeId = String(articleId).replace(/[^a-z0-9_-]/gi, "_").slice(0, 120);
  return path.join(CARDS_DIR, `${safeId}-${preset}-${hash}.png`);
}

function buildTree(article, preset) {
  const dims = PRESETS[preset];
  const color = colorFor(article.category);
  const label = labelFor(article.category);
  const headline = truncate(article.title, headlineCap(preset));
  const source = article.source_name ? `Via ${article.source_name}` : "";

  // Handwritten object tree (satori JSX-equivalent). No React at runtime.
  return {
    type: "div",
    props: {
      style: {
        width: dims.width,
        height: dims.height,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: dims.padding,
        backgroundColor: "#0B0B0D",
        backgroundImage: `linear-gradient(135deg, #0B0B0D 0%, #1A1A1F 60%, ${color}22 100%)`,
        color: "#F5F5F7",
        fontFamily: "Inter",
      },
      children: [
        // Top row: category pill + Scoop wordmark
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex", backgroundColor: color, color: "#fff",
                    padding: "10px 20px", borderRadius: 999,
                    fontSize: 22, fontWeight: 700, letterSpacing: 2,
                  },
                  children: label,
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: "#F5F5F7" },
                  children: [
                    { type: "span", props: { style: { color }, children: "scoop" } },
                    { type: "span", props: { style: { opacity: 0.65 }, children: "feeds.com" } },
                  ],
                },
              },
            ],
          },
        },
        // Headline (the hero)
        {
          type: "div",
          props: {
            style: {
              display: "flex", fontSize: dims.headlineSize, fontWeight: 700,
              lineHeight: 1.15, letterSpacing: -1, color: "#F5F5F7",
            },
            children: headline,
          },
        },
        // Bottom row: source attribution
        {
          type: "div",
          props: {
            style: {
              display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%",
              fontSize: 22, color: "#A1A1AA",
            },
            children: [
              { type: "div", props: { style: { display: "flex" }, children: source } },
              { type: "div", props: { style: { display: "flex", color: "#71717A" }, children: "News, sniffed out." } },
            ],
          },
        },
      ],
    },
  };
}

async function renderPng(article, preset) {
  const dims = PRESETS[preset];
  const tree = buildTree(article, preset);
  const svg = await satori(tree, {
    width: dims.width,
    height: dims.height,
    fonts: [
      { name: "Inter", data: FONT_SEMIBOLD, weight: 600, style: "normal" },
      { name: "Inter", data: FONT_BOLD,     weight: 700, style: "normal" },
    ],
  });
  const resvg = new Resvg(svg, { background: "#0B0B0D", fitTo: { mode: "original" } });
  return resvg.render().asPng();
}

// Public API: returns { path, buffer, contentType } — caches on disk.
export async function ensureCard(article, preset = "og") {
  if (!isCardRendererReady()) throw new Error("card renderer not ready (missing fonts)");
  if (!PRESETS[preset]) throw new Error(`unknown preset: ${preset}`);
  if (!article || !article.id || !article.title) throw new Error("article with id + title required");

  const hash = contentHash(article);
  const filePath = cachePath(article.id, preset, hash);

  if (existsSync(filePath)) {
    return { path: filePath, buffer: readFileSync(filePath), contentType: "image/png", hit: true };
  }

  const buffer = await renderPng(article, preset);
  try { writeFileSync(filePath, buffer); } catch (e) {
    logger.warn(`card renderer: failed to cache to ${filePath}: ${e.message}`);
  }
  return { path: filePath, buffer, contentType: "image/png", hit: false };
}

export function cardUrl(articleId, preset = "og", siteUrl = "") {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  const safeId = encodeURIComponent(articleId);
  return `${base}/api/cards/${preset}/${safeId}.png`;
}
