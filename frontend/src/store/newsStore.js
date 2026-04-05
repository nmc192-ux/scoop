import { create } from "zustand";
import { persist } from "zustand/middleware";

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

      // ─── Language: 'en' | 'ur' ────────────────────────────────────
      language: "en",
      setLanguage: (lang) => {
        set({ language: lang });
        document.documentElement.setAttribute("lang", lang);
        document.documentElement.setAttribute("dir", lang === "ur" ? "rtl" : "ltr");
      },

      // ─── Active Topics ─────────────────────────────────────────────
      activeTopics: ["top"],
      setActiveTopics: (topics) => set({ activeTopics: topics }),
      countryFocus: "pakistan",
      setCountryFocus: (country) => set({ countryFocus: country }),
      toggleTopic: (topicId) => {
        const current = get().activeTopics;
        if (topicId === "top") { set({ activeTopics: ["top"] }); return; }
        if (current.includes(topicId)) {
          const next = current.filter(t => t !== topicId && t !== "top");
          set({ activeTopics: next.length ? next : ["top"] });
        } else {
          set({ activeTopics: [...current.filter(t => t !== "top"), topicId] });
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
    }),
    {
      name: "khabari-store",
      partialize: (state) => ({
        darkMode:         state.darkMode,
        language:         state.language,
        activeTopics:     state.activeTopics,
        countryFocus:     state.countryFocus,
        savedArticles:    state.savedArticles,
        viewMode:         state.viewMode,
        followedChannels: state.followedChannels,
      }),
    }
  )
);

// Apply persisted settings on init
const { darkMode, language } = useNewsStore.getState();
document.documentElement.classList.toggle("dark", darkMode);
document.documentElement.setAttribute("lang",  language || "en");
document.documentElement.setAttribute("dir",   language === "ur" ? "rtl" : "ltr");
