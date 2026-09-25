import { get, post } from "./api.js";

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

let reg = null;
export async function registerSW() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("Service worker gagal didaftarkan", e);
    return null;
  }
}

function urlB64ToUint8(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Status: 'unsupported' | 'ios-install' | 'denied' | 'granted' | 'default' */
export function pushState() {
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

/** Berlangganan (panggil dari klik pengguna) */
export async function enablePush() {
  if (!pushSupported()) throw new Error("Browser ini belum mendukung push notification.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Izin notifikasi ditolak. Aktifkan melalui pengaturan browser.");
  const r = reg || (await navigator.serviceWorker.ready);
  const { key } = await get("/push/key", { quiet: true });
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
  await post("/push/subscribe", { subscription: sub.toJSON() }, { quiet: true });
  return true;
}

/** Sinkron diam-diam bila izin sudah diberikan sebelumnya */
export async function syncPush() {
  try {
    if (pushState() !== "granted") return;
    await enablePush();
  } catch (e) {
    console.warn("sinkron push gagal", e);
  }
}

export async function disablePush() {
  const r = reg || (await navigator.serviceWorker.ready);
  const sub = await r.pushManager.getSubscription();
  if (sub) {
    await post("/push/unsubscribe", { endpoint: sub.endpoint }, { quiet: true });
    await sub.unsubscribe();
  }
}
