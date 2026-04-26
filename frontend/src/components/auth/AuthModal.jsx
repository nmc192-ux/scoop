/**
 * AuthModal — sign in / sign out panel.
 *
 * When open and the user is not logged in, shows the magic-link email form.
 * When the user IS logged in, shows their profile: email, preferred topics,
 * sign-out button, and a link to their referral URL.
 *
 * Usage:
 *   <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} auth={auth} />
 * where `auth` is the object returned by `useAuth()`.
 */
import { useState } from "react";
import { X, Mail, Check, Loader2, LogOut, User, BookmarkCheck, Star } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { readSubToken } from "../newsletter/NewsletterSignup";

export default function AuthModal({ open, onClose }) {
  const auth = useAuth();
  const [email, setEmail]       = useState("");
  const [sent, setSent]         = useState(false);
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState("");
  const [upgrading, setUpgrading] = useState(false);

  const subToken = readSubToken();
  const referralUrl = subToken ? `https://scoopfeeds.com/?ref=${subToken}` : null;

  if (!open) return null;

  const handleRequest = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await auth.requestLink(email.trim());
      setSent(true);
    } catch (error) {
      setErr(error?.response?.data?.error || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    await auth.logout();
    onClose();
  };

  const handleUpgrade = async () => {
    if (upgrading) return;
    setUpgrading(true);
    try {
      const res = await fetch("/api/tips/subscribe", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.alreadyPremium) {
        // Already premium — nothing to do; modal will show premium badge on next hydration.
        window.location.reload();
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setErr(data.error || "Could not start upgrade. Try again.");
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
        >
          <X size={20} />
        </button>

        {auth.isLoggedIn ? (
          /* ── Logged-in view ────────────────��──────── */
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                <User size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">{auth.user.email}</p>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">Signed in</p>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface2)] p-3 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <BookmarkCheck size={14} className="text-brand-blue" />
                <span className="text-xs font-semibold">
                  {auth.savedArticles.length} saved article{auth.savedArticles.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                Synced across all your devices.
              </p>
            </div>

            {/* Premium upgrade / status */}
            {auth.isPremium ? (
              <div className="rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-900/10 p-3 mb-4 flex items-center gap-2">
                <Star size={14} className="text-amber-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Premium — Ad-free</p>
                  <p className="text-[11px] text-[var(--color-text-tertiary)]">Thank you for supporting Scoop!</p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={upgrading}
                className="w-full mb-4 flex items-center justify-center gap-2 py-2.5 rounded-xl
                           bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-semibold
                           hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {upgrading ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
                Go Premium — Ad-free · $5/mo
              </button>
            )}

            {referralUrl && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface2)] p-3 mb-4">
                <p className="text-xs font-semibold mb-1">Your invite link</p>
                <p className="text-[11px] text-brand-blue break-all">{referralUrl}</p>
              </div>
            )}

            {err && <p className="text-[11px] text-red-500 mb-3">{err}</p>}

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface2)] transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        ) : sent ? (
          /* ── Magic link sent ─────────��─────────────── */
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center mx-auto mb-3">
              <Check size={22} />
            </div>
            <h3 className="text-base font-bold mb-1">Check your email</h3>
            <p className="text-sm text-[var(--color-text-secondary)]">
              We sent a sign-in link to <strong>{email}</strong>. It expires in 30 minutes.
            </p>
          </div>
        ) : (
          /* ── Sign in form ──────────────────────────── */
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold leading-tight">Sign in to Scoop</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">No password. We email you a link.</p>
              </div>
            </div>

            <form onSubmit={handleRequest} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface2)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-brand-blue/40"
              />
              {err && <p className="text-[11px] text-red-500">{err}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 rounded-lg bg-brand-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                Send magic link
              </button>
            </form>

            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-3 text-center">
              Signing in syncs your saved articles across devices.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
