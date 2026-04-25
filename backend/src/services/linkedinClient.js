// LinkedIn Company Page publisher.
//
// Uses the UGC Posts API (v2) to post article link-cards + captions to a
// LinkedIn Company Page. Link-card posts (ARTICLE type) automatically unfurl
// the article's OG tags and show a branded thumbnail — no manual image upload
// needed, making this the simplest of the social adapters.
//
// Required env vars:
//   LINKEDIN_ACCESS_TOKEN   — OAuth2 bearer token with w_organization_social scope.
//                             Obtain via https://www.linkedin.com/developers/ by
//                             creating an app and doing the 3-legged OAuth flow as
//                             the admin of the company page.
//   LINKEDIN_ORGANIZATION_ID — Numeric LinkedIn org ID (the number in
//                              linkedin.com/company/<id>/).
//
// Token lifetime: LinkedIn access tokens for organization posting are valid for
// 60 days. Refresh by repeating the OAuth flow or using a refresh token if your
// app has the token-refresh capability. We do NOT auto-refresh here — long-lived
// tokens should be re-issued manually and updated in the Hostinger env panel.
//
// API reference:
//   https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/ugc-post-api

import { logger } from "./logger.js";

const API_BASE = "https://api.linkedin.com/v2";

const getToken  = () => process.env.LINKEDIN_ACCESS_TOKEN  || "";
const getOrgId  = () => process.env.LINKEDIN_ORGANIZATION_ID || "";

export function isLinkedinConfigured() {
  return Boolean(getToken() && getOrgId());
}

async function apiCall(path, { method = "POST", body } = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    "x-restli-protocol-version": "2.0.0",
    "LinkedIn-Version": "202405",
  };
  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) {
    const msg = json?.message || json?.errorDetails || text || "unknown";
    const err = new Error(`linkedin ${path} → ${res.status} ${msg}`);
    err.statusCode = res.status;
    err.body = json;
    throw err;
  }
  // LinkedIn returns the created resource ID in the X-RestLi-Id header or
  // as the `id` field in the JSON body depending on the endpoint.
  return { json, headers: res.headers };
}

// Post a link-card article to the company page.
// `text` is the caption (≤3000 chars per LinkedIn limit).
// `articleUrl` is the canonical link (should resolve to the OG-tagged page).
// `articleTitle` + `articleDescription` populate the card if OG tags are absent.
export async function postToLinkedin({ text, articleUrl, articleTitle = "", articleDescription = "" }) {
  if (!isLinkedinConfigured()) throw new Error("linkedin not configured");

  const orgUrn = `urn:li:organization:${getOrgId()}`;

  // LinkedIn UGC post with ARTICLE share (renders a link-card with the OG image).
  const body = {
    author: orgUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: String(text || "").slice(0, 3000),
        },
        shareMediaCategory: "ARTICLE",
        media: [
          {
            status: "READY",
            originalUrl: articleUrl,
            title: { text: articleTitle.slice(0, 200) },
            ...(articleDescription
              ? { description: { text: articleDescription.slice(0, 400) } }
              : {}),
          },
        ],
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  const { json, headers } = await apiCall("/ugcPosts", { method: "POST", body });

  // LinkedIn returns the post URN in X-RestLi-Id or body.id.
  const postUrn = headers.get("x-restli-id") || json?.id || "";

  // Convert URN to a public URL heuristically.
  // URN shape: urn:li:ugcPost:7123456789 → last segment is the numeric ID.
  const numericId = postUrn.split(":").pop();
  const url = numericId
    ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}/`
    : "";

  logger.info(`linkedin: posted ${postUrn}`);
  return { id: postUrn, url };
}
