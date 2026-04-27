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
  // X: 280 chars hard cap. URL counts as 23 chars (t.co shortener) regardless
  // of actual length, but we count actual length to be safe — leaves a tiny
  // buffer for unicode emoji widening. We include the URL so posts auto-unfurl
  // into the article card.
  const url = utmUrl(article.id, "x");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG].slice(0, 3);
  const tail = `\n\n${url}\n${hashtags.join(" ")}`;
  const head = `${emoji} ${article.title}`;

  // If the headline alone is short enough, try to add a 1-line description
  // preview so the tweet reads as more than a bare link drop. Tweets that
  // bundle headline + tease tend to outperform raw headlines on engagement.
  const baseLen = head.length + tail.length;
  const descBudget = 280 - baseLen - 2; // -2 for the "\n\n" separator
  let body = head;
  if (descBudget >= 50 && article.description) {
    const desc = truncate(article.description, descBudget);
    if (desc && desc.length >= 30) body = `${head}\n\n${desc}`;
  } else if (head.length > 280 - tail.length) {
    // Headline alone is too long — truncate it.
    body = truncate(head, 280 - tail.length);
  }

  const caption = `${body}${tail}`;
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
  // Best shape: emoji + headline → synthesis paragraph → "Read more" CTA + link
  // → 2 hashtags. FB auto-previews the link so we can lean on description +
  // source + CTA. Description budget bumped to 320 chars — FB tolerates more
  // text under the headline than X without engagement penalty, and longer
  // captions correlate with higher comment rates on news content.
  const url = utmUrl(article.id, "facebook");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const hashtags = (CATEGORY_HASHTAGS[article.category] || []).slice(0, 2);
  const desc = truncate(article.description || "", 320);
  const cta = article.source_name
    ? `📖 Read more (${article.source_name}): ${url}`
    : `📖 Read more: ${url}`;
  const parts = [
    `${emoji} ${article.title}`,
    desc || null,
    cta,
    hashtags.length ? hashtags.join(" ") : null,
  ].filter(Boolean);
  const caption = parts.join("\n\n");
  return { caption, url, characterCount: caption.length };
}

// Category-keyed hook lines for LinkedIn. The first 1-2 lines of a LinkedIn
// post are the only thing visible above the "...see more" fold, so leading
// with a curiosity-pitch instead of a bare headline meaningfully lifts
// expand-rate. These are intentionally short (≤ ~50 chars) and category-
// relevant so they don't read as templated.
const LINKEDIN_HOOKS = {
  top:           "Today's top story 👇",
  politics:      "Worth tracking 👇",
  pakistan:      "From Pakistan 👇",
  international: "On the global desk 👇",
  science:       "New research worth knowing 👇",
  medicine:      "Healthcare update 👇",
  "public-health": "Public health watch 👇",
  health:        "Health & wellness 👇",
  environment:   "Climate desk 👇",
  "self-help":   "For the personal-growth crowd 👇",
  sports:        "Sports update 👇",
  cars:          "Auto industry move 👇",
  ai:            "AI watch 👇",
};

function composeLinkedIn(article) {
  // LinkedIn: 3000 char hard cap, engagement peaks around 1300-1500 chars.
  // Successful structure for B2B news posts:
  //   Line 1 — curiosity hook (above-fold)
  //   Line 2 — title in TITLE CASE for emphasis (LI strips markdown)
  //   Para  — analytical context (description)
  //   Line  — source attribution + clickable URL
  //   Line  — 4 hashtags max (more reads as spam on LI)
  const url = utmUrl(article.id, "linkedin");
  const hashtags = [...(CATEGORY_HASHTAGS[article.category] || []), BRAND_HASHTAG].slice(0, 4);

  const hook  = LINKEDIN_HOOKS[article.category] || "Worth a read 👇";
  const title = String(article.title || "").trim();
  const body  = String(article.description || "").trim();
  const src   = article.source_name || "the source";

  const parts = [
    hook,
    title,
    body || null,
    `📍 Full reporting from ${src}: ${url}`,
    hashtags.length ? hashtags.join(" ") : null,
  ].filter(Boolean);

  let caption = parts.join("\n\n");
  // Hard 3000ch cap — extremely unlikely to hit, but truncate the body if so.
  if (caption.length > 3000) caption = truncate(caption, 3000);
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
  // Bluesky: 300 grapheme limit. Bluesky also accepts an external embed
  // (set in blueskyClient via thumb + externalUrl), so we don't need to
  // include the URL in the text — that doubles up with the link card and
  // looks cluttered. Instead spend the budget on a description preview +
  // source attribution + 1 hashtag, which actually reads like a real post.
  const url = utmUrl(article.id, "bluesky");
  const emoji = CATEGORY_EMOJI[article.category] || "📰";
  const src = article.source_name ? `Via ${article.source_name}` : "";
  const hashtag = (CATEGORY_HASHTAGS[article.category] || [])[0] || "";

  // Tail = source line + optional hashtag. Reserve room for it before the
  // description gets a budget.
  const tailParts = [src, hashtag].filter(Boolean);
  const tail = tailParts.length ? `\n\n${tailParts.join(" · ")}` : "";

  const head = `${emoji} ${article.title}`;
  const headHasRoom = head.length + tail.length;
  const descBudget = 300 - headHasRoom - 4; // -4 for "\n\n" between head + desc

  // If the headline alone is already at-budget (long title), skip the
  // description and just send headline + tail.
  let body = head;
  if (descBudget > 60 && article.description) {
    const desc = truncate(article.description, descBudget);
    if (desc) body = `${head}\n\n${desc}`;
  }

  let caption = `${body}${tail}`;
  // Final safety check — Bluesky counts graphemes, not chars; we're conservative
  // by counting chars. If we're over, lop the tail.
  if (caption.length > 300) caption = truncate(caption, 300);

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
