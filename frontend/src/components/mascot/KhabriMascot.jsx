import { motion } from "framer-motion";
import clsx from "clsx";

/**
 * Scout — the SCOOP mascot
 * A scrappy basset hound journalist with a press hat & magnifying glass
 * Sizes: sm (32) | md (48) | lg (80) | xl (120) | hero (200)
 */
export default function ScoopMascot({ size = "md", className = "", animated = true, mood = "happy" }) {
  const sizes = { sm: 32, md: 48, lg: 80, xl: 120, hero: 200 };
  const px = sizes[size] || sizes.md;
  const h  = Math.round(px * 120 / 100);

  const Wrapper = animated ? motion.div : "div";
  const wrapperProps = animated
    ? { animate: { y: [0, -4, 0] }, transition: { duration: 3.5, repeat: Infinity, ease: "easeInOut" } }
    : {};

  return (
    <Wrapper {...wrapperProps} className={clsx("inline-flex items-center justify-center select-none", className)}>
      <svg width={px} height={h} viewBox="0 0 100 120" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-label="Scout, the Scoop mascot">

        {/* ── Shadow ──────────────────────────────────────── */}
        <ellipse cx="50" cy="118" rx="24" ry="4" fill="black" fillOpacity="0.1" />

        {/* ── Left ear (long droopy) ──────────────────────── */}
        <path d="M26,24 Q13,50 11,82 Q9,104 18,112 Q24,116 30,110 Q36,104 36,82 Q37,50 32,24Z"
              fill="#7A4218" />
        <path d="M28,26 Q17,52 16,80 Q15,100 21,108 Q24,110 28,106 Q31,102 31,80 Q32,52 30,26Z"
              fill="#A06030" fillOpacity="0.45" />

        {/* ── Right ear ──────────────────────────────────── */}
        <path d="M74,24 Q87,50 89,82 Q91,104 82,112 Q76,116 70,110 Q64,104 64,82 Q63,50 68,24Z"
              fill="#7A4218" />
        <path d="M72,26 Q83,52 84,80 Q85,100 79,108 Q76,110 72,106 Q69,102 69,80 Q68,52 70,26Z"
              fill="#A06030" fillOpacity="0.45" />

        {/* ── Body ────────────────────────────────────────── */}
        <ellipse cx="50" cy="92" rx="27" ry="21" fill="#F5E0B8" />
        <ellipse cx="50" cy="94" rx="19" ry="13" fill="#EDD9A8" fillOpacity="0.5" />

        {/* ── Paws ────────────────────────────────────────── */}
        <rect x="28" y="109" width="15" height="9" rx="4.5" fill="#F5E0B8" stroke="#7A4218" strokeWidth="0.8" />
        <rect x="57" y="109" width="15" height="9" rx="4.5" fill="#F5E0B8" stroke="#7A4218" strokeWidth="0.8" />
        {/* Toe lines */}
        <path d="M30,118 Q32,115 34,118 Q36,115 38,118" stroke="#7A4218" strokeWidth="0.7" fill="none" strokeLinecap="round" />
        <path d="M59,118 Q61,115 63,118 Q65,115 67,118" stroke="#7A4218" strokeWidth="0.7" fill="none" strokeLinecap="round" />

        {/* ── Magnifying glass (right paw) ──────────────── */}
        <circle cx="74" cy="104" r="6" fill="none" stroke="#7A4218" strokeWidth="2" />
        <circle cx="74" cy="104" r="4.5" fill="#B3D4E8" fillOpacity="0.4" />
        <line x1="78.5" y1="108.5" x2="83" y2="113" stroke="#7A4218" strokeWidth="2.5" strokeLinecap="round" />

        {/* ── SCOOP press badge on chest ────────────────── */}
        <rect x="33" y="79" width="34" height="17" rx="3" fill="white" fillOpacity="0.97" />
        <rect x="33" y="79" width="34" height="17" rx="3" stroke="#E53E3E" strokeWidth="1.5" />
        <text x="50" y="89.5" textAnchor="middle" fontSize="6.5" fontWeight="900"
              fill="#E53E3E" fontFamily="system-ui, -apple-system, sans-serif">SCOOP</text>
        <text x="50" y="94" textAnchor="middle" fontSize="3.5"
              fill="#999" fontFamily="system-ui, sans-serif">press</text>

        {/* ── Head ────────────────────────────────────────── */}
        <circle cx="50" cy="42" r="30" fill="#F5E0B8" />

        {/* ── Press hat ───────────────────────────────────── */}
        <rect x="28" y="8" width="44" height="18" rx="5" fill="#111111" />
        <rect x="24" y="23" width="52" height="6" rx="3" fill="#1A1A1A" />
        {/* Badge */}
        <rect x="31" y="9" width="38" height="16" rx="3" fill="#DC2626" />
        <text x="50" y="20" textAnchor="middle" fontSize="7.5" fontWeight="900"
              fill="white" fontFamily="system-ui, -apple-system, sans-serif">PRESS</text>

        {/* ── Worried brows (classic basset) ──────────────── */}
        <path d="M30,33 Q37,29 44,33" fill="none" stroke="#7A4218" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M56,33 Q63,29 70,33" fill="none" stroke="#7A4218" strokeWidth="2.2" strokeLinecap="round" />

        {/* ── Left eye ────────────────────────────────────── */}
        <circle cx="38" cy="43" r="8.5" fill="white" />
        <circle cx="38" cy="44" r="6" fill="#2C1810" />
        <circle cx="36.5" cy="42" r="2.2" fill="white" />
        <circle cx="36.5" cy="42" r="1.1" fill="white" fillOpacity="0.8" />
        {/* Droopy lower lid */}
        <path d="M29,49 Q38,54 47,49" fill="none" stroke="#7A4218" strokeWidth="1.2"
              strokeLinecap="round" strokeOpacity="0.65" />

        {/* ── Right eye ───────────────────────────────────── */}
        <circle cx="62" cy="43" r="8.5" fill="white" />
        <circle cx="62" cy="44" r="6" fill="#2C1810" />
        <circle cx="60.5" cy="42" r="2.2" fill="white" />
        <circle cx="60.5" cy="42" r="1.1" fill="white" fillOpacity="0.8" />
        <path d="M53,49 Q62,54 71,49" fill="none" stroke="#7A4218" strokeWidth="1.2"
              strokeLinecap="round" strokeOpacity="0.65" />

        {/* ── Muzzle / snout ──────────────────────────────── */}
        <ellipse cx="50" cy="57" rx="14" ry="10.5" fill="#EDD9A8" />

        {/* ── Nose ────────────────────────────────────────── */}
        <ellipse cx="50" cy="52" rx="7" ry="5.5" fill="#1A1A1A" />
        <ellipse cx="48" cy="50.5" rx="2.8" ry="2" fill="white" fillOpacity="0.35" />

        {/* ── Mouth ───────────────────────────────────────── */}
        {(mood === "happy") && (
          <path d="M41,62 Q50,68 59,62" fill="none" stroke="#7A4218" strokeWidth="1.8" strokeLinecap="round" />
        )}
        {(mood === "reading") && (
          <path d="M43,62 Q50,65 57,62" fill="none" stroke="#7A4218" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    </Wrapper>
  );
}

// Backward-compat alias
export const KhabriMascot = ScoopMascot;

/** ─── Compact header logo mark — magnifying glass badge ─────────────────── */
export function ScoopLogo({ size = 32, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none"
         xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Scoop">

      {/* ── Dark badge ──────────────────────────────────────── */}
      <rect width="40" height="40" rx="9" fill="#1C1C1E" />
      <rect x="0.5" y="0.5" width="39" height="39" rx="8.5"
            fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="1" />

      {/* ── Lens circle ─────────────────────────────────────── */}
      <circle cx="16.5" cy="16.5" r="9.5"
              stroke="white" strokeWidth="3"
              fill="white" fillOpacity="0.07" />

      {/* ── Glass highlight ─────────────────────────────────── */}
      <circle cx="12.5" cy="12.5" r="2.5" fill="white" fillOpacity="0.28" />

      {/* ── Handle — brand red, 45° toward lower-right corner ── */}
      <line x1="23.5" y1="23.5" x2="33" y2="33"
            stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Backward-compat alias
export const KhabriLogo = ScoopLogo;
