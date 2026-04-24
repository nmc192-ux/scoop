/**
 * NewsletterSignup — inline email capture. Posts to /api/newsletter/subscribe
 * with the user's current country + language + preferred topics so the digest
 * is pre-tailored on day one.
 *
 * Used both as the "newsletter" HousePromo variant and anywhere else a CTA
 * needs an actual form (e.g. footer, settings panel).
 */
import { useState } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import axios from "axios";
import { useNewsStore } from "../../store/newsStore";
import { useGeo } from "../../hooks/useGeo";
import { track } from "../../lib/track";

export default function NewsletterSignup({ compact = false, source = "inline" }) {
  const { language, preferredTopics } = useNewsStore();
  const { countryCode } = useGeo();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (state === "loading" || state === "done") return;
    const val = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setError("Please enter a valid email"); setState("error"); return;
    }
    setState("loading"); setError("");
    track("newsletter_signup_start", { metadata: { source } });
    try {
      await axios.post("/api/newsletter/subscribe", {
        email: val,
        countryCode,
        language,
        topics: preferredTopics,
      });
      setState("done");
      track("newsletter_signup_complete", { metadata: { source, countryCode, language } });
    } catch (err) {
      setError(err?.response?.data?.error || "Something went wrong");
      setState("error");
    }
  };

  const wrapClass = compact
    ? "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    : "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4";

  if (state === "done") {
    return (
      <div className={wrapClass}>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center flex-shrink-0">
            <Check size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">Check your inbox</p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              We sent a confirmation link to {email}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={wrapClass} id="newsletter">
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="w-9 h-9 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center flex-shrink-0">
          <Bell size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">Daily digest</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-snug">
            Top stories + markets, 7am your time.
          </p>
        </div>
      </div>
      <div className="flex gap-1.5">
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "loading"}
          className="flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface2)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center gap-1.5"
        >
          {state === "loading" ? <Loader2 size={14} className="animate-spin" /> : "Subscribe"}
        </button>
      </div>
      {state === "error" && (
        <p className="text-[11px] text-red-500 mt-1.5">{error}</p>
      )}
      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2">
        Free. Unsubscribe anytime from any email.
      </p>
    </form>
  );
}
