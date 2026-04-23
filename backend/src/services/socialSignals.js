/**
 * Social Signals — pulls posts from X (Twitter) and Truth Social via a
 * self-hosted RSSHub instance and turns them into lightweight "social
 * article" records the events synthesizer can consume alongside RSS
 * articles.
 *
 * Why RSSHub: X and Truth Social don't expose usable public APIs.
 * RSSHub bridges both (/twitter/user/:username, /truthsocial/user/
 * :username) and can be self-hosted on Hugging Face Spaces for free.
 * Deploy scaffold lives at deploy/rsshub-hf/.
 *
 * Env vars:
 *   RSSHUB_URL  base URL of the self-hosted RSSHub (e.g.
 *               https://drjahanzeb-rsshub.hf.space). When unset this
 *               module returns [] — the synthesizer keeps working
 *               against RSS-only material.
 *
 * The function is deliberately defensive: any fetch failure returns an
 * empty list for that account so one 429 can't take down the whole
 * dossier refresh.
 */

import axios from "axios";
import Parser from "rss-parser";
import { logger } from "./logger.js";

const parser = new Parser({ timeout: 8000 });
const DEFAULT_TIMEOUT = 9000;

function baseUrl() {
  return (process.env.RSSHUB_URL || "").replace(/\/+$/, "");
}

/**
 * Fetch recent posts from one X account. `handle` is the @username
 * without the @ sign.
 */
export async function fetchXPosts(handle, { limit = 10 } = {}) {
  const base = baseUrl();
  if (!base || !handle) return [];
  const url = `${base}/twitter/user/${encodeURIComponent(handle)}`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, limit).map((it) => ({
      id: it.guid || it.link,
      title: (it.title || "").slice(0, 240),
      description: it.contentSnippet || it.content || "",
      url: it.link,
      source_name: `@${handle}`,
      platform: "x",
      published_at: it.isoDate ? new Date(it.isoDate).getTime() : Date.now(),
    }));
  } catch (err) {
    logger.warn("X fetch failed", { handle, error: err.message });
    return [];
  }
}

/**
 * Fetch recent Truth Social posts from one account.
 */
export async function fetchTruthSocialPosts(handle, { limit = 10 } = {}) {
  const base = baseUrl();
  if (!base || !handle) return [];
  const url = `${base}/truthsocial/user/${encodeURIComponent(handle)}`;
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).slice(0, limit).map((it) => ({
      id: it.guid || it.link,
      title: (it.title || "").slice(0, 240),
      description: it.contentSnippet || it.content || "",
      url: it.link,
      source_name: `@${handle} (Truth Social)`,
      platform: "truthsocial",
      published_at: it.isoDate ? new Date(it.isoDate).getTime() : Date.now(),
    }));
  } catch (err) {
    logger.warn("Truth Social fetch failed", { handle, error: err.message });
    return [];
  }
}

/**
 * Pull all configured social signals for one event and return the
 * merged, keyword-filtered list ordered newest-first.
 */
export async function fetchEventSocialSignals(eventConfig) {
  if (!baseUrl()) return { posts: [], enabled: false };

  const xHandles = eventConfig.xHandles || [];
  const tsHandles = eventConfig.truthSocialHandles || [];
  if (xHandles.length === 0 && tsHandles.length === 0) {
    return { posts: [], enabled: true };
  }

  const tasks = [
    ...xHandles.map((h) => fetchXPosts(h, { limit: 6 })),
    ...tsHandles.map((h) => fetchTruthSocialPosts(h, { limit: 6 })),
  ];
  const results = await Promise.allSettled(tasks);
  const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Keyword filter — avoid flooding the brief with off-topic posts.
  const keywords = (eventConfig.keywords || []).map((k) => k.toLowerCase());
  const relevant = keywords.length === 0
    ? all
    : all.filter((p) => {
        const blob = `${p.title} ${p.description}`.toLowerCase();
        return keywords.some((k) => blob.includes(k));
      });

  relevant.sort((a, b) => b.published_at - a.published_at);
  return { posts: relevant.slice(0, 20), enabled: true };
}

export function isRsshubEnabled() {
  return Boolean(baseUrl());
}
