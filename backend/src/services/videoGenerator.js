/**
 * videoGenerator.js — Satori-rendered slide-show video pipeline.
 *
 * For each article we produce a 35-45 second vertical MP4 (1080 × 1920):
 *   Slide 1 (8s)  — Title card: category ribbon + headline + source badge
 *   Slide 2 (8s)  — Key point 1
 *   Slide 3 (8s)  — Key point 2
 *   Slide 4 (8s)  — Key point 3
 *   Slide 5 (5s)  — CTA: "Full story at scoopfeeds.com"
 *
 * Slide PNGs are rendered by Satori (zero runtime deps beyond what's already
 * installed for OG cards). FFmpeg stitches them into a video and multiplexes
 * the TTS audio track.
 *
 * Required env:
 *   (none — works in silent/text-only mode by default)
 *
 * Optional env:
 *   FFMPEG_PATH     — path to ffmpeg binary (auto-detected via PATH if absent)
 *   OPENAI_API_KEY  — enables OpenAI TTS voice-over
 *   ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID — ElevenLabs TTS alternative
 *   GOOGLE_TTS_KEY  — Google Cloud TTS fallback
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { execSync, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { generateTts, buildVideoScript } from "./ttsService.js";

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../..");
const FONT_DIR     = path.join(BACKEND_ROOT, "assets", "fonts");
const DATA_DIR     = path.join(BACKEND_ROOT, "data");
const VIDEOS_DIR   = path.join(DATA_DIR, "videos");
const FRAMES_DIR   = path.join(DATA_DIR, "_frames"); // temp slides

for (const d of [VIDEOS_DIR, FRAMES_DIR]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ─── Font loading (reuse Inter fonts already present for OG cards) ──────────
function loadFont(filename) {
  const p = path.join(FONT_DIR, filename);
  try { return readFileSync(p); }
  catch { logger.warn(`videoGenerator: font missing at ${p}`); return null; }
}
const FONT_BOLD     = loadFont("Inter-Bold.otf");
const FONT_SEMIBOLD = loadFont("Inter-SemiBold.otf");
const fontsReady    = Boolean(FONT_BOLD && FONT_SEMIBOLD);

const FONTS = fontsReady ? [
  { name: "Inter", data: FONT_SEMIBOLD, weight: 600, style: "normal" },
  { name: "Inter", data: FONT_BOLD,     weight: 700, style: "normal" },
] : [];

// ─── Category colours (matches cardRenderer.js) ─────────────────────────────
const CAT_COLORS = {
  top:             "#DC2626",  politics:       "#7C3AED",
  pakistan:        "#059669",  international:  "#2563EB",
  science:         "#0891B2",  medicine:       "#DB2777",
  "public-health": "#EA580C",  health:         "#F59E0B",
  environment:     "#16A34A",  "self-help":    "#9333EA",
  sports:          "#EF4444",  cars:           "#475569",
  ai:              "#0EA5E9",
};
const catColor = (cat) => CAT_COLORS[cat] || "#2563EB";

// ─── FFmpeg detection ────────────────────────────────────────────────────────
export function getFFmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return execSync("which ffmpeg 2>/dev/null || where ffmpeg 2>NUL", { stdio: ["pipe","pipe","pipe"] })
      .toString().trim().split("\n")[0] || null;
  } catch { return null; }
}

export function isVideoConfigured() {
  return Boolean(getFFmpegPath() && fontsReady);
}

// ─── Bullet extraction ───────────────────────────────────────────────────────
export function extractBullets(article) {
  const text = String(article.content || article.description || article.title || "");
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 30 && s.length <= 140);
  const out = sentences.slice(0, 3);
  while (out.length < 3) out.push(out[out.length - 1] || article.title || "");
  return out.slice(0, 3).map(s => s.length > 110 ? s.slice(0, 107) + "…" : s);
}

// ─── Satori slide renderers ──────────────────────────────────────────────────
const W = 1080, H = 1920;

function slideContainer(bg, children) {
  return {
    type: "div",
    props: {
      style: {
        display: "flex", flexDirection: "column", alignItems: "center",
        width: W, height: H, background: bg, position: "relative", overflow: "hidden",
      },
      children,
    },
  };
}

// Slide 1 — Title card
function slide1(article) {
  const color = catColor(article.category);
  const label = (article.category || "NEWS").toUpperCase().replace(/-/g, " ");
  const title = article.title || "";
  const src   = article.source_name || "Scoop";

  return slideContainer("#0f172a", [
    // Top category ribbon
    {
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: W, height: 90, background: color,
          fontSize: 34, fontWeight: 700, color: "#fff", letterSpacing: 3,
          fontFamily: "Inter",
        },
        children: [{ type: "span", props: { children: label } }],
      },
    },
    // Headline
    {
      type: "div",
      props: {
        style: {
          display: "flex", flex: 1, alignItems: "center", justifyContent: "center",
          padding: "60px 80px",
        },
        children: [{
          type: "span",
          props: {
            style: {
              fontSize: 72, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.25,
              textAlign: "center", fontFamily: "Inter",
            },
            children: title,
          },
        }],
      },
    },
    // Source badge
    {
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "0 80px 60px", gap: 16, width: W,
        },
        children: [
          {
            type: "div",
            props: {
              style: {
                display: "flex", alignItems: "center",
                background: "rgba(255,255,255,0.1)", borderRadius: 40,
                padding: "14px 32px",
              },
              children: [{
                type: "span",
                props: {
                  style: { fontSize: 32, color: "#94a3b8", fontFamily: "Inter", fontWeight: 600 },
                  children: `via ${src}`,
                },
              }],
            },
          },
          {
            type: "div",
            props: {
              style: {
                display: "flex", alignItems: "center",
                background: color, borderRadius: 40, padding: "14px 32px",
              },
              children: [{
                type: "span",
                props: {
                  style: { fontSize: 32, color: "#fff", fontFamily: "Inter", fontWeight: 700 },
                  children: "Scoop",
                },
              }],
            },
          },
        ],
      },
    },
  ]);
}

// Slides 2–4 — Key points
function slidePoint(num, text, color) {
  return slideContainer("#0f172a", [
    // Number badge
    {
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: W, paddingTop: 200,
        },
        children: [{
          type: "div",
          props: {
            style: {
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 120, height: 120, borderRadius: 60, background: color,
              fontSize: 56, fontWeight: 700, color: "#fff", fontFamily: "Inter",
            },
            children: [{ type: "span", props: { children: String(num) } }],
          },
        }],
      },
    },
    // Point label
    {
      type: "div",
      props: {
        style: {
          display: "flex", alignItems: "center", justifyContent: "center",
          paddingTop: 40,
        },
        children: [{
          type: "span",
          props: {
            style: { fontSize: 32, color, fontFamily: "Inter", fontWeight: 700, letterSpacing: 2 },
            children: `KEY POINT ${num}`,
          },
        }],
      },
    },
    // Divider
    {
      type: "div",
      props: {
        style: {
          width: 100, height: 4, background: color, borderRadius: 2,
          marginTop: 32, marginBottom: 60,
        },
        children: [],
      },
    },
    // Text
    {
      type: "div",
      props: {
        style: {
          display: "flex", flex: 1, alignItems: "center",
          padding: "0 90px", textAlign: "center",
        },
        children: [{
          type: "span",
          props: {
            style: {
              fontSize: 58, fontWeight: 600, color: "#e2e8f0",
              lineHeight: 1.4, fontFamily: "Inter", textAlign: "center",
            },
            children: text,
          },
        }],
      },
    },
    // Scoop watermark
    {
      type: "div",
      props: {
        style: {
          display: "flex", justifyContent: "center", paddingBottom: 100,
        },
        children: [{
          type: "span",
          props: {
            style: { fontSize: 28, color: "rgba(255,255,255,0.25)", fontFamily: "Inter" },
            children: "Scoop • scoopfeeds.com",
          },
        }],
      },
    },
  ]);
}

// Slide 5 — CTA
function slideCta(color) {
  return slideContainer(color, [
    {
      type: "div",
      props: {
        style: {
          display: "flex", flex: 1, flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 40,
          padding: "80px",
        },
        children: [
          {
            type: "span",
            props: {
              style: {
                fontSize: 56, fontWeight: 700, color: "#fff", fontFamily: "Inter",
                textAlign: "center", lineHeight: 1.3,
              },
              children: "Want the full story?",
            },
          },
          {
            type: "span",
            props: {
              style: {
                fontSize: 46, fontWeight: 700, color: "#fff", fontFamily: "Inter",
                textAlign: "center",
                background: "rgba(0,0,0,0.25)", borderRadius: 20,
                padding: "20px 40px",
              },
              children: "scoopfeeds.com",
            },
          },
          {
            type: "span",
            props: {
              style: {
                fontSize: 36, color: "rgba(255,255,255,0.85)", fontFamily: "Inter",
                textAlign: "center",
              },
              children: "News, sniffed out. 🐾",
            },
          },
        ],
      },
    },
  ]);
}

// ─── Render one slide to PNG ─────────────────────────────────────────────────
async function renderSlide(tree, outputPath) {
  if (!fontsReady) throw new Error("videoGenerator: fonts not loaded");
  const svg = await satori(tree, {
    width: W, height: H,
    fonts: FONTS,
    embedFont: true,
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    imageRendering: 1,
  });
  const pngData = resvg.render().asPng();
  writeFileSync(outputPath, pngData);
  return outputPath;
}

// ─── FFmpeg slideshow composer ───────────────────────────────────────────────
const SLIDE_DURATIONS = [8, 8, 8, 8, 5]; // seconds per slide

async function runFFmpeg(args, ffmpegPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", d => { stderr += d.toString(); });
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on("error", reject);
  });
}

async function composeVideo(slidePaths, audioPath, outputPath, ffmpegPath) {
  const args = ["-y", "-loglevel", "warning"];

  // Image inputs (one per slide, looped for the slide's duration)
  for (let i = 0; i < slidePaths.length; i++) {
    args.push("-loop", "1", "-t", String(SLIDE_DURATIONS[i]), "-i", slidePaths[i]);
  }

  // Audio input (optional)
  const hasAudio = audioPath && existsSync(audioPath);
  if (hasAudio) args.push("-i", audioPath);

  // filter_complex: scale each image then concat
  const totalSlides = slidePaths.length;
  const filterParts = [];
  for (let i = 0; i < totalSlides; i++) {
    filterParts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=#0f172a,setsar=1[s${i}]`
    );
  }
  const concatInputs = slidePaths.map((_, i) => `[s${i}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${totalSlides}:v=1:a=0[out]`);

  args.push("-filter_complex", filterParts.join("; "));
  args.push("-map", "[out]");
  if (hasAudio) {
    args.push("-map", `${totalSlides}:a`);
  }

  const totalDuration = SLIDE_DURATIONS.reduce((a, b) => a + b, 0);
  args.push(
    "-t",        String(totalDuration),
    "-c:v",      "libx264",
    "-preset",   "fast",
    "-crf",      "23",
    "-pix_fmt",  "yuv420p",
    "-movflags", "+faststart",
    "-r",        "25",
  );
  if (hasAudio) {
    args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  } else {
    args.push("-an");
  }

  args.push(outputPath);
  await runFFmpeg(args, ffmpegPath);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a vertical MP4 for the given article.
 * Returns { outputPath, durationSecs, hasAudio, slideCount } on success.
 * Returns null if video generation is not configured (no ffmpeg or no fonts).
 */
