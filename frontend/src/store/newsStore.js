import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isRtl } from "../lib/languages";

export const useNewsStore = create(
  persist(
    (set, get) => ({
      // ─── Theme ─────────────────────────────────────────────────────
      darkMode: window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
      toggleDarkMode: () => {
        const next = !get().darkMode;
        set({ darkMode: next });
        document.documentElement.classList.toggle("dark", next);
      },

      // ─── Language ───────────────────────────────────────────────────
      // `language` is the user's chosen target (ISO 639-1). When
      // `autoLanguage` is true, each article is shown in its source language
      // and this field holds the most-recent explicit choice (used as a
      // fallback for UI chrome).
      language: "en",
      autoLanguage: true,
      setLanguage: (lang) => {
        set({ language: lang });
        document.documentElement.setAttribute("lang", lang);
        document.documentElement.setAttribute("dir", isRtl(lang) ? "rtl" : "ltr");
      },
      setAutoLanguage: (v) => set({ autoLanguage: !!v }),

      // ─── Active Topics ─────────────────────────────────────────────
      activeTopics: ["top"],
      setActiveTopics: (topics) => set({ activeTopics: topics }),
      toggleTopic: (topicId) => {
        const current = get().activeTopics;
        if (topicId === "top" || topicId === "saved") { set({ activeTopics: [topicId] }); return; }
        if (current.includes(topicId)) {
          const next = current.filter(t => t !== topicId && t !== "top" && t !== "saved");
          set({ activeTopics: next.length ? next : ["top"] });
        } else {
          set({ activeTopics: [...current.filter(t => t !== "top" && t !== "saved"), topicId] });
        }
      },

      // ─── Search ────────────────────────────────────────────────────
      searchQuery: "",
      setSearchQuery: (q) => set({ searchQuery: q }),

      // ─── Reading list ──────────────────────────────────────────────
      savedArticles: [],
      saveArticle: (article) => {
        const saved = get().savedArticles;
        if (!saved.find(a => a.id === article.id)) {
          set({ savedArticles: [article, ...saved].slice(0, 50) });
        }
      },
      unsaveArticle: (id) => set({ savedArticles: get().savedArticles.filter(a => a.id !== id) }),
      isArticleSaved: (id) => get().savedArticles.some(a => a.id === id),

      // ─── View mode ─────────────────────────────────────────────────
      viewMode: "grid",
      setViewMode: (mode) => set({ viewMode: mode }),

      // ─── Video tab ─────────────────────────────────────────────────
      videoTab: "all",   // "all" | "shorts" | "tiktok" | "facebook"
      setVideoTab: (tab) => set({ videoTab: tab }),

      // ─── Followed YouTube Channels ─────────────────────────────────
      followedChannels: [],
      toggleFollowChannel: (name) => {
        const c = get().followedChannels;
        set({ followedChannels: c.includes(name) ? c.filter(x => x !== name) : [...c, name] });
      },
      isChannelFollowed: (name) => get().followedChannels.includes(name),

      // ─── Refresh ───────────────────────────────────────────────────
      lastRefreshed: null,
      setLastRefreshed: (time) => set({ lastRefreshed: time }),

      // ─── Personalization ────────────────────────────────────────────
      // Preferred topics (boost these in ranking)
      preferredTopics: [],
      togglePreferredTopic: (topicId) => {
        const cur = get().preferredTopics;
        set({
          preferredTopics: cur.includes(topicId)
            ? cur.filter((t) => t !== topicId)
            : [...cur, topicId],
        });
      },
      setPreferredTopics: (topics) => set({ preferredTopics: Array.isArray(topics) ? topics : [] }),

      // Muted / preferred sources (boost/penalize in ranking)
      mutedSources:     [],
      preferredSources: [],
      toggleMutedSource: (name) => {
        const cur = get().mutedSources;
        set({
          mutedSources: cur.includes(name)
            ? cur.filter((s) => s !== name)
            : [...cur, name],
        });
      },
      togglePreferredSource: (name) => {
        const cur = get().preferredSources;
        set({
          preferredSources: cur.includes(name)
            ? cur.filter((s) => s !== name)
            : [...cur, name],
        });
      },

      // Onboarding state
      onboardingComplete: false,
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding:   () => set({ onboardingComplete: false }),

      // Reader preferences
      readerPrefs: { fontIdx: 1, sepia: false },
      setReaderPrefs: (patch) => set({ readerPrefs: { ...get().readerPrefs, ...patch } }),
    }),
    {
      name: "khabari-store",
      partialize: (state) => ({
        darkMode:            state.darkMode,
        language:            state.language,
        autoLanguage:        state.autoLanguage,
        activeTopics:        state.activeTopics,
        savedArticles:       state.savedArticles,
        viewMode:            state.viewMode,
        followedChannels:    state.followedChannels,
        preferredTopics:     state.preferredTopics,
        mutedSources:        state.mutedSources,
        preferredSources:    state.preferredSources,
        onboardingComplete:  state.onboardingComplete,
        readerPrefs:         state.readerPrefs,
      }),
    }
  )
);

// Apply persisted settings on init
const { darkMode, language } = useNewsStore.getState();
document.documentElement.classList.toggle("dark", darkMode);
document.documentElement.setAttribute("lang",  language || "en");
document.documentElement.setAttribute("dir",   isRtl(language) ? "rtl" : "ltr");
