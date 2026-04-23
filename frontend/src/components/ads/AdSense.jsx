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
 * AdSenseUnit renders a Google AdSense slot AND auto-collapses to a
 * house-promo / nothing when the slot is unfilled, so users never see
 * empty grey boxes.
 *
 * Strategy:
 *   1. Render the <ins> AdSense tag as usual.
 *   2. After ~2.5s, check data-ad-status on the <ins> element:
 *        "filled"   → keep showing the ad
 *        "unfilled" → swap in a <HousePromo> (or null if houseFallback={false})
 *        anything else → wait another 2s, then give up and show HousePromo
 *   3. Respect minHeight so no layout shift during the swap.
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
  houseFallback = true,
  houseVariant = "card",
}) {
  const adRef = useRef(null);
  const resolvedConfig = useMemo(() => normalizeAdSenseConfig(config || adsenseConfig), [config]);
  const slot = useMemo(() => getAdSlot(slotName, resolvedConfig), [slotName, resolvedConfig]);
  const [status, setStatus] = useState("pending"); // pending | filled | unfilled | disabled

  const enabled = resolvedConfig.enabled && !!resolvedConfig.clientId && !!slot;

  useEffect(() => {
    if (!enabled) { setStatus("disabled"); return; }
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

    // Poll data-ad-status; give AdSense up to ~6s to fill before we give up
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      const s = el.getAttribute("data-ad-status");
      const rect = el.getBoundingClientRect?.();
      if (s === "filled" || (rect && rect.height > 30 && el.childNodes.length > 0)) {
        setStatus("filled");
        clearInterval(poll);
      } else if (s === "unfilled" || attempts >= 12) { // 12 * 500ms = 6s
        setStatus("unfilled");
        clearInterval(poll);
      }
    }, 500);

    return () => clearInterval(poll);
  }, [slot, resolvedConfig, enabled]);

  // Disabled (no config / no slot) → render house promo (or nothing)
  if (!enabled) {
    return houseFallback
      ? <HousePromo minHeight={minHeight} variant={houseVariant} />
      : null;
  }

  // Unfilled → replace with house promo
  if (status === "unfilled" && houseFallback) {
    return <HousePromo minHeight={minHeight} variant={houseVariant} />;
  }
  if (status === "unfilled") {
    return null; // collapse completely
  }

  return (
    <div className={clsx("rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden", className)}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface2)]/60">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
          {label}
        </span>
        <span className="text-[10px] text-[var(--color-text-tertiary)]">Sponsored</span>
      </div>
      <div className="p-3">
        <ins
          ref={adRef}
          className="adsbygoogle block"
          style={{ display: "block", minHeight, ...style }}
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
