import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useNewsStore } from "../store/newsStore";

const api = axios.create({ baseURL: "/api" });

// ─── Fetch Functions ──────────────────────────────────────────────────────

async function fetchNews({ category, limit = 60, offset = 0, search }) {
  const params = { limit, offset };
  if (category && !["top", "all"].includes(category)) params.category = category;
  if (search) params.search = search;

  const { data } = await api.get("/news", { params });
  return data.data || [];
}

async function fetchFeatured(limit = 7) {
  const { data } = await api.get("/news/featured", { params: { limit } });
  return data.data || [];
}

async function fetchTopics() {
  const { data } = await api.get("/news/topics");
  return data.data || [];
}

async function fetchStats() {
  const { data } = await api.get("/news/stats");
  return data.data || {};
}

async function fetchHealth() {
  const { data } = await api.get("/health");
  return data;
}

async function fetchPublicConfig() {
  const { data } = await api.get("/public-config");
  return data || {};
}

// ─── Hooks ────────────────────────────────────────────────────────────────

export function useNews() {
  const { activeTopics, searchQuery } = useNewsStore();
  const category = activeTopics.includes("top") ? null : activeTopics[0];

  return useQuery({
    queryKey: ["news", activeTopics, searchQuery],
    queryFn: () => fetchNews({ category, search: searchQuery || null }),
    staleTime: 3 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useFeatured() {
  return useQuery({
    queryKey: ["featured"],
    queryFn: () => fetchFeatured(7),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}

export function useTopics() {
  return useQuery({
    queryKey: ["topics"],
    queryFn: fetchTopics,
    staleTime: 10 * 60 * 1000,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  });
}

export function usePublicConfig() {
  return useQuery({
    queryKey: ["public-config"],
    queryFn: fetchPublicConfig,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useRefresh() {
  const queryClient = useQueryClient();
  const setLastRefreshed = useNewsStore(s => s.setLastRefreshed);

  return async () => {
    try {
      await api.post("/news/refresh");
      setTimeout(() => {
        queryClient.invalidateQueries();
        setLastRefreshed(new Date().toISOString());
      }, 3000); // wait 3s for backend to start fetching
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  };
}
