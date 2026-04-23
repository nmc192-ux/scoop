/**
 * ReaderModal — distraction-free in-app article reader.
 *
 * Shows up as a full-screen overlay, fetches the Readability-extracted article
 * from /api/reader, renders the sanitized HTML with our typography, and lets
 * users bail to the source site if extraction fails or they want the full page.
 */
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Type, Sun, Bookmark, Share2, Languages, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useReaderStore, useReaderArticle, useTranslatedReader } from "../../hooks/useReader";
import { useNewsStore } from "../../store/newsStore";
import { isRtl, langFont, nativeName, LANG_BY_CODE } from "../../lib/languages";

const FONT_SIZES = [
  { id: "sm",  label: "A",  size: 15 },
  { id: "md",  label: "A",  size: 17 },
  { id: "lg",  label: "A",  size: 19 },
  { id: "xl",  label: "A",  size: 22 },
];

export default function ReaderModal() {
  const { article, open, closeReader } = useReaderStore();
  const { saveArticle, savedArticles, language, autoLanguage } = useNewsStore();
  const url = open ? article?.url : null;
  const { data, isLoading, isError, error } = useReaderArticle(url);

  const sourceLang = article?.language || data?.lang?.slice(0, 2) || "en";
  // Target language: if user has picked an explicit language, translate to it
  // unless it matches the article's source. "Auto" = show source language.
  const targetLang = autoLanguage ? sourceLang : language;
  const { html, title: translatedTitle, isTranslating } = useTranslatedReader(
    data, targetLang, sourceLang
  );

  const [fontIdx, setFontIdx] = useState(1);
  const [sepia,   setSepia]   = useState(false);
  const rtl = isRtl(targetLang);
  const font = langFont(targetLang);

  const isSaved = article && savedArticles?.some?.((a) => a.id === article.id);

  // Lock body scroll while open + support Esc
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && closeReader();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, closeReader]);

  const fontPx = FONT_SIZES[fontIdx].size;

  const handleShare = () => {
    if (!article) return;
    if (navigator.share) {
      navigator.share({ title: article.title, url: article.url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(article.url);
    }
  };

  return (
    <AnimatePresence>
      {open && article && (
        <motion.div
          key="reader-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-stretch justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeReader}
        >
          <motion.div
            key="reader-sheet"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-[780px] mx-auto my-0 sm:my-8 flex flex-col overflow-hidden shadow-2xl
                        ${sepia ? "bg-[#f7f1e3] text-[#3a2e1f]" : "bg-[var(--color-bg)] text-[var(--color-text)]"}
                        sm:rounded-2xl`}
          >
            {/* ── Top bar ── */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--color-border)] bg-inherit">
              <button
                onClick={closeReader}
                className="p-2 rounded-full hover:bg-[var(--color-surface2)]"
                aria-label="Close reader"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-1">
                {/* Translation indicator — small pill showing target language */}
                {sourceLang !== targetLang && (
                  <span
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-brand-blue/10 text-brand-blue text-[10px] font-bold uppercase tracking-wider"
                    title={`Translated from ${nativeName(sourceLang)} to ${nativeName(targetLang)}`}
                  >
                    {isTranslating
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Languages size={11} />}
                    {LANG_BY_CODE[targetLang]?.flag} {targetLang.toUpperCase()}
                  </span>
                )}
                <button
                  onClick={() => setFontIdx((i) => (i + 1) % FONT_SIZES.length)}
                  className="p-2 rounded-full hover:bg-[var(--color-surface2)]"
                  aria-label="Change font size"
                  title={`Font size: ${FONT_SIZES[fontIdx].id}`}
                >
                  <Type size={16} />
                </button>
                <button
                  onClick={() => setSepia((s) => !s)}
                  className={`p-2 rounded-full ${sepia ? "bg-amber-500/20" : "hover:bg-[var(--color-surface2)]"}`}
                  aria-label="Toggle sepia"
                >
                  <Sun size={16} />
                </button>
                <button
                  onClick={() => saveArticle?.(article)}
                  className={`p-2 rounded-full ${isSaved ? "bg-brand-blue/20 text-brand-blue" : "hover:bg-[var(--color-surface2)]"}`}
                  aria-label="Save article"
                >
                  <Bookmark size={16} />
                </button>
                <button
                  onClick={handleShare}
                  className="p-2 rounded-full hover:bg-[var(--color-surface2)]"
                  aria-label="Share"
                >
                  <Share2 size={16} />
                </button>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 flex items-center gap-1 text-xs font-semibold text-brand-blue hover:underline px-2 py-1 rounded whitespace-nowrap"
                >
                  <ExternalLink size={13} />
                  Source
                </a>
              </div>
            </div>

            {/* ── Body ── */}
            <div
              className="overflow-y-auto flex-1 px-5 sm:px-10 py-8"
              style={{ fontSize: fontPx, fontFamily: font, direction: rtl ? "rtl" : "ltr", textAlign: rtl ? "right" : "left" }}
              lang={targetLang}
            >
              {article.image_url && (
                <img
                  src={article.image_url}
                  alt=""
                  className="w-full rounded-xl mb-6 max-h-[360px] object-cover"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              )}

              <p className="text-xs uppercase tracking-wider opacity-60 mb-2">
                {article.source_name} · {article.category}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-4">
                {translatedTitle || data?.title || article.title}
              </h1>
              {(data?.byline || article.author) && (
                <p className="text-sm opacity-70 mb-6">
                  By {data?.byline || article.author}
                </p>
              )}

              {isLoading && (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-4 rounded bg-[var(--color-surface2)]" style={{ width: `${80 + Math.random() * 20}%` }} />
                  ))}
                </div>
              )}

              {isError && (
                <div className="rounded-xl border border-[var(--color-border)] p-6 text-center">
                  <p className="font-semibold mb-2">Couldn't extract this article</p>
                  <p className="text-sm opacity-70 mb-4">
                    {error?.message || "The source site blocked extraction or the page isn't a standard article."}
                  </p>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 rounded-full bg-brand-blue text-white text-sm font-semibold"
                  >
                    Read on {new URL(article.url).hostname}
                  </a>
                </div>
              )}

              {html && (
                <article
                  className="reader-body"
                  style={{ lineHeight: 1.7 }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}

              {data?.length > 0 && (
                <p className="text-xs opacity-50 mt-10 pt-6 border-t border-[var(--color-border)]">
                  Extracted from {new URL(article.url).hostname} · approx {Math.max(1, Math.round(data.length / 1100))} min read ·{" "}
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="underline">original</a>
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
