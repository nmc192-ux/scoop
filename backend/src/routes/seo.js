import { Router } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import { getDb, getArticleById, incrementViewCount } from "../models/database.js";

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
  for (const r of rows) {
    const lastmod = new Date(r.published_at).toISOString();
    urls.push(`<url><loc>${SITE}/article/${xmlEscape(r.id)}</loc><lastmod>${lastmod}</lastmod><priority>0.6</priority></url>`);
  }

  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
  );
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
// metadata. Humans see a preview + outbound link to the original source.
router.get("/article/:id", (req, res) => {
  const article = getArticleById(req.params.id);
  if (!article) return res.status(404).send(renderNotFound());
  try { incrementViewCount(article.id); } catch {}

  const canonical = `${SITE}/article/${encodeURIComponent(article.id)}`;
  const image = article.image_url || `${SITE}/news-icon.svg`;
  const desc = (article.description || article.title || "").slice(0, 300);
  const title = `${article.title} — Scoop`;
  const published = new Date(article.published_at).toISOString();
  // Full content if enrichment succeeded (>500 chars); otherwise fall back to description
  const hasFullContent = article.content && article.content.length > 500;
  const articleBody = hasFullContent ? article.content : desc;
  const paragraphs = articleBody
    ? articleBody.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    : [];

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": desc,
    "image": [image],
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
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${xmlEscape(title)}</title>
<meta name="description" content="${xmlEscape(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${xmlEscape(article.title)}">
<meta property="og:description" content="${xmlEscape(desc)}">
<meta property="og:image" content="${xmlEscape(image)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Scoop">
<meta property="article:published_time" content="${published}">
<meta property="article:section" content="${xmlEscape(article.category || "")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${xmlEscape(article.title)}">
<meta name="twitter:description" content="${xmlEscape(desc)}">
<meta name="twitter:image" content="${xmlEscape(image)}">
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
        <div class="meta">${xmlEscape(article.source_name || "")} · ${new Date(article.published_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
        ${hasFullContent
          ? `<div class="content">${paragraphs.map(p => `<p>${xmlEscape(p)}</p>`).join("")}</div>
             <div class="source-note">Originally published by <strong>${xmlEscape(article.source_name || "")}</strong>. Read the full story at the source for the complete article.</div>`
          : (desc ? `<p class="desc">${xmlEscape(desc)}</p>` : "")}
        <a class="cta" href="${xmlEscape(article.url)}" target="_blank" rel="noopener noreferrer">Read on ${xmlEscape(article.source_name || "source")} →</a>
        <a class="secondary" href="/">More top stories</a>
      </div>
    </article>
  </div>
</body>
</html>`);
});

function renderNotFound() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Not found — Scoop</title><meta name="robots" content="noindex"><style>body{font-family:system-ui;text-align:center;padding:80px 20px;color:#333}a{color:#DC2626}</style></head><body><h1>Story not found</h1><p>This article may have expired.</p><p><a href="/">← Back to Scoop</a></p></body></html>`;
}

export default router;
