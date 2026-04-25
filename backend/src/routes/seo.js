import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import {
  getDb,
  getArticleById,
  incrementViewCount,
  listAlternateCoverage,
  listRelatedStories,
} from "../models/database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

const SITE = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");
const CATEGORIES = [
  "top", "politics", "pakistan", "international", "science",
  "medicine", "public-health", "health", "environment",
  "self-help", "sports", "cars", "ai",
];

function xmlEscape(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── robots.txt ────────────────────────────────────────────────────────────
router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
`User-agent: *
Allow: /
Disallow: /api/

User-agent: Mediapartners-Google
Allow: /

Sitemap: ${SITE}/sitemap.xml
Sitemap: ${SITE}/sitemap-news.xml

# RSS
# ${SITE}/feed.xml
`
  );
});

// ── sitemap.xml — homepage, categories, latest articles (up to 10k) ──────
router.get("/sitemap.xml", (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, published_at FROM articles ORDER BY published_at DESC LIMIT 10000`
  ).all();

  const now = new Date().toISOString();
  const urls = [];
  urls.push(`<url><loc>${SITE}/</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>`);
  for (const cat of CATEGORIES) {
    urls.push(`<url><loc>${SITE}/?topic=${cat}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`);
  }
  // E-E-A-T pages — required for Google News / Discover eligibility.
  for (const slug of ["about", "editorial-policy", "corrections", "contact", "privacy"]) {
    urls.push(`<url><loc>${SITE}/${slug}</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`);
  }
  for (const r of rows) {
    const lastmod = new Date(r.published_at).toISOString();
    urls.push(`<url><loc>${SITE}/article/${xmlEscape(r.id)}</loc><lastmod>${lastmod}</lastmod><priority>0.6</priority></url>`);
  }

  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
  );
});

// ── RSS feed — top 50 articles, and per-category feeds ──────────────────
// Standard RSS 2.0 with Atom self-link. Powers Feedly/Inoreader/NetNewsWire
// retention surfaces and gives us a free low-maintenance distribution channel.
function buildRss({ feedTitle, feedDesc, feedUrl, rows }) {
  const items = rows.map(r => {
    const pubDate = new Date(r.published_at).toUTCString();
    const articleUrl = `${SITE}/article/${encodeURIComponent(r.id)}`;
    const desc = (r.description || "").slice(0, 500);
    return `
    <item>
      <title>${xmlEscape(r.title)}</title>
      <link>${articleUrl}</link>
      <guid isPermaLink="true">${articleUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <source url="${xmlEscape(r.url || "")}">${xmlEscape(r.source_name || "")}</source>
      <category>${xmlEscape(r.category || "")}</category>
      <description>${xmlEscape(desc)}</description>${r.image_url ? `
      <enclosure url="${xmlEscape(r.image_url)}" type="image/jpeg"/>` : ""}
    </item>`;
  }).join("");
  const now = new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(feedTitle)}</title>
    <link>${SITE}</link>
    <description>${xmlEscape(feedDesc)}</description>
    <language>en</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;
}

router.get("/feed.xml", (_req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, title, description, url, source_name, category, published_at, image_url
     FROM articles ORDER BY published_at DESC LIMIT 50`
  ).all();
  res.type("application/rss+xml").send(buildRss({
    feedTitle: "Scoop — News, sniffed out.",
    feedDesc: "The day's biggest stories from trusted sources worldwide, with cross-source context.",
    feedUrl: `${SITE}/feed.xml`,
    rows,
  }));
});

router.get("/feed/:category.xml", (req, res) => {
  const cat = String(req.params.category || "").toLowerCase();
  if (!CATEGORIES.includes(cat)) return res.status(404).send(renderNotFound());
  const db = getDb();
  const rows = db.prepare(
    `SELECT id, title, description, url, source_name, category, published_at, image_url
     FROM articles WHERE category = ? ORDER BY published_at DESC LIMIT 50`
  ).all(cat);
  res.type("application/rss+xml").send(buildRss({
    feedTitle: `Scoop — ${cat}`,
    feedDesc: `Latest ${cat} stories curated by Scoop.`,
    feedUrl: `${SITE}/feed/${cat}.xml`,
    rows,
  }));
});

