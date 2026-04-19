#!/usr/bin/env node
/**
 * Hostinger Node.js Deployment Script
 * Packages the app as a zip and deploys it via the Hostinger REST API.
 *
 * Required env vars:
 *   HOSTINGER_API_TOKEN  – your Hostinger API token
 *   HOSTINGER_DOMAIN     – target domain, e.g. scoopfeeds.com
 *
 * Usage:
 *   node scripts/deploy-hostinger.mjs
 */

import { execSync } from "child_process";
import { createReadStream, statSync, existsSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Config ──────────────────────────────────────────────────────────────────
const API_TOKEN = process.env.HOSTINGER_API_TOKEN || process.env.API_TOKEN;
const DOMAIN    = process.env.HOSTINGER_DOMAIN    || "scoopfeeds.com";
const BASE_URL  = "https://developers.hostinger.com";
const ARCHIVE   = path.join(ROOT, "deploy-hostinger-ci.zip");

if (!API_TOKEN) {
  console.error("❌  HOSTINGER_API_TOKEN is required");
  process.exit(1);
}

// ── Lazy-install deps if needed ─────────────────────────────────────────────
async function ensureDeps() {
  const deps = ["axios", "tus-js-client"];
  for (const dep of deps) {
    try { await import(dep); } catch {
      console.log(`📦  Installing ${dep}…`);
      execSync(`npm install --no-save ${dep}`, { stdio: "inherit" });
    }
  }
}

// ── Build archive ────────────────────────────────────────────────────────────
function buildArchive() {
  console.log("🗜   Building deployment archive…");
  if (existsSync(ARCHIVE)) rmSync(ARCHIVE);

  execSync(
    `cd "${ROOT}" && zip -r "${ARCHIVE}" . \
      --exclude "*/node_modules/*" \
      --exclude "*/.git/*" \
      --exclude "*/backend/data/*" \
      --exclude "*/backend/logs/*" \
      --exclude "*/frontend/dist/*" \
      --exclude "*/.env.local" \
      --exclude "*.zip"`,
    { stdio: "inherit" }
  );

  const size = (statSync(ARCHIVE).size / 1024).toFixed(0);
  console.log(`✅  Archive ready: ${ARCHIVE} (${size} KB)`);
}

// ── Hostinger API helpers ────────────────────────────────────────────────────
async function api(method, path, data) {
  const { default: axios } = await import("axios");
  const url = `${BASE_URL}/${path.replace(/^\//, "")}`;
  const res = await axios({
    method,
    url,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    data,
    validateStatus: (s) => s < 500,
    timeout: 60_000,
  });
  if (res.status >= 400) throw new Error(`API ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data;
}

async function resolveUsername() {
  console.log("🔍  Resolving hosting username…");
  const sites = await api("get", "api/hosting/v1/websites");
  const site  = (sites.data || sites).find((s) => s.domain === DOMAIN);
  if (!site) throw new Error(`Domain ${DOMAIN} not found in account`);
  console.log(`    username: ${site.username}`);
  return site.username;
}

async function fetchUploadCredentials(username) {
  console.log("🔑  Fetching upload credentials…");
  return api("post", "api/hosting/v1/files/upload-urls", { username, domain: DOMAIN });
}

async function uploadArchive(credentials) {
  const { default: tus } = await import("tus-js-client");
  const { url: uploadUrl, auth_key: authToken, rest_auth_key: authRestToken } = credentials;
  const filename = path.basename(ARCHIVE);
  const stats    = statSync(ARCHIVE);

  const cleanUrl = uploadUrl.replace(/\/$/, "");
  const fullUrl  = `${cleanUrl}/${filename}?override=true`;

  const { default: axios } = await import("axios");
  console.log("⬆️   Pre-upload POST…");
  await axios.post(fullUrl, "", {
    headers: {
      "X-Auth":      authToken,
      "X-Auth-Rest": authRestToken,
      "upload-length": String(stats.size),
      "upload-offset": "0",
    },
    validateStatus: (s) => s === 201,
    timeout: 60_000,
  });

  console.log("⬆️   Uploading via TUS…");
  await new Promise((resolve, reject) => {
    const upload = new tus.Upload(createReadStream(ARCHIVE), {
      uploadUrl: fullUrl,
      retryDelays: [1000, 2000, 4000, 8000, 16000, 20000],
      uploadDataDuringCreation: false,
      chunkSize: 10_485_760,
      uploadSize: stats.size,
      headers: {
        "X-Auth":      authToken,
        "X-Auth-Rest": authRestToken,
        "upload-length": String(stats.size),
        "upload-offset": "0",
      },
      metadata: { filename },
      onError:   (e) => reject(new Error(`TUS upload failed: ${e.message}`)),
      onSuccess: () => { console.log("✅  Upload complete"); resolve(); },
    });
    upload.start();
  });
}

async function fetchBuildSettings(username) {
  console.log("⚙️   Fetching build settings…");
  return api(
    "get",
    `api/hosting/v1/accounts/${username}/websites/${DOMAIN}/nodejs/builds/settings/from-archive?archive_path=${encodeURIComponent(path.basename(ARCHIVE))}`
  );
}

async function triggerBuild(username, settings) {
  console.log("🚀  Triggering build…");
  const payload = {
    ...settings,
    node_version: settings?.node_version || 20,
    source_type: "archive",
    source_options: { archive_path: path.basename(ARCHIVE) },
  };
  const result = await api(
    "post",
    `api/hosting/v1/accounts/${username}/websites/${DOMAIN}/nodejs/builds`,
    payload
  );
  console.log(`✅  Build queued: ${result.uuid || JSON.stringify(result)}`);
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await ensureDeps();
    buildArchive();

    const username    = await resolveUsername();
    const credentials = await fetchUploadCredentials(username);
    await uploadArchive(credentials);
    const settings    = await fetchBuildSettings(username);
    await triggerBuild(username, settings);

    console.log("\n🎉  Deployment triggered! Monitor at:");
    console.log(`    https://hpanel.hostinger.com\n`);
    rmSync(ARCHIVE, { force: true });
  } catch (err) {
    console.error("❌  Deploy failed:", err.message);
    process.exit(1);
  }
})();
