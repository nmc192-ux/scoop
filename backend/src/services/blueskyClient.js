// Minimal Bluesky AT Protocol client — just the few endpoints we need to
// post a link card with a thumbnail. Auth is via env vars BLUESKY_HANDLE +
// BLUESKY_APP_PASSWORD; password should be an "app password" (created at
// bsky.app/settings/app-passwords), NEVER the account's main password.
//
// We cache the access JWT in-process. It's good for ~2 hours; on 401 we
// refresh once and retry. No persistent token store — restart re-creates a
// session, which is cheap.

import { logger } from "./logger.js";

// Lazy getters — read at call time so backend/.env loaded by server.js body is visible.
const getPDS = () => process.env.BLUESKY_PDS_URL || "https://bsky.social";
const getHandle = () => process.env.BLUESKY_HANDLE || "";
const getAppPassword = () => process.env.BLUESKY_APP_PASSWORD || "";

let session = null; // { did, accessJwt, refreshJwt, createdAt }

export function isBlueskyConfigured() {
  return Boolean(getHandle() && getAppPassword());
}

async function call(path, { method = "POST", body, headers = {}, blob = null } = {}) {
  const url = `${getPDS()}/xrpc/${path}`;
  const init = { method, headers: { ...headers } };
  if (blob) {
    init.headers["Content-Type"] = blob.contentType || "application/octet-stream";
    init.body = blob.data;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* keep raw */ }
  if (!res.ok) {
    const err = new Error(`bluesky ${path} → ${res.status} ${json.error || text || "unknown"}`);
    err.statusCode = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function ensureSession({ force = false } = {}) {
  if (session && !force) return session;
  if (!isBlueskyConfigured()) throw new Error("bluesky not configured");
  const out = await call("com.atproto.server.createSession", {
    body: { identifier: getHandle(), password: getAppPassword() },
  });
  session = {
    did: out.did,
    accessJwt: out.accessJwt,
    refreshJwt: out.refreshJwt,
    createdAt: Date.now(),
  };
  return session;
}

async function authed(path, opts = {}) {
  const s = await ensureSession();
  try {
    return await call(path, { ...opts, headers: { Authorization: `Bearer ${s.accessJwt}` } });
  } catch (err) {
    if (err.statusCode === 401 || err.statusCode === 400) {
      // Likely expired token — re-login and retry once.
      const fresh = await ensureSession({ force: true });
      return await call(path, { ...opts, headers: { Authorization: `Bearer ${fresh.accessJwt}` } });
    }
    throw err;
  }
}

// Upload a binary blob (the OG card thumbnail). Returns the blob ref shape
// we need to embed in a post record.
async function uploadBlob(buffer, contentType = "image/png") {
  const out = await authed("com.atproto.repo.uploadBlob", {
    blob: { data: buffer, contentType },
  });
  return out.blob; // { $type, ref: { $link }, mimeType, size }
}

// Build the AT Protocol record for a single news post:
//   - text: headline (Bluesky limit 300 graphemes — we slice on chars conservatively)
//   - external embed: link card with thumb, title, description
function buildPostRecord({ text, externalUrl, externalTitle, externalDescription, thumbBlob }) {
  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.external",
      external: {
        uri: externalUrl,
        title: externalTitle.slice(0, 200),
        description: (externalDescription || "").slice(0, 240),
        ...(thumbBlob ? { thumb: thumbBlob } : {}),
      },
    },
  };
  return record;
}

export async function postToBluesky({ text, externalUrl, externalTitle, externalDescription, thumbBuffer }) {
  if (!isBlueskyConfigured()) throw new Error("bluesky not configured");
  const s = await ensureSession();
  let thumbBlob = null;
  if (thumbBuffer) {
    try { thumbBlob = await uploadBlob(thumbBuffer, "image/png"); }
    catch (err) {
      logger.warn(`bluesky: thumb upload failed (posting without thumb): ${err.message}`);
    }
  }
  const record = buildPostRecord({ text, externalUrl, externalTitle, externalDescription, thumbBlob });
  const out = await authed("com.atproto.repo.createRecord", {
    body: { repo: s.did, collection: "app.bsky.feed.post", record },
  });
  // out: { uri: "at://did/app.bsky.feed.post/<rkey>", cid }
  // Convert to a public URL (https://bsky.app/profile/<handle>/post/<rkey>).
  const rkey = String(out.uri || "").split("/").pop();
  const publicUrl = rkey ? `https://bsky.app/profile/${getHandle()}/post/${rkey}` : "";
  return { uri: out.uri, cid: out.cid, url: publicUrl };
}
