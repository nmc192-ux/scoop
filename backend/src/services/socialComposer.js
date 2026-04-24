// Generates per-platform social captions from an article, using only rule-based
// rewriting — no LLM cost, deterministic output. The Phase-0 editorial synthesis
// that already lives on the article SSR page (key takeaways, category framing)
// is the raw material.
//
// Output is a plain object keyed by platform name. Each caption embeds the
// canonical scoopfeeds.com URL with UTM tags so downstream clicks attribute
// back to the right social channel.

const SITE = (process.env.PRIMARY_SITE_URL || "https://scoopfeeds.com").replace(/\/+$/, "");

// Rough category-emoji mapping, reused for every platform.
const CATEGORY_EMOJI = {
  top: "📰", politics: "🏛️", pakistan: "🇵🇰", international: "🌍",
  science: "🔬", medicine: "💊", "public-health": "🏥", health: "💪",
  environment: "🌱", "self-help": "🌟", sports: "🏆", cars: "🚗", ai: "🤖",
};

// Category-aware hashtag bundles. Kept tight — 3-5 tags per platform-appropriate
// context is the sweet spot; any more reads as spam.
const CATEGORY_HASHTAGS = {
  top:          ["#news", "#breakingnews"],
  politics:     ["#politics", "#policy"],
  pakistan:     ["#Pakistan", "#news"],
  international:["#worldnews", "#global"],
  science:      ["#science", "#research"],
  medicine:     ["#medicine", "#health"],
  "public-health":["#publichealth", "#health"],
  health:       ["#health", "#wellness"],
  environment:  ["#environment", "#climate"],
  "self-help":  ["#selfhelp", "#personalgrowth"],
  sports:       ["#sports"],
  cars:         ["#cars", "#automotive"],
  ai:           ["#AI", "#tech"],
};

const BRAND_HASHTAG = "#ScoopFeeds";

function truncate(str, limit) {
  const s = String(str || "").trim();
  if (s.length <= limit) return s;
  return s.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
}

function utmUrl(articleId, network) {
  const base = `${SITE}/article/${encodeURIComponent(articleId)}`;
  return `${base}?utm_source=social_${network}&utm_medium=social&utm_campaign=scoop_auto`;
}

// ── Per-platform composers ──────────────────────────────────────────────
// Each returns { caption, url, characterCount, meta? } so the admin preview
// can render character budgets and spot overflows at a glance.

function composeX(article) {
  // X: 280 chars hard cap. Budget: ~30 chars for the URL + hashtags, leaves
  // ~250 for the headline + emoji. We include the URL so posts auto-unfurl.
  const url = utmUrl(article.id, "x");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG].slice(0, 3);
  const tail = `\n\n${url}\n${hashtags.join(" ")}`;
  const headroom = 280 - tail.length - 2; // -2 for the leading emoji + space
  const headline = truncate(article.title, headroom);
  const caption = `${emoji} ${headline}${tail}`;
  return { caption, url, characterCount: caption.length };
}

function composeThreads(article) {
  // Threads: 500 char limit. Similar shape to X but a bit more room for color.
  const url = utmUrl(article.id, "threads");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG].slice(0, 4);
  const lead = `${emoji} ${article.title}`;
  const preview = truncate(article.description || "", 260);
  const body = preview ? `${lead}\n\n${preview}` : lead;
  const tail = `\n\n${url}\n${hashtags.join(" ")}`;
  const headroom = 500 - tail.length;
  const caption = `${truncate(body, headroom)}${tail}`;
  return { caption, url, characterCount: caption.length };
}

function composeFacebook(article) {
  // Facebook: ~63k char technical limit but engagement drops past ~200 chars.
  // Best shape: headline line → synthesis paragraph → link. FB auto-previews
  // the link so we can lean on description + source + CTA.
  const url = utmUrl(article.id, "facebook");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = (CATEGORY_HASHTAGS[article.category] || []).slice(0, 2);
  const desc = truncate(article.description || "", 260);
  const src = article.source_name ? `Via ${article.source_name} · ` : "";
  const parts = [
    `${emoji} ${article.title}`,
    desc || null,
    `${src}${url}`,
    hashtags.length ? hashtags.join(" ") : null,
  ].filter(Boolean);
  const caption = parts.join("\n\n");
  return { caption, url, characterCount: caption.length };
}

function composeLinkedIn(article) {
  // LinkedIn: longer analytical framing reads better. 3000-char limit but
  // engagement peaks around 1500. Lead with a hook, then context, then link.
  const url = utmUrl(article.id, "linkedin");
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG].slice(0, 4)
    .map((h) => h.replace(/^#/, "#")); // already hashtag-formed
  const hook = article.title;
  const body = article.description || "";
  const src = article.source_name || "the source";
  const parts = [
    hook,
    body,
    `Full context from ${src}: ${url}`,
    hashtags.length ? hashtags.join(" ") : null,
  ].filter(Boolean);
  const caption = parts.join("\n\n");
  return { caption, url, characterCount: caption.length };
}

function composeInstagramFeed(article) {
  // Instagram doesn't allow clickable links in captions — we pin them in bio
  // or use link-stickers in Stories. Caption focuses on hook + CTA to bio.
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG, "#newsoftheday", "#dailynews"].slice(0, 8);
  const body = truncate(article.description || "", 260);
  const url = utmUrl(article.id, "instagram");
  const caption = [
    `${emoji} ${article.title}`,
    body || null,
    `🔗 Full story: link in bio → scoopfeeds.com`,
    hashtags.join(" "),
  ].filter(Boolean).join("\n\n");
  return { caption, url, characterCount: caption.length, meta: { note: "Link goes in bio (IG captions aren't clickable)." } };
}

function composePinterest(article) {
  // Pinterest pins ARE clickable. 500 char description limit. Keep the hook
  // concise and hashtag-light.
  const url = utmUrl(article.id, "pinterest");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const desc = truncate(article.description || "", 280);
  const caption = [
    `${emoji} ${article.title}`,
    desc || null,
    `Read the full story at scoopfeeds.com`,
  ].filter(Boolean).join("\n\n");
  return { caption, url, characterCount: caption.length };
}

function composeBluesky(article) {
  // Bluesky: 300 chars. Similar shape to X.
  const url = utmUrl(article.id, "bluesky");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const tail = `\n${url}`;
  const headroom = 300 - tail.length - 2;
  const caption = `${emoji} ${truncate(article.title, headroom)}${tail}`;
  return { caption, url, characterCount: caption.length };
}

// ── Public entry ────────────────────────────────────────────────────────

export function composeAllPlatforms(article) {
  if (!article || !article.id || !article.title) {
    throw new Error("composeAllPlatforms: article with id + title required");
  }
  return {
    article: {
      id: article.id,
      title: article.title,
      source_name: article.source_name,
      category: article.category,
      published_at: article.published_at,
      image_url: article.image_url || null,
    },
    platforms: {
      x:              composeX(article),
      threads:        composeThreads(article),
      facebook:       composeFacebook(article),
      linkedin:       composeLinkedIn(article),
      instagram_feed: composeInstagramFeed(article),
      pinterest:      composePinterest(article),
      bluesky:        composeBluesky(article),
    },
  };
}
