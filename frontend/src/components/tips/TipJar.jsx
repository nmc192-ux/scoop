/**
 * TipJar — "Support Scoop" one-click donation buttons.
 *
 * Shows three preset amounts ($3 / $5 / $10). On click, POSTs to
 * /api/tips/create-session, gets a Stripe Checkout URL, and redirects.
 *
 * Only renders when publicConfig.stripe.configured is true; the parent
 * (App.jsx / ReaderModal footer) should gate on that flag.
 *
 * Props:
 *   compact   — render a single smaller CTA (for in-article use)
 */
import { useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import axios from "axios";
import { track } from "../../lib/track";

const AMOUNTS = [3, 5, 10];

export default function TipJar({ compact = false }) {
  const [loading, setLoading] = useState(null); // null | 3 | 5 | 10
  const [error, setError]     = useState("");

  const handleTip = async (amount) => {
    if (loading) return;
    setLoading(amount); setError("");
    track("tip_click", { metadata: { amount } });
    try {
      const { data } = await axios.post("/api/tips/create-session", { amount });
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Something went wrong"); setLoading(null);
      }
    } catch {
      setError("Unable to start payment — try again"); setLoading(null);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Heart size={14} className="text-red-400 flex-shrink-0" />
        <span className="text-xs text-[var(--color-text-secondary)]">Support Scoop:</span>
        {AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => handleTip(a)}
            disabled={Boolean(loading)}
            className="px-2.5 py-1 rounded-md bg-[var(--color-surface2)] border border-[var(--color-border)] text-xs font-semibold hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            {loading === a ? <Loader2 size={10} className="animate-spin" /> : null}
            ${a}
          </button>
        ))}
        {error && <span className="text-[10px] text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start gap-2.5 mb-3">
        <div className="w-9 h-9 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center flex-shrink-0">
          <Heart size={18} />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Support Scoop ☕</p>
          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-snug">
            Independent news curation, ad-free experience. One-time tip.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {AMOUNTS.map((a) => (
          <button
            key={a}
            onClick={() => handleTip(a)}
            disabled={Boolean(loading)}
            className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm font-semibold
                       hover:bg-red-50 hover:border-red-300 hover:text-red-600
                       dark:hover:bg-red-900/20
                       disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {loading === a ? <Loader2 size={13} className="animate-spin" /> : null}
            ${a}
          </button>
        ))}
      </div>

      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

      <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2 text-center">
        Secure payment via Stripe. We never store your card details.
      </p>
    </div>
  );
}
