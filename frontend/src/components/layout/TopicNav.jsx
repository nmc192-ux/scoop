import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useNewsStore } from "../../store/newsStore";
import { useTopics } from "../../hooks/useNews";
import clsx from "clsx";

const TOPIC_COLORS = {
  top: "#FF3B30",
  politics: "#007AFF",
  international: "#5856D6",
  pakistan: "#01411C",
  tech: "#0EA5E9",
  business: "#F59E0B",
  local: "#FF9500",
  sports: "#34C759",
  science: "#5AC8FA",
  medicine: "#FF2D55",
  health: "#4CD964",
  "public-health": "#FF6B35",
  "self-help": "#AF52DE",
  environment: "#30B0C7",
  weather: "#64D2FF",
  ai: "#007AFF",
  "computer-science": "#5856D6",
  "agentic-ai": "#FF3B30",
  publications: "#8B5CF6",
};

export default function TopicNav() {
  const { activeTopics, toggleTopic } = useNewsStore();
  const { data: topics = [] } = useTopics();
  const scrollRef = useRef(null);

  // Auto-scroll active topic into view
  useEffect(() => {
    if (scrollRef.current && activeTopics.length > 0) {
      const activeBtn = scrollRef.current.querySelector("[data-active='true']");
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [activeTopics]);

  return (
    <nav className="sticky top-14 sm:top-16 z-40 glass border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Scroll container with fade hint on right edge */}
        <div className="relative">
          <div
            ref={scrollRef}
            className="flex items-center gap-2 py-3 overflow-x-auto hide-scrollbar"
          >
          {topics.map((topic) => {
            const isActive = activeTopics.includes(topic.id);
            const color = TOPIC_COLORS[topic.id] || "#007AFF";

            return (
              <motion.button
                key={topic.id}
                data-active={isActive}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleTopic(topic.id)}
                className={clsx(
                  "topic-pill flex items-center gap-1.5",
                  isActive ? "topic-pill-active" : "topic-pill-inactive"
                )}
                style={isActive ? { backgroundColor: color } : {}}
                title={topic.count ? `${topic.count} articles` : undefined}
              >
                <span className="text-base leading-none">{topic.emoji}</span>
                <span>{topic.label}</span>
                {topic.count > 0 && (
                  <span
                    className={clsx(
                      "text-xs px-1.5 py-0.5 rounded-full font-semibold",
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-[var(--color-surface2)] text-[var(--color-text-tertiary)]"
                    )}
                  >
                    {topic.count > 999 ? "999+" : topic.count}
                  </span>
                )}
              </motion.button>
            );
          })}
          </div>
          {/* Right-edge fade — indicates more topics to scroll to */}
          <div
            className="pointer-events-none absolute right-0 top-0 h-full w-16"
            style={{
              background: "linear-gradient(to right, transparent, var(--color-bg))",
            }}
          />
        </div>

        {/* Multi-select hint */}
        {activeTopics.length > 1 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="pb-2 text-xs text-[var(--color-text-tertiary)] text-center"
          >
            📌 Showing {activeTopics.length} topics — tap a topic to deselect
          </motion.div>
        )}
      </div>
    </nav>
  );
}
