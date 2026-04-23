import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { adsenseConfig, getAdSlot, normalizeAdSenseConfig } from "../../config/adsense";
import HousePromo from "./HousePromo";

function ensureScriptLoaded(clientId) {
  if (typeof document === "undefined") return null;

  const existing = document.querySelector('script[data-scoop-adsense="true"]');
  if (existing) return existing;

  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.dataset.scoopAdsense = "true";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  document.head.appendChild(script);
  return script;
}

/**
 * Engagement gate: only mount ads after the user has either scrolled 400px
 * or been on-page for 5s. Improves Google's viewability score and avoids
 * burning impressions on immediate bouncers. Module-global so the gate opens
 * once per session, not per-ad-instance.
 */
let gateOpen = false;
const gateSubscribers = new Set();
function initGate() {
  if (typeof window === "undefined" || gateOpen) return;
  const open = () => {
    if (gateOpen) return;
    gateOpen = true;
    gateSubscribers.forEach((fn) => fn());
    gateSubscribers.clear();
    window.removeEventListener("scroll", onScroll);
    clearTimeout(timer);
  };
  const onScroll = () => { if (window.scrollY > 400) open(); };
  window.addEventListener("scroll", onScroll, { passive: true });
  const timer = setTimeout(open, 5000);
}

function useEngagementGate() {
  const [ready, setReady] = useState(gateOpen);
  useEffect(() => {
    if (gateOpen) { setReady(true); return; }
    initGate();
    const fn = () => setReady(true);
    gateSubscribers.add(fn);
    return () => gateSubscribers.delete(fn);
  }, []);
  return ready;
}

/**
 * AdSenseUnit — renders a Google AdSense slot with ZERO visible footprint
 * until the ad is actually filled. The "Sponsored" chrome only appears
 * AFTER Google confirms the slot filled; otherwise the whole block
 * collapses (returns nothing). This eliminates the empty-labeled-box
 * problem that's common while an AdSense site is still under review.
 *
 * Implementation note: the <ins> element stays mounted once the gate opens,
 * so adsbygoogle has a stable node to render into. We toggle the wrapping
 * chrome via CSS (visible only on `filled`), not by remounting the <ins>.
 */
export function AdSenseUnit({
  slotName,
  config,
  className,
  label = "Advertisement",
  format = "auto",
  layout = undefined,
  style = {},
  minHeight = 0,
  houseFallback = false,
  houseVariant = "card",
}) {
  const adRef = useRef(null);
  const resolvedConfig = useMemo(() => normalizeAdSenseConfig(config || adsenseConfig), [config]);
  const slot = useMemo(() => getAdSlot(slotName, resolvedConfig), [slotName, resolvedConfig]);
  const [status, setStatus] = useState("pending"); // pending | filled | unfilled | disabled
  const gateReady = useEngagementGate();

  const enabled = resolvedConfig.enabled && !!resolvedConfig.clientId && !!slot;

  useEffect(() => {
    if (!enabled) { setStatus("disabled"); return; }
    if (!gateReady) return;
    if (!adRef.current) return;

    ensureScriptLoaded(resolvedConfig.clientId);

    const el = adRef.current;
    const schedulePush = () => {
      if (!window.adsbygoogle) return;
      if (el.dataset.scoopAdsenseRendered === "true") return;
      el.dataset.scoopAdsenseRendered = "true";
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch {}
    };

    if (window.adsbygoogle) schedulePush();
    else {
      const script = ensureScriptLoaded(resolvedConfig.clientId);
      const onLoad = () => schedulePush();
      script?.addEventListener("load", onLoad, { once: true });
    }

    // Poll data-ad-status. 3s cap — Google fills in <1s when it's going to fill;
    // waiting longer just leaves a dead frame on screen.
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const s = el.getAttribute("data-ad-status");
      const rect = el.getBoundingClientRect?.();
      if (s === "filled" || (rect && rect.height > 30 && el.childNodes.length > 0)) {
        setStatus("filled");
        clearInterval(poll);
      } else if (s === "unfilled" || attempts >= 6) { // 6 * 500ms = 3s
        setStatus("unfilled");
        clearInterval(poll);
      }
    }, 500);

    return () => clearInterval(poll);
  }, [slot, resolvedConfig, enabled, gateReady]);

  // Not enabled or gate not open yet → render nothing (or a newsletter promo
  // if the caller explicitly asked for one).
  if (!enabled || !gateReady) {
    if (houseFallback && !enabled) {
      return <HousePromo minHeight={minHeight} variant={houseVariant} />;
    }
    return null;
  }

  // Unfilled / disabled → collapse completely.
  if (status === "unfilled" || status === "disabled") {
    return houseFallback
      ? <HousePromo minHeight={minHeight} variant={houseVariant} />
      : null;
  }

  // Pending or filled: the <ins> must be mounted so adsbygoogle can render
  // into it. We only show the "Sponsored" chrome after status flips to filled;
  // during `pending` the wrapper is invisible (no border, no label, no minHeight)
  // so if it stays unfilled the user never sees an empty labeled box.
  const showChrome = status === "filled";

  return (
    <div
      className={clsx(
        showChrome
          ? "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden"
          : "",
        className,
      )}
    >
      {showChrome && (
        <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface2)]/60">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
            {label}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)]">Sponsored</span>
        </div>
      )}
      <div className={showChrome ? "p-3" : ""}>
        <ins
          ref={adRef}
          className="adsbygoogle block"
          style={{
            display: "block",
            minHeight: showChrome ? minHeight : 0,
            ...style,
          }}
          data-ad-client={resolvedConfig.clientId}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive="true"
          data-adtest={resolvedConfig.testMode ? "on" : undefined}
          {...(layout ? { "data-ad-layout": layout } : {})}
        />
      </div>
    </div>
  );
}

export function AdSenseBanner(props) {
  return <AdSenseUnit {...props} minHeight={90} />;
}

export function AdSenseSidebar(props) {
  return <AdSenseUnit {...props} minHeight={250} />;
}
