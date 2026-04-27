/**
 * Startup wrapper — loads .env files into process.env BEFORE server.js
 * is evaluated, so all env vars (OPENWEATHER_API_KEY, PORT, etc.) are
 * available to every module at initialisation time.
 *
 * Hostinger (and local dev) should run: node backend/start.js
 *
 * ─── Why two env-file paths? ─────────────────────────────────────────────
 * Hostinger's git auto-deploy can wipe untracked files (.env is gitignored)
 * on each redeploy. We've had social-poster credentials silently disappear
 * on production because backend/.env got cleared during a redeploy. To make
 * the system survive this, we ALSO load from a path outside the deploy
 * directory (~/.scoopfeeds.env by default, or whatever SCOOP_SECRETS_FILE
 * points at). Anything you put there persists across deploys because
 * Hostinger never touches your home directory.
 *
 * Precedence (first match wins, later sources don't overwrite):
 *   1. process.env (Hostinger panel env vars, shell exports)  — strongest
 *   2. backend/.env                                            — gets wiped by redeploys
 *   3. SCOOP_SECRETS_FILE or ~/.scoopfeeds.env                 — survives redeploys
 *
 * For ANYTHING that needs to survive a redeploy (social tokens, API keys,
 * Stripe webhook secrets), use option 1 or option 3.
 */
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path) {
  if (!path || !existsSync(path)) return 0;
  let count = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    // First source wins — process.env (set by the platform / shell) takes
    // priority over file-based sources, and earlier files take priority
    // over later ones.
    if (key && !(key in process.env)) {
      process.env[key] = val;
      count++;
    }
  }
  return count;
}

// 2. backend/.env (in the deploy directory — gets wiped on redeploy)
const inRepoEnv = join(__dirname, ".env");
const inRepoCount = loadEnvFile(inRepoEnv);

// 3. ~/.scoopfeeds.env or whatever SCOOP_SECRETS_FILE points at — outside the
//    deploy directory so it survives `git clean -fd` and fresh-checkout deploys.
const persistentEnv =
  process.env.SCOOP_SECRETS_FILE ||
  join(os.homedir() || "", ".scoopfeeds.env");
const persistentCount = loadEnvFile(persistentEnv);

// Tiny startup banner so it's obvious in logs which sources contributed —
// helps debug "credentials disappeared" mysteries.
if (inRepoCount || persistentCount) {
  // eslint-disable-next-line no-console
  console.log(
    `[start] env loaded: ${inRepoCount} from backend/.env, ` +
    `${persistentCount} from ${persistentEnv}`
  );
}

// Dynamic import ensures env vars are set before server.js (and all its
// transitive imports) are evaluated.
await import("./server.js");
