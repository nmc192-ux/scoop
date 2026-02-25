import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNewsStore } from "../store/newsStore";

const api = axios.create({ baseURL: "/api" });

// ─── In-memory cache (session-scoped) ─────────────────────────────────────
const translationCache = new Map();
function getCacheKey(text, lang) { return `${lang}::${text}`; }

// ─── Global pending deduplication — same text = same promise ─────────────
const pendingRequests = new Map();

async function fetchTranslation(texts, lang) {
  const cacheKey = texts.join("|||") + ":::" + lang;
  if (pendingRequests.has(cacheKey)) return pendingRequests.get(cacheKey);

  const promise = (async () => {
    // Split into cache hits vs misses
    const results = new Array(texts.length);
    const toFetch = [];

    texts.forEach((text, i) => {
      const key = getCacheKey(text, lang);
      if (translationCache.has(key)) {
        results[i] = translationCache.get(key);
      } else {
        toFetch.push({ i, text });
      }
    });

    if (toFetch.length > 0) {
      try {
        const { data } = await api.post("/translate", {
          texts: toFetch.map(f => f.text),
          lang,
        });
        if (data.success) {
          data.data.forEach((translated, j) => {
            const { i, text } = toFetch[j];
            // Only cache if genuinely translated (not same as source)
            if (translated && translated !== text) {
              translationCache.set(getCacheKey(text, lang), translated);
            }
            results[i] = translated || text;
          });
        } else {
          toFetch.forEach(({ i, text }) => { results[i] = text; });
        }
      } catch {
        toFetch.forEach(({ i, text }) => { results[i] = text; });
      }
    }
    return results;
  })();

  pendingRequests.set(cacheKey, promise);
  promise.finally(() => pendingRequests.delete(cacheKey));
  return promise;
}

/**
 * Translate an array of strings when language === 'ur'.
 * - First render ALWAYS fires a fetch (prevLang starts null)
 * - Cache hits (session) served synchronously
 * - Falls back to original text on error
 */
export function useTranslatedTexts(texts = []) {
  const { language } = useNewsStore();
  const [translated, setTranslated] = useState(texts);
  const prevLang  = useRef(null);   // null triggers fetch on first render
  const prevKey   = useRef(null);

  useEffect(() => {
    if (language === "en") {
      setTranslated(texts);
      prevLang.current = language;
      prevKey.current  = texts.join("|||");
      return;
    }

    const currentKey = texts.join("|||");
    const textsChanged = currentKey !== prevKey.current;
    const langChanged  = language    !== prevLang.current;

    if (!textsChanged && !langChanged) return;

    prevLang.current = language;
    prevKey.current  = currentKey;

    // Serve cache hits immediately for snappy UX
    const immediate = texts.map(t => translationCache.get(getCacheKey(t, language)) ?? t);
    setTranslated(immediate);

    let cancelled = false;
    (async () => {
      const result = await fetchTranslation(texts, language);
      if (!cancelled) setTranslated([...result]);
    })();

    return () => { cancelled = true; };
  }, [language, texts.join("|||")]);

  return {
    texts:  language === "en" ? texts : translated,
    isUrdu: language === "ur",
  };
}

/** Convenience hook for a single string */
export function useTranslated(text) {
  const { texts } = useTranslatedTexts(text ? [text] : [""]);
  return texts[0] || text;
}