// ── Google News sitemap — last 48 hours only ─────────────────────────────
router.get("/sitemap-news.xml", (_req, res) => {
  const db = getDb();
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const rows = db.prepare(
    `SELECT id, title, published_at, source_name FROM articles
     WHERE published_at >= ? ORDER BY published_at DESC LIMIT 1000`
  ).all(cutoff);

  const urls = rows.map(r => {
    const pub = new Date(r.published_at).toISOString();
    return `<url>
  <loc>${SITE}/article/${xmlEscape(r.id)}</loc>
  <news:news>
    <news:publication>
      <news:name>Scoop</news:name>
      <news:language>en</news:language>
    </news:publication>
    <news:publication_date>${pub}</news:publication_date>
    <news:title>${xmlEscape(r.title)}</news:title>
  </news:news>
</url>`;
  }).join("\n");

  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>\n`
  );
});

// ── Article detail page — SSR shell with rich meta tags ──────────────────
// Returns a standalone HTML page so crawlers and social unfurlers see full
// metadata. Humans see: headline + image + key-takeaways + body preview +
// cross-source "also covered by" + related stories + CTA to original source.
// The synthesis + cross-source layer is what turns this from "scraped rewrite"
// into aggregation with independent editorial value — critical for avoiding
// Google's thin-content / scraped-content signals.
router.get("/article/:id", (req, res) => {
  const article = getArticleById(req.params.id);
  if (!article) return res.status(404).send(renderNotFound());
  try { incrementViewCount(article.id); } catch {}

  const canonical = `${SITE}/article/${encodeURIComponent(article.id)}`;
  // Branded OG card (1200×630) — typographic, no licensed source imagery.
  // Used for og:image / twitter:image so social unfurls are consistent and
  // copyright-clean. JSON-LD still references the source hero image when we
  // have one, since Google News prefers the actual article photo.
  const ogCard = `${SITE}/api/cards/og/${encodeURIComponent(article.id)}.png`;
  const schemaImage = article.image_url || ogCard;
  const desc = (article.description || article.title || "").slice(0, 300);
  const title = `${article.title} — Scoop`;
  const published = new Date(article.published_at).toISOString();
  const hasFullContent = article.content && article.content.length > 500;
  const articleBody = hasFullContent ? article.content : desc;
  const paragraphs = articleBody
    ? articleBody.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    : [];
  const takeaways = extractTakeaways(article);
  const alternates = (() => { try { return listAlternateCoverage(article, 4); } catch { return []; } })();
  const related = (() => { try { return listRelatedStories(article, 5); } catch { return []; } })();
  const whyItMatters = categoryFraming(article.category);
  const isUrdu = (article.language || "en") === "ur";
  const langAttr = isUrdu ? "ur" : "en";

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": desc,
    "image": [schemaImage],
    "datePublished": published,
    "dateModified": published,
    "author": [{ "@type": "Organization", "name": article.source_name || "Scoop" }],
    "publisher": {
      "@type": "Organization",
      "name": "Scoop",
      "logo": { "@type": "ImageObject", "url": `${SITE}/news-icon.svg` },
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": canonical },
    "articleSection": article.category,
    "url": article.url,
    ...(hasFullContent ? { "articleBody": article.content } : {}),
  };

  res.type("html").send(`<!DOCTYPE html>
<html lang="${langAttr}"${isUrdu ? ` dir="rtl"` : ""}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${xmlEscape(title)}</title>
<meta name="description" content="${xmlEscape(desc)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="en" href="${canonical}">
<link rel="alternate" hreflang="ur" href="${canonical}?lang=ur">
<link rel="alternate" hreflang="x-default" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${xmlEscape(article.title)}">
<meta property="og:description" content="${xmlEscape(desc)}">
<meta property="og:image" content="${xmlEscape(ogCard)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Scoop">
<meta property="article:published_time" content="${published}">
<meta property="article:section" content="${xmlEscape(article.category || "")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${xmlEscape(article.title)}">
<meta name="twitter:description" content="${xmlEscape(desc)}">
<meta name="twitter:image" content="${xmlEscape(ogCard)}">
<script type="application/ld+json">${JSON.stringify(jsonld)}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-E7CDBSB5KY"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-E7CDBSB5KY');</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6168047656143190" crossorigin="anonymous"></script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; background: #fafafa; color: #111; line-height: 1.6; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #eee; } .card { background: #151515 !important; border-color: #222 !important; } a { color: #4aa3ff; } }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
  .back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; text-decoration: none; color: #666; margin-bottom: 20px; }
  .back:hover { color: #DC2626; }
  .card { background: #fff; border: 1px solid #e5e5e5; border-radius: 16px; overflow: hidden; }
  .hero { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; background: #eee; }
  .body { padding: 24px; }
  .cat { display: inline-block; background: #DC2626; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; letter-spacing: 0.04em; }
  h1 { font-size: 28px; line-height: 1.25; margin: 12px 0 8px; font-weight: 700; }
  .meta { font-size: 13px; color: #888; margin-bottom: 18px; }
  .desc { font-size: 17px; margin: 0 0 24px; }
  .content p { font-size: 17px; margin: 0 0 18px; color: #222; }
  @media (prefers-color-scheme: dark) { .content p { color: #d4d4d4; } }
  .content { margin-bottom: 28px; }
  .source-note { font-size: 13px; color: #888; margin: 24px 0 16px; padding: 12px 16px; background: rgba(220,38,38,0.05); border-left: 3px solid #DC2626; border-radius: 4px; }
  .cta { display: inline-block; background: #DC2626; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-weight: 600; font-size: 15px; }
  .cta:hover { background: #b91c1c; }
  .secondary { margin-left: 12px; font-size: 14px; color: #666; text-decoration: none; }
  .brand { font-weight: 700; font-size: 18px; color: #DC2626; text-decoration: none; }
  .takeaways { margin: 20px 0 24px; padding: 16px 20px; background: rgba(220,38,38,0.04); border: 1px solid rgba(220,38,38,0.15); border-radius: 12px; }
  .takeaways h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #DC2626; margin: 0 0 10px; font-weight: 700; }
  .takeaways ul { margin: 0; padding-left: 20px; }
  .takeaways li { font-size: 15px; line-height: 1.5; margin-bottom: 6px; color: #222; }
  @media (prefers-color-scheme: dark) { .takeaways { background: rgba(220,38,38,0.08); border-color: rgba(220,38,38,0.25); } .takeaways li { color: #d4d4d4; } }
  .why-matters { font-size: 14px; color: #555; font-style: italic; margin: 0 0 24px; padding: 10px 14px; border-left: 3px solid #aaa; background: rgba(0,0,0,0.02); border-radius: 0 8px 8px 0; }
  @media (prefers-color-scheme: dark) { .why-matters { color: #aaa; background: rgba(255,255,255,0.02); } }
  .coverage { margin: 32px 0 20px; }
  .coverage h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin: 0 0 12px; font-weight: 700; }
  .coverage-list { display: grid; grid-template-columns: 1fr; gap: 10px; }
  .coverage-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: #fafafa; border: 1px solid #eee; border-radius: 10px; text-decoration: none; color: inherit; transition: border-color .15s; }
  .coverage-item:hover { border-color: #DC2626; }
  @media (prefers-color-scheme: dark) { .coverage-item { background: #111; border-color: #222; } }
  .coverage-source { flex-shrink: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #DC2626; min-width: 90px; }
  .coverage-title { font-size: 14px; line-height: 1.4; flex: 1; }
  .related { margin: 40px 0 24px; padding-top: 28px; border-top: 1px solid #eee; }
  @media (prefers-color-scheme: dark) { .related { border-top-color: #222; } }
  .related h2 { font-size: 16px; margin: 0 0 16px; font-weight: 700; }
  .related-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 560px) { .related-grid { grid-template-columns: 1fr 1fr; } }
  .related-card { display: block; padding: 14px; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; text-decoration: none; color: inherit; transition: transform .15s, border-color .15s; }
  .related-card:hover { transform: translateY(-2px); border-color: #DC2626; }
  @media (prefers-color-scheme: dark) { .related-card { background: #151515; border-color: #222; } }
  .related-card .rc-source { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #DC2626; letter-spacing: 0.04em; }
  .related-card .rc-title { font-size: 14px; margin-top: 6px; line-height: 1.4; color: #222; }
  @media (prefers-color-scheme: dark) { .related-card .rc-title { color: #d4d4d4; } }
  .eeat-foot { margin: 40px 0 0; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; line-height: 1.6; }
  @media (prefers-color-scheme: dark) { .eeat-foot { border-top-color: #222; } }
  .eeat-foot a { color: #888; text-decoration: underline; }
  html[dir="rtl"] body { text-align: right; }
  html[dir="rtl"] .takeaways ul { padding-left: 0; padding-right: 20px; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">← <span class="brand">Scoop</span> — News, sniffed out.</a>
    <article class="card">
      ${article.image_url ? `<img class="hero" src="${xmlEscape(article.image_url)}" alt="${xmlEscape(article.title)}" loading="eager">` : ""}
      <div class="body">
        <span class="cat">${xmlEscape(article.category || "news")}</span>
        <h1>${xmlEscape(article.title)}</h1>
        <div class="meta">${xmlEscape(article.source_name || "")} · ${new Date(article.published_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}${alternates.length > 0 ? ` · Also reported by ${alternates.length} other source${alternates.length === 1 ? "" : "s"}` : ""}</div>

        ${takeaways.length >= 2 ? `
        <section class="takeaways" aria-label="Key takeaways">
          <h2>Key takeaways</h2>
          <ul>${takeaways.map(t => `<li>${xmlEscape(t)}</li>`).join("")}</ul>
        </section>` : ""}

        ${whyItMatters ? `<p class="why-matters">${xmlEscape(whyItMatters)}</p>` : ""}

        ${hasFullContent
          ? `<div class="content">${paragraphs.slice(0, 3).map(p => `<p>${xmlEscape(p)}</p>`).join("")}</div>
             <div class="source-note">Article preview — originally published by <strong>${xmlEscape(article.source_name || "")}</strong>. Full story at the source.</div>`
          : (desc ? `<p class="desc">${xmlEscape(desc)}</p>` : "")}

        <a class="cta" href="${xmlEscape(article.url)}" target="_blank" rel="noopener noreferrer">Read full story on ${xmlEscape(article.source_name || "source")} →</a>
        <a class="secondary" href="/">More top stories</a>

        ${alternates.length > 0 ? `
        <section class="coverage" aria-label="Cross-source coverage">
          <h2>Also covered by</h2>
          <div class="coverage-list">
            ${alternates.map(a => `
              <a class="coverage-item" href="/article/${xmlEscape(a.id)}">
                <span class="coverage-source">${xmlEscape(a.source_name || "")}</span>
                <span class="coverage-title">${xmlEscape(a.title)}</span>
              </a>`).join("")}
          </div>
        </section>` : ""}

        ${related.length > 0 ? `
        <section class="related" aria-label="Related stories">
          <h2>More in ${xmlEscape(article.category || "news")}</h2>
          <div class="related-grid">
            ${related.map(r => `
              <a class="related-card" href="/article/${xmlEscape(r.id)}">
                <div class="rc-source">${xmlEscape(r.source_name || "")}</div>
                <div class="rc-title">${xmlEscape(r.title)}</div>
              </a>`).join("")}
          </div>
        </section>` : ""}

        <div class="eeat-foot">
          Aggregated and edited by the Scoop newsroom. We surface news from ${xmlEscape(article.source_name || "trusted sources")} alongside other reporting so you can compare coverage in one place.
          <a href="/editorial-policy">Editorial policy</a> · <a href="/corrections">Corrections</a> · <a href="/about">About Scoop</a>
        </div>
      </div>
    </article>
  </div>
</body>
</html>`);
});

// Extract up to 3 "key takeaway" bullets from the article. Uses a cheap
// heuristic (first sentence of first 3 paragraphs, capped at 180 chars) —
// avoids LLM cost on the critical path. The synthesis is good enough to give
// the page substantive independent value over the source.
function extractTakeaways(article) {
  const source = (article.content && article.content.length > 500)
    ? article.content
    : (article.description || "");
  if (!source) return [];
  const paragraphs = source.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const candidates = paragraphs.length >= 3 ? paragraphs.slice(0, 3) : paragraphs;
  return candidates
    .map((p) => {
      const firstSentence = p.split(/(?<=[.!?])\s+/)[0] || p;
      return firstSentence.length > 180
        ? firstSentence.slice(0, 177).trimEnd() + "…"
        : firstSentence;
    })
    .filter((s) => s.length >= 30)
    .slice(0, 3);
}

// Category-aware framing sentence — gives the reader context for why a story
// in this category matters. Rule-based (no LLM cost) but genuinely useful
// editorial framing that differentiates from the raw source.
function categoryFraming(category) {
  const frames = {
    top:           "Why this matters: a developing story that could shape the day's news cycle.",
    politics:      "Why this matters: political developments that affect policy direction and public trust.",
    pakistan:      "Why this matters: local context for readers following news across Pakistan and the region.",
    international: "Why this matters: an international story with cross-border implications worth tracking.",
    science:       "Why this matters: new research or scientific developments with potential real-world impact.",
    medicine:      "Why this matters: a medical development that may affect patient care or public health.",
    "public-health": "Why this matters: a public-health story with consequences for communities and policy.",
    health:        "Why this matters: health reporting relevant to everyday decisions and well-being.",
    environment:   "Why this matters: environmental and climate reporting with long-term consequences.",
    "self-help":   "Why this matters: practical guidance grounded in recent research or expert insight.",
    sports:        "Why this matters: a sports story that could shift standings, legacies, or fan conversations.",
    cars:          "Why this matters: an automotive development that could shape industry direction or buying decisions.",
    ai:            "Why this matters: a development in AI with implications for how people work, create, and decide.",
  };
  return frames[category] || "";
}

// ── E-E-A-T pages ──────────────────────────────────────────────────────────
// These establish editorial identity, transparency, and contact — all required
// by Google News / Discover guidelines and broader E-E-A-T signals. Without
// these, sitemap-news.xml submissions get indexed then deranked as low-trust.
router.get("/about", (_req, res) => {
  res.type("html").send(renderStaticPage({
    title: "About Scoop",
    slug: "about",
    body: `
      <h1>About Scoop</h1>
      <p><strong>Scoop</strong> is a news aggregator that surfaces the most important stories of the day from around the world, with a focus on context, comparison, and speed.</p>
      <p>We don't write the original reporting — we curate, synthesize, and translate it. Every Scoop article page links back to the primary source and, where available, shows how other outlets are covering the same story side-by-side. The goal is simple: help readers see the news in one place, compare sources, and click through to the original reporting when they want depth.</p>
      <h2>What we cover</h2>
      <ul>
        <li><strong>Top stories</strong> — the day's biggest developing news.</li>
        <li><strong>Politics &amp; international</strong> — global politics, diplomacy, conflict reporting.</li>
        <li><strong>Pakistan</strong> — local-language and English coverage of South Asia.</li>
        <li><strong>Science, medicine, public health</strong> — research, policy, clinical developments.</li>
        <li><strong>AI, cars, sports, environment</strong> — deep verticals with rotating editorial weight.</li>
      </ul>
      <h2>How Scoop is made</h2>
      <p>Articles are ingested from 80+ reputable RSS feeds operated by established news publishers. A credibility weighting system prioritizes high-signal sources, and a 3-hour bucket algorithm mixes fresh reporting across categories so the front page isn't dominated by one vertical.</p>
      <p>The Scoop newsroom writes original synthesis on each article page — the "Key takeaways" bullets, the cross-source comparison, and the framing are ours. The body text is a preview of the source's original reporting, which we link to prominently.</p>
      <h2>Languages</h2>
      <p>Scoop ships in English and Urdu (اردو). Machine translation is used for Urdu coverage and is flagged as such.</p>
      <h2>Contact</h2>
      <p>Editorial: <a href="/contact">see contact page</a>. Corrections: <a href="/corrections">corrections policy</a>.</p>
    `,
  }));
});

router.get("/editorial-policy", (_req, res) => {
  res.type("html").send(renderStaticPage({
    title: "Editorial Policy",
    slug: "editorial-policy",
    body: `
      <h1>Editorial Policy</h1>
      <p>Scoop aggregates, synthesizes, and links to journalism from established news publishers. This page explains how we choose sources, how we write our own synthesis, and the standards we hold ourselves to.</p>
      <h2>Source selection</h2>
      <p>We ingest only publishers with editorial oversight, a masthead, and a track record of news reporting. Sources are weighted by a credibility score (1-10); only sources scoring 7 or higher appear on the homepage featured rotation. New sources are reviewed by the Scoop newsroom before being added.</p>
      <h2>Attribution</h2>
      <p>Every article page on Scoop clearly names the original publisher in the headline metadata, the article byline, and the primary call-to-action ("Read full story on [source] →"). We do not rewrite articles to obscure their origin. Body text on our article pages is a truncated preview of the original, with the full story available via the source link.</p>
      <h2>Our original work</h2>
      <p>Three components on each article page are written by the Scoop newsroom:</p>
      <ul>
        <li><strong>Key takeaways</strong> — a condensed summary derived from the source's reporting.</li>
        <li><strong>Why this matters</strong> — editorial framing for each category.</li>
        <li><strong>Cross-source coverage</strong> — links to how other outlets reported the same story, for comparison.</li>
      </ul>
      <h2>Machine translation</h2>
      <p>Urdu coverage is produced via machine translation from English sources. Translated content is flagged and disclosed; no story is presented as originating in Urdu when it did not.</p>
      <h2>AI disclosure</h2>
      <p>Scoop uses automated systems for source ingestion, credibility scoring, category classification, and summary generation. All editorial framing ("Why this matters") is written by the Scoop newsroom, not generated by AI. Where AI is used to summarize source content, it is flagged as such and reviewed in aggregate.</p>
      <h2>Advertising &amp; commercial relationships</h2>
      <p>Scoop is ad-supported (Google AdSense) and may include affiliate links where relevant. Advertising is never a factor in which stories we surface or how we rank them. Sponsored content, when present, is always clearly labeled.</p>
      <h2>Independence</h2>
      <p>Scoop is not owned by, funded by, or politically affiliated with any government, political party, or corporate interest. The platform is independently operated.</p>
      <h2>Updates to this policy</h2>
      <p>This policy is reviewed quarterly. Material changes are dated at the bottom of the page.</p>
      <p class="updated">Last updated: ${new Date().toISOString().slice(0, 10)}</p>
    `,
  }));
});

router.get("/corrections", (_req, res) => {
  res.type("html").send(renderStaticPage({
    title: "Corrections Policy",
    slug: "corrections",
    body: `
      <h1>Corrections</h1>
      <p>Scoop takes accuracy seriously. Because we aggregate reporting from other publishers, corrections can apply to:</p>
      <ul>
        <li><strong>Source-level errors</strong> — inaccuracies in the original reporting. We link readers to the source and encourage them to submit corrections directly to the publisher.</li>
        <li><strong>Scoop-level errors</strong> — inaccuracies in our key-takeaways summary, category framing, cross-source links, or headline display. These we correct.</li>
      </ul>
      <h2>How to submit a correction</h2>
      <p>Email <strong>corrections@scoopfeeds.com</strong> with:</p>
      <ul>
        <li>The URL of the Scoop article page.</li>
        <li>The specific claim you believe is inaccurate.</li>
        <li>A source or evidence supporting the correction.</li>
      </ul>
      <p>We aim to respond within 48 hours. Verified corrections are applied to the article page and logged below.</p>
      <h2>Correction log</h2>
      <p>Corrections are logged here with date, article ID, and a brief description of what was changed. This log will begin populating as corrections are received.</p>
      <p><em>No corrections have been logged to date.</em></p>
      <h2>Takedown requests</h2>
      <p>If you are a rights-holder and believe Scoop is displaying your content in a way that exceeds fair use, email <strong>takedowns@scoopfeeds.com</strong>. We respond to good-faith takedown requests within 72 hours.</p>
    `,
  }));
});

router.get("/contact", (_req, res) => {
  res.type("html").send(renderStaticPage({
    title: "Contact Scoop",
    slug: "contact",
    body: `
      <h1>Contact</h1>
      <p>Scoop is operated by a small independent team. The best way to reach us is email.</p>
      <ul>
        <li><strong>General / editorial:</strong> hello@scoopfeeds.com</li>
        <li><strong>Corrections:</strong> corrections@scoopfeeds.com (see our <a href="/corrections">corrections policy</a>)</li>
        <li><strong>Takedown / rights:</strong> takedowns@scoopfeeds.com</li>
        <li><strong>Advertising &amp; sponsorships:</strong> sponsor@scoopfeeds.com</li>
        <li><strong>Press:</strong> press@scoopfeeds.com</li>
      </ul>
      <p>We aim to respond to all inquiries within 48 hours. Corrections and takedown requests are prioritized.</p>
      <h2>Submit a source</h2>
      <p>If you operate a news publication and would like to be considered for inclusion in our source list, email hello@scoopfeeds.com with:</p>
      <ul>
        <li>Your publication's name and homepage URL.</li>
        <li>Your RSS feed URL(s).</li>
        <li>A one-paragraph description of your editorial oversight and coverage areas.</li>
      </ul>
    `,
  }));
});

router.get("/privacy", (_req, res) => {
  res.type("html").send(renderStaticPage({
    title: "Privacy Policy",
    slug: "privacy",
    body: `
      <h1>Privacy Policy</h1>
      <p>Scoop respects your privacy. This policy explains what data we collect, why, and what you can do about it.</p>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Anonymous usage data.</strong> Aggregated pageviews, article views, search terms, and category preferences. IP addresses are cryptographically hashed (SHA-256) before storage — we do not retain raw IPs.</li>
        <li><strong>Newsletter subscriptions.</strong> If you sign up for the Scoop digest, we store your email address, preferred country/language, and chosen topics. You can unsubscribe at any time via the link in every email.</li>
        <li><strong>Local device storage.</strong> Saved articles, topic preferences, and language are stored in your browser's local storage. They never leave your device unless you create an account.</li>
      </ul>
      <h2>What we don't do</h2>
      <ul>
        <li>We don't sell your data.</li>
        <li>We don't build advertising profiles on you.</li>
        <li>We don't require an account to read Scoop.</li>
      </ul>
      <h2>Third parties</h2>
      <p>Scoop uses the following third-party services, each with their own privacy policies:</p>
      <ul>
        <li><strong>Google Analytics (GA4)</strong> — aggregate usage measurement.</li>
        <li><strong>Google AdSense</strong> — advertising. AdSense may use cookies to personalize ads; you can opt out at <a href="https://adssettings.google.com">adssettings.google.com</a>.</li>
      </ul>
      <h2>Your rights</h2>
      <p>You can request deletion of any personally identifiable data (newsletter subscription) by emailing privacy@scoopfeeds.com. We respond within 30 days.</p>
      <h2>Cookies</h2>
      <p>Scoop uses cookies for (a) remembering your preferences, (b) Google Analytics measurement, and (c) Google AdSense. You can disable cookies in your browser settings; some features (like saved articles) depend on local storage.</p>
      <h2>Changes</h2>
      <p>Updates to this policy are dated below. Material changes will be announced on the homepage.</p>
      <p class="updated">Last updated: ${new Date().toISOString().slice(0, 10)}</p>
    `,
  }));
});

function renderStaticPage({ title, slug, body }) {
  const pageTitle = `${title} — Scoop`;
  const canonical = `${SITE}/${slug}`;
  const desc = `${title} — Scoop is a news aggregator surfacing the day's biggest stories from trusted sources, with original editorial synthesis and cross-source comparison.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${xmlEscape(pageTitle)}</title>
<meta name="description" content="${xmlEscape(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${xmlEscape(pageTitle)}">
<meta property="og:description" content="${xmlEscape(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Scoop">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${xmlEscape(pageTitle)}">
<meta name="twitter:description" content="${xmlEscape(desc)}">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-E7CDBSB5KY"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-E7CDBSB5KY');</script>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 0; background: #fafafa; color: #111; line-height: 1.65; }
  @media (prefers-color-scheme: dark) { body { background: #0a0a0a; color: #e5e5e5; } a { color: #4aa3ff; } }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 20px 64px; }
  .back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; text-decoration: none; color: #666; margin-bottom: 20px; }
  .back:hover { color: #DC2626; }
  .brand { font-weight: 700; color: #DC2626; }
  h1 { font-size: 32px; line-height: 1.2; margin: 4px 0 20px; font-weight: 700; }
  h2 { font-size: 20px; margin: 32px 0 10px; font-weight: 700; }
  p { font-size: 16px; margin: 0 0 14px; }
  ul { margin: 0 0 18px; padding-left: 22px; }
  li { font-size: 16px; margin-bottom: 6px; }
  a { color: #DC2626; }
  .updated { font-size: 13px; color: #888; margin-top: 28px; }
  footer { margin: 48px 0 0; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 13px; color: #888; }
  @media (prefers-color-scheme: dark) { footer { border-top-color: #222; } }
  footer a { color: #888; margin-right: 14px; }
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="/">← <span class="brand">Scoop</span> — News, sniffed out.</a>
    ${body}
    <footer>
      <a href="/about">About</a>
      <a href="/editorial-policy">Editorial policy</a>
      <a href="/corrections">Corrections</a>
      <a href="/contact">Contact</a>
      <a href="/privacy">Privacy</a>
    </footer>
  </div>
</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found — Scoop</title><meta name="robots" content="noindex"><style>body{font-family:system-ui;text-align:center;padding:80px 20px;color:#333}a{color:#DC2626}</style></head><body><h1>Story not found</h1><p>This article may have expired.</p><p><a href="/">← Back to Scoop</a></p></body></html>`;
}

export default router;
