/**
 * Startup wrapper — loads backend/.env into process.env BEFORE server.js
 * is evaluated, so all env vars (OPENWEATHER_API_KEY, PORT, etc.) are
 * available to every module at initialisation time.
 *
 * Hostinger (and local dev) should run: node backend/start.js
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath   = join(__dirname, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t  = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

// Dynamic import ensures env vars are set before server.js (and all its
// transitive imports) are evaluated.
await import("./server.js");
