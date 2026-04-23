/**
 * Multi-provider translator with a quality-ordered fallback chain.
 *
 *   1. DeepL        — best grammar + fluency.  Needs DEEPL_API_KEY.
 *   2. Google Cloud — strong general quality.   Needs GOOGLE_TRANSLATE_KEY.
 *   3. MyMemory     — free, rate-limited, weaker. Always available.
 *
 * Each provider returns the raw translation; callers run the shared
 * `polishText` pass afterwards to fix common grammatical glitches that tend
 * to survive free-tier translation (double spaces, stray punctuation,
 * missing sentence capitalization, etc.).
 *
 * Providers are retried in order: if the first one throws or returns the
 * source string unchanged we fall through to the next one. The caller
 * sees a single async `translate(text, target, source?)` function.
 */
import axios from "axios";
import { logger } from "./logger.js";

const DEEPL_KEY   = process.env.DEEPL_API_KEY     || "";
const GOOGLE_KEY  = process.env.GOOGLE_TRANSLATE_KEY || "";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "khabari.app@gmail.com";

// DeepL target codes are mostly ISO 639-1 but with a few variations.
const DEEPL_TARGET_MAP = {
  en: "EN-US", pt: "PT-PT", zh: "ZH",
};
function deeplTarget(code) { return (DEEPL_TARGET_MAP[code] || code).toUpperCase(); }

// DeepL uses a different host for free vs pro keys.
function deeplHost() {
  return DEEPL_KEY.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

// ─── Providers ─────────────────────────────────────────────────────────────
async function translateDeepL(text, target, source) {
  if (!DEEPL_KEY) return null;
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("target_lang", deeplTarget(target));
  if (source && source !== "auto") params.append("source_lang", source.toUpperCase());
  const { data } = await axios.post(`${deeplHost()}/v2/translate`, params, {
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    timeout: 15000,
  });
  return data?.translations?.[0]?.text || null;
}

async function translateGoogle(text, target, source) {
  if (!GOOGLE_KEY) return null;
  const { data } = await axios.post(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_KEY}`,
    { q: text, target, source: source && source !== "auto" ? source : undefined, format: "text" },
    { timeout: 15000 }
  );
  return data?.data?.translations?.[0]?.translatedText || null;
}

async function translateMyMemory(text, target, source) {
  const langpair = `${source || "en"}|${target}`;
  const { data } = await axios.get("https://api.mymemory.translated.net/get", {
    params: { q: text.slice(0, 500), langpair, de: MYMEMORY_EMAIL },
    timeout: 15000,
  });
  const result = data?.responseData?.translatedText || null;
  if (!result) return null;
  // MyMemory returns sentinel strings on failure or rate-limit.
  if (/^PLEASE SELECT|^INVALID|^MYMEMORY/i.test(result)) return null;
  if (data?.responseStatus === 429) return null;
  return result;
}

// ─── Grammar polish ────────────────────────────────────────────────────────
/**
 * Light-touch text cleanup applied to every translation. These are all
 * conservative — they only fix clearly wrong output — so they're safe to run
 * regardless of provider. For RTL targets we skip capitalization.
 */
export function polishText(text, target) {
  if (!text) return text;
  let t = String(text);

  // Normalize whitespace.
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n");

  // Common free-translator artifacts.
  t = t.replace(/\s+([,.!?:;])/g, "$1");            // " ," → ","
  t = t.replace(/([,.!?:;])([^\s"'\d])/g, "$1 $2"); // ",X" → ", X"
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  t = t.replace(/"\s+([^"]+?)\s+"/g, '"$1"');

  // Sentence-start capitalization (LTR languages only; skip RTL scripts).
  const rtl = ["ar", "fa", "ur", "he", "ps", "sd"].includes(target);
  if (!rtl) {
    t = t.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre, ch) => pre + ch.toUpperCase());
    // Standalone "i" → "I" (English pronoun).
    if (target === "en") t = t.replace(/\bi\b/g, "I");
  }

  // Trim.
  return t.trim();
}

// ─── Public API ────────────────────────────────────────────────────────────
const PROVIDERS = [
  { name: "deepl",    fn: translateDeepL,    enabled: () => !!DEEPL_KEY  },
  { name: "google",   fn: translateGoogle,   enabled: () => !!GOOGLE_KEY },
  { name: "mymemory", fn: translateMyMemory, enabled: () => true         },
];

export function availableProviders() {
  return PROVIDERS.filter((p) => p.enabled()).map((p) => p.name);
}

/**
 * Translate `text` to `target` (ISO 639-1). Returns the translated string,
 * or the original text if every provider fails. Never throws.
 */
export async function translate(text, target, source = "auto") {
  if (!text || !target || target === source) return text;
  for (const p of PROVIDERS) {
    if (!p.enabled()) continue;
    try {
      const out = await p.fn(text, target, source);
      if (out && out.trim() && out.trim() !== text.trim()) {
        return polishText(out, target);
      }
    } catch (err) {
      logger.warn(`translator: ${p.name} failed — ${err.message}`);
    }
  }
  return text;
}
