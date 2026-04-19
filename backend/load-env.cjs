/**
 * CJS preload script — loaded via `node --require ./backend/load-env.cjs`
 * Reads backend/.env and injects missing keys into process.env BEFORE
 * any ESM module (server.js) is evaluated.
 */
"use strict";
const fs   = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) return;

const lines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const key = t.slice(0, eq).trim();
  const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  if (key && !(key in process.env)) process.env[key] = val;
}
