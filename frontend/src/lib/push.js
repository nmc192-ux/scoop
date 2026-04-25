/**
 * Web Push helpers — encapsulates browser permission flow + service-worker
 * subscription handoff to the backend. Components import from here so they
 * never have to touch PushManager directly.
 */
import { track } from "./track";

const STORAGE = {
  declined: "scoop.push.declinedAt",
  subscribed: "scoop.push.subscribedAt",
  promptShownAt: "scoop.push.promptShownAt",
};
const DECLINE_COOLDOWN_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function currentPermission() {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export function isDeclinedRecently() {
  try {
    const at = Number(localStorage.getItem(STORAGE.declined)) || 0;
    return at && Date.now() - at < DECLINE_COOLDOWN_MS;
  } catch { return false; }
}

export function markDeclined() {
  try { localStorage.setItem(STORAGE.declined, String(Date.now())); } catch {}
}

export function markSubscribed() {
  try { localStorage.setItem(STORAGE.subscribed, String(Date.now())); } catch {}
}

export function isAlreadySubscribed() {
  try { return Boolean(localStorage.getItem(STORAGE.subscribed)); } catch { return false; }
}

// VAPID public key arrives as a base64url string; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function getRegistration() {
  if (!("serviceWorker" in navigator)) throw new Error("no service worker");
  // Wait for an active registration; in dev/SSR there may be none.
  const reg = await navigator.serviceWorker.ready;
  return reg;
}

export async function subscribeToPush({ topics = [], language = "en" } = {}) {
  if (!isPushSupported()) throw new Error("push not supported in this browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    markDeclined();
    track("push_permission_denied", { metadata: { permission } });
    return { ok: false, permission };
  }

  const reg = await getRegistration();

  // Reuse an existing subscription if present — no need to create a new one.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyResp = await fetch("/api/push/public-key").then((r) => r.json());
    if (!keyResp.ok || !keyResp.publicKey) throw new Error("vapid key unavailable");
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyResp.publicKey),
    });
  }

  const json = sub.toJSON();
  const body = {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    topics,
    language,
  };

  const resp = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch((e) => ({ ok: false, error: e.message }));

  if (resp.ok) {
    markSubscribed();
    track("push_subscribe_complete", { metadata: { topics } });
  } else {
    track("push_subscribe_failed", { metadata: { error: resp.error || "unknown" } });
  }
  return { ok: !!resp.ok, permission, subscription: sub };
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return { ok: false };
  const reg = await getRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await fetch("/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
  try { localStorage.removeItem(STORAGE.subscribed); } catch {}
  track("push_unsubscribe", {});
  return { ok: true };
}

export function noteOptInPromptShown(reason) {
  try { localStorage.setItem(STORAGE.promptShownAt, String(Date.now())); } catch {}
  track("push_optin_prompt_shown", { metadata: { reason } });
}
