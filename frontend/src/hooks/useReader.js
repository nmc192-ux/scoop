import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

/**
 * Tiny zustand store for the in-app reader modal.
 * Any component can call openReader(article) to launch the distraction-free view.
 */
export const useReaderStore = create((set) => ({
  article: null,           // { title, url, image_url, source_name, ... } or null
  open: false,
  openReader: (article) => set({ article, open: true }),
  closeReader:        () => set({ open: false }),
}));

/**
 * Fetch server-side extracted article HTML (Readability). Only runs when
 * an article URL is provided — the component gates rendering on `enabled`.
 */
export function useReaderArticle(url) {
  return useQuery({
    queryKey: ["reader", url],
    enabled: !!url,
    staleTime: 10 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await api.get("/reader", { params: { url } });
      if (!data?.success) throw new Error(data?.error || "Extraction failed");
      return data.data;
    },
  });
}
