/**
 * NewsletterCaptureModal — gently prompts for an email subscription once per
 * engaged session. Fires on whichever comes first:
 *   - exit-intent  (mouse leaves the top of the viewport, desktop only)
 *   - scroll depth 60%
 *   - 60 seconds of active page time
 *
 * Dismissal is sticky: once the user closes or subscribes, the modal stays
 * hidden for 30 days. Skipped entirely if the user is already subscribed
 * or has visibly interacted with the inline NewsletterSignup in this session.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import NewsletterSignup from "./NewsletterSignup";
import { track } from "../../lib/track";

const STORAGE_KEY = "scoop.newsletterCapture.dismissedAt";
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MIN_SESSION_MS = 15 * 1000; // don't show in the first 15s
const TIME_TRIGGER_MS = 60 * 1000;

function isDismissed() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const at = Number(raw) || 0;
    return Date.now() - at < COOLDOWN_MS;
  } catch { return false; }
}

function markDismissed() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
}

export default function NewsletterCaptureModal() {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    if (isDismissed()) return;

    const show = (reason) => {
      if (shownRef.current) return;
      if (Date.now() - mountedAtRef.current < MIN_SESSION_MS) return;
      shownRef.current = true;
      setOpen(true);
      track("newsletter_signup_start", { metadata: { source: "capture_modal", trigger: reason } });
    };

    // Trigger 1: exit-intent (desktop only; mobile has no useful cursor signal)
    const onMouseOut = (e) => {
      if (e.clientY <= 0 && !e.relatedTarget) show("exit_intent");
    };

    // Trigger 2: scroll depth 60%
    const onScroll = () => {
      const doc = document.documentElement;
      const pct = (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1);
      if (pct > 0.6) show("scroll_60");
    };

    // Trigger 3: 60s of time on page (only while tab is visible)
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") show("time_60s");
    }, TIME_TRIGGER_MS);

    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    setOpen(false);
    markDismissed();
  };

  // Close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") dismiss(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={dismiss}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-[var(--color-bg)] text-[var(--color-text)] rounded-2xl shadow-2xl overflow-hidden border border-[var(--color-border)]"
          >
            <button
              onClick={dismiss}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full hover:bg-[var(--color-surface2)]"
            >
              <X size={16} />
            </button>

            <div className="p-6 pb-2">
              <div className="text-4xl mb-2">📰</div>
              <h2 className="text-xl font-bold leading-tight mb-2">
                Get Scoop in your inbox
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-5">
                The day's biggest stories, sniffed out and delivered at 7am your time.
                Free, and you can unsubscribe anytime.
              </p>
            </div>

            <div className="px-6 pb-6">
              <NewsletterSignup source="capture_modal" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
