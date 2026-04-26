/**
 * SponsorCard — native "Presented by" in-feed placement.
 *
 * Renders a single card styled to match NewsCard but clearly disclosed as
 * sponsored content. Driven entirely by env vars on the backend (SITE_SPONSOR_*),
 * exposed through /api/public-config → publicConfig.sponsor. When no sponsor
 * is configured, this component renders nothing.
 *
 * Click is tracked as `sponsor_click` with the sponsor name + url so we can
 * report performance to the advertiser without exposing GA to them.
 */
import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { track } from "../../lib/track";

export default function SponsorCard({ sponsor }) {
  if (!sponsor?.enabled || !sponsor.name || !sponsor.url) return null;

  const handleClick = () => {
    track("sponsor_click", {
      metadata: { sponsor: sponsor.name, url: sponsor.url },
    });
  };

  return (
    <motion.a
      href={sponsor.url}
      target="_blank"
      rel="noopener sponsored nofollow"
      onClick={handleClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card card-hover relative flex flex-col h-full overflow-hidden
                 border-2 border-amber-400/40 hover:border-amber-400/70
                 bg-gradient-to-br from-amber-50/60 to-orange-50/30
                 dark:from-amber-900/10 dark:to-orange-900/5"
      aria-label={`Sponsored: ${sponsor.name}`}
    >
      {/* "Presented by" disclosure — required for transparency */}
      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full
                      bg-amber-500/90 text-white text-[10px] font-bold uppercase
                      tracking-wider shadow-sm">
        Presented by {sponsor.name}
      </div>

      {sponsor.imageUrl && (
        <div className="aspect-video overflow-hidden bg-[var(--color-surface2)]">
          <img
            src={sponsor.imageUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-bold text-[var(--color-text)] text-base leading-snug mb-2 mt-2">
          {sponsor.name}
        </h3>
        {sponsor.tagline && (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-3 line-clamp-3">
            {sponsor.tagline}
          </p>
        )}
        <div className="mt-auto flex items-center gap-1.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
          {sponsor.cta || "Learn more"}
          <ExternalLink size={13} />
        </div>
      </div>
    </motion.a>
  );
}
