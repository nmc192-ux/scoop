import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// List of all tracked live events (card index for the Live tab).
export function useLiveEvents() {
  return useQuery({
    queryKey: ["live-events"],
    queryFn: async () => {
      const { data } = await api.get("/live-events");
      return data.data || [];
    },
    staleTime: 2 * 60 * 1000,     // 2 min
    refetchInterval: 5 * 60 * 1000, // 5 min — these change slowly
  });
}

// Full dossier for one event (timestamped brief + live metrics).
export function useEventDossier(id) {
  return useQuery({
    queryKey: ["live-event", id],
    queryFn: async () => {
      const { data } = await api.get(`/live-events/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000, // 3 min — crude oil tile benefits from being fresh
  });
}
