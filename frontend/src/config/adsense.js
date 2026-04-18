const rawClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID?.trim() || "";
const rawPublisherId = import.meta.env.VITE_ADSENSE_PUBLISHER_ID?.trim() || "";
const testMode = String(import.meta.env.VITE_ADSENSE_TEST_MODE || "").toLowerCase() === "true";

function derivePublisherId(clientId) {
  if (!clientId) return "";
  if (clientId.startsWith("ca-pub-")) return clientId.replace(/^ca-/, "");
  if (clientId.startsWith("pub-")) return clientId;
  return "";
}

export const adsenseConfig = {
  clientId: rawClientId,
  publisherId: rawPublisherId || derivePublisherId(rawClientId),
  testMode,
  enabled: Boolean(rawClientId),
  slots: {
    banner: import.meta.env.VITE_ADSENSE_SLOT_BANNER?.trim() || "",
    sidebar: import.meta.env.VITE_ADSENSE_SLOT_SIDEBAR?.trim() || "",
    inline: import.meta.env.VITE_ADSENSE_SLOT_INLINE?.trim() || "",
  },
};

export function normalizeAdSenseConfig(config = {}) {
  const clientId = config.clientId?.trim() || "";
  const publisherId = config.publisherId?.trim() || derivePublisherId(clientId);
  return {
    enabled: config.enabled ?? Boolean(clientId),
    clientId,
    publisherId,
    testMode: Boolean(config.testMode),
    slots: {
      banner: config.slots?.banner?.trim() || "",
      sidebar: config.slots?.sidebar?.trim() || "",
      inline: config.slots?.inline?.trim() || "",
    },
  };
}

export function getAdSlot(slotName, config = adsenseConfig) {
  return config.slots[slotName] || "";
}