export async function generateVideo(article) {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    logger.debug("videoGenerator: ffmpeg not available, skipping");
    return null;
  }
  if (!fontsReady) {
    logger.warn("videoGenerator: Inter fonts not found in assets/fonts/, skipping");
    return null;
  }

  const id         = article.id;
  const outputPath = path.join(VIDEOS_DIR, `${id}-shorts.mp4`);

  // Don't re-render if already exists
  if (existsSync(outputPath)) {
    return { outputPath, cached: true };
  }

  const color   = catColor(article.category);
  const bullets = extractBullets(article);

  // 1. Render slides
  const slideFiles = [];
  const slideTime  = Date.now();
  try {
    const slides = [
      { tree: slide1(article),                  file: `${id}_s1.png` },
      { tree: slidePoint(1, bullets[0], color), file: `${id}_s2.png` },
      { tree: slidePoint(2, bullets[1], color), file: `${id}_s3.png` },
      { tree: slidePoint(3, bullets[2], color), file: `${id}_s4.png` },
      { tree: slideCta(color),                  file: `${id}_s5.png` },
    ];
    for (const s of slides) {
      const p = path.join(FRAMES_DIR, s.file);
      await renderSlide(s.tree, p);
      slideFiles.push(p);
    }
    logger.debug(`videoGenerator: rendered ${slideFiles.length} slides in ${Date.now() - slideTime}ms`);
  } catch (err) {
    logger.error(`videoGenerator: slide render failed for ${id}: ${err.message}`);
    throw err;
  }

  // 2. Generate TTS (optional — null if not configured)
  let audioPath = null;
  try {
    const script = buildVideoScript(article, bullets);
    audioPath = await generateTts(script, id);
    if (audioPath) logger.debug(`videoGenerator: TTS audio at ${audioPath}`);
  } catch (err) {
    logger.warn(`videoGenerator: TTS failed for ${id}: ${err.message} — continuing silent`);
    audioPath = null;
  }

  // 3. Compose video with ffmpeg
  const composeStart = Date.now();
  try {
    await composeVideo(slideFiles, audioPath, outputPath, ffmpegPath);
    logger.info(`videoGenerator: rendered "${article.title?.slice(0, 60)}" in ${Date.now() - composeStart}ms → ${outputPath}`);
  } catch (err) {
    logger.error(`videoGenerator: ffmpeg failed for ${id}: ${err.message}`);
    throw err;
  } finally {
    // Clean up temp slide PNGs
    for (const f of slideFiles) {
      try { unlinkSync(f); } catch {}
    }
  }

  const durationSecs = SLIDE_DURATIONS.reduce((a, b) => a + b, 0);
  return { outputPath, durationSecs, hasAudio: Boolean(audioPath), slideCount: slideFiles.length };
}

/**
 * Dry run — render slides only, no audio, no ffmpeg. Returns a base64 preview
 * of the first slide PNG so the admin queue can show a thumbnail.
 */
export async function previewSlide(article) {
  if (!fontsReady) return null;
  try {
    const tree = slide1(article);
    const svg = await satori(tree, { width: W, height: H, fonts: FONTS, embedFont: true });
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 400 } });
    return resvg.render().asPng().toString("base64");
  } catch { return null; }
}
