/**
 * SkimlinksLoader — drops the Skimlinks SDK (<script>) into the page once,
 * gated by the backend-provided publisher ID. Skimlinks then auto-wraps any
 * outbound shopping/travel link in article bodies with its affiliate redirect.
 *
 * Zero effect when publisherId is empty — we just render nothing.
 *
 * The SDK is loaded async so it doesn't block first paint. We only load it
 * after a small delay (idle) to avoid competing with critical fetches.
 */
import { useEffect } from "react";

const SCRIPT_ID = "scoop-skimlinks";

export default function SkimlinksLoader({ publisherId }) {
  useEffect(() => {
    if (!publisherId) return;
    if (typeof document === "undefined") return;
    if (document.getElementById(SCRIPT_ID)) return;

    const inject = () => {
      if (document.getElementById(SCRIPT_ID)) return;
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.async = true;
      // Skimlinks CDN pattern — publisher ID is the path segment.
      s.src = `https://s.skimresources.com/js/${encodeURIComponent(publisherId)}.skimlinks.js`;
      document.head.appendChild(s);
    };

    // Defer past first interaction / idle so we don't contend with hero load.
    const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 1500));
    const handle = ric(inject);
    return () => {
      if (window.cancelIdleCallback && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      }
    };
  }, [publisherId]);

  return null;
}
