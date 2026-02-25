import Parser from "rss-parser";
import { v5 as uuidv5 } from "uuid";
import { logger, logSourceHealth } from "./logger.js";
import { upsertVideo, updateSourceHealth, logIngestionEvent } from "../models/database.js";
import { YOUTUBE_SOURCES } from "../config/sources.js";

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c9";

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "NewsAggregator/1.0 (YouTube RSS Reader)",
    "Accept": "application/rss+xml, application/xml, text/xml, application/atom+xml",
  },
  customFields: {
    item: [
      ["media:group",     "mediaGroup",    { keepArray: false }],
      ["media:thumbnail", "mediaThumbnail",{ keepArray: false }],
      ["yt:videoId",      "ytVideoId"                         ],
      ["yt:channelId",    "ytChannelId"                       ],
    ],
  },
});

function extractYouTubeId(item) {
  // From yt:videoId field
  if (item.ytVideoId) return item.ytVideoId;
  // From link: https://www.youtube.com/watch?v=VIDEO_ID
  const match = (item.link || "").match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  // From id field: yt:video:VIDEO_ID
  const idMatch = (item.id || "").match(/yt:video:(.+)/);
  if (idMatch) return idMatch[1];
  return null;
}

function extractThumbnail(item, videoId) {
  // YouTube RSS provides media:group > media:thumbnail
  if (item.mediaGroup?.["media:thumbnail"]?.["$"]?.url) {
    return item.mediaGroup["media:thumbnail"]["$"].url;
  }
  if (item.mediaThumbnail?.["$"]?.url) return item.mediaThumbnail["$"].url;
  // Fallback: construct from video ID
  if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return null;
}

function extractDescription(item) {
  const raw = item.mediaGroup?.["media:description"]?.[0]
    || item.contentSnippet
    || item.content
    || item.description
    || "";
  return raw.replace(/\s+/g, " ").trim().slice(0, 400) || null;
}

export async function fetchYouTubeChannel(source) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${source.channelId}`;
  const startTime = Date.now();
  let newVideos = 0;

  try {
    const feed = await parser.parseURL(feedUrl);
    const items = feed.items || [];

    for (const item of items) {
      if (!item.title || !item.link) continue;

      const videoId = extractYouTubeId(item);
      if (!videoId) continue;

      const published = item.pubDate ? new Date(item.pubDate).getTime() : Date.now();
      // Skip videos older than 14 days
      if (Date.now() - published > 14 * 24 * 60 * 60 * 1000) continue;

      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const id = uuidv5(url, NAMESPACE);

      const video = {
        id,
        title:        item.title.trim().slice(0, 200),
        description:  extractDescription(item),
        url,
        video_id:     videoId,
        thumbnail:    extractThumbnail(item, videoId),
        channel_name: source.name,
        channel_id:   source.channelId,
        category:     source.category,
        region:       source.region || "global",
        published_at: published,
        fetched_at:   Date.now(),
      };

      const result = upsertVideo(video);
      if (result.changes > 0) newVideos++;
    }

    const duration = Date.now() - startTime;
    updateSourceHealth(`yt:${source.name}`, true, newVideos);
    logIngestionEvent({
      source_name: `YouTube:${source.name}`,
      category: source.category,
      status: "success",
      articles_fetched: items.length,
      articles_new: newVideos,
      error_msg: null,
      duration_ms: duration,
      fetched_at: Date.now(),
    });

    logSourceHealth(`YouTube:${source.name}`, "ok", { new: newVideos, total: items.length });
    return { source: source.name, fetched: items.length, newVideos };

  } catch (err) {
    updateSourceHealth(`yt:${source.name}`, false);
    logIngestionEvent({
      source_name: `YouTube:${source.name}`,
      category: source.category,
      status: "error",
      articles_fetched: 0,
      articles_new: 0,
      error_msg: err.message,
      duration_ms: Date.now() - startTime,
      fetched_at: Date.now(),
    });
    logger.warn(`YouTube fetch failed [${source.name}]: ${err.message}`);
    return { source: source.name, fetched: 0, newVideos: 0, error: err.message };
  }
}

export async function fetchAllYouTube() {
  logger.info(`📺 YouTube ingestion — ${YOUTUBE_SOURCES.length} channels`);
  const startTime = Date.now();

  // Process in batches of 4
  const BATCH_SIZE = 4;
  const results = [];
  for (let i = 0; i < YOUTUBE_SOURCES.length; i += BATCH_SIZE) {
    const batch = YOUTUBE_SOURCES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(s => fetchYouTubeChannel(s)));
    results.push(...batchResults);
    if (i + BATCH_SIZE < YOUTUBE_SOURCES.length) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const totalNew   = results.reduce((s, r) => s + (r.value?.newVideos || 0), 0);
  const totalFetch = results.reduce((s, r) => s + (r.value?.fetched  || 0), 0);
  const errors     = results.filter(r => r.value?.error).length;

  logger.info(`📺 YouTube complete — +${totalNew} videos from ${totalFetch} fetched (${errors} errors) in ${Date.now() - startTime}ms`);
  return { totalNew, totalFetch, errors };
}
