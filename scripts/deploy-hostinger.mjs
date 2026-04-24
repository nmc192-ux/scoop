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
import { createReadStream, statSync, existsSync, mkdirSync, rmSync, readdirSync } from "fs";
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
// Guard against the common "export HOSTINGER_API_TOKEN=your_token" slip — any
// obvious placeholder would just produce a confusing 401 at the API layer.
if (/^(your_token|your-token|YOUR_TOKEN|xxx+|placeholder)$/i.test(API_TOKEN)) {
  console.error("❌  HOSTINGER_API_TOKEN looks like a placeholder. Paste your real token.");
  console.error("    Generate one at: https://hpanel.hostinger.com/profile/api");
  process.exit(1);
}
if (API_TOKEN.length < 24) {
  console.error(`❌  HOSTINGER_API_TOKEN looks too short (${API_TOKEN.length} chars). Expected a real bearer token.`);
  process.exit(1);
}

// ── Lazy-install deps if needed ─────────────────────────────────────────────
// Install both packages in one call — two sequential `npm install --no-save`
// invocations have been observed to undo each other on fresh machines.
async function ensureDeps() {
  const deps = ["axios", "tus-js-client"];
  const missing = [];
  for (const dep of deps) {
    try { await import(dep); } catch { missing.push(dep); }
  }
  if (missing.length === 0) return;
  console.log(`📦  Installing ${missing.join(", ")}…`);
  execSync(`npm install --no-save ${missing.join(" ")}`, { stdio: "inherit", cwd: ROOT });
  // Re-verify — if install churn dropped something, fail loudly rather than
  // mid-run.
  for (const dep of deps) {
    try { await import(dep); } catch (err) {
      throw new Error(`Failed to import ${dep} after install: ${err.message}`);
    }
  }
}

// ── Build archive ────────────────────────────────────────────────────────────
// Strategy: archive ONLY files tracked by git (via `git ls-files`) plus the
// frontend build output. This guarantees we never ship:
//   - the local SQLite database (backend/data/news.db) which would overwrite prod
//   - node_modules / .git / .claude / stray local files
//   - secrets in untracked .env files
//   - previous deploy zips
function buildArchive() {
  console.log("🗜   Building deployment archive…");
  if (existsSync(ARCHIVE)) rmSync(ARCHIVE);

  // Collect the file list. git ls-files respects .gitignore and lists tracked
  // paths relative to the repo root.
  let trackedFiles;
  try {
    trackedFiles = execSync("git ls-files -z", { cwd: ROOT })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
  } catch (err) {
    throw new Error(`git ls-files failed — are you inside a git repo? ${err.message}`);
  }
  if (trackedFiles.length === 0) {
    throw new Error("git ls-files returned no files — nothing to deploy");
  }

  // frontend/dist is in .gitignore but must ship. Fail early if the build
  // hasn't been run, rather than deploying a stale / empty dist.
  const distDir = path.join(ROOT, "frontend/dist");
  if (!existsSync(distDir) || !existsSync(path.join(distDir, "index.html"))) {
    throw new Error("frontend/dist/index.html not found — run `npm run build --prefix frontend` before deploying");
  }
  const distFiles = listDir(distDir)
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join("/"));

  // Defense-in-depth: drop anything matching these patterns even if
  // accidentally tracked. The local news.db is the one that would destroy prod.
  const DANGEROUS = [
    /(^|\/)backend\/data\//,
    /(^|\/)backend\/logs\//,
    /(^|\/)\.env(\.|$)/,
    /(^|\/)node_modules\//,
    /(^|\/)\.git\//,
    /(^|\/)\.claude\//,
    /\.zip$/,
    /(^|\/)\.DS_Store$/,
  ];
  const files = Array.from(new Set([...trackedFiles, ...distFiles]))
    .filter((f) => !DANGEROUS.some((rx) => rx.test(f)));

  // Write the list to a temp file and feed it to zip via -@. This avoids
  // command-line length limits on large repos.
  const listFile = path.join(ROOT, ".deploy-filelist.txt");
  execSync(`printf '%s\\n' ${files.map(shQuote).join(" ")} > "${listFile}"`, { shell: "/bin/sh" });

  try {
    execSync(`cd "${ROOT}" && zip -q "${ARCHIVE}" -@ < "${listFile}"`, {
      stdio: ["inherit", "inherit", "inherit"],
      shell: "/bin/sh",
    });
  } finally {
    rmSync(listFile, { force: true });
  }

  const size = (statSync(ARCHIVE).size / 1024).toFixed(0);
  console.log(`✅  Archive ready: ${ARCHIVE} (${size} KB, ${files.length} files)`);
}

function listDir(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listDir(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function shQuote(s) {
  // POSIX-safe single-quote escape for use inside a shell command.
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
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
