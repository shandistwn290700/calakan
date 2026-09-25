import webpush from "web-push";
import { q, exec } from "./db";
import { getSettings, setSetting } from "./settings";
import { config } from "./config";

let ready = false;

export async function initPush() {
  const s = await getSettings();
  let pub = s.vapid_public;
  let priv = s.vapid_private;
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    pub = keys.publicKey;
    priv = keys.privateKey;
    await setSetting("vapid_public", pub);
    await setSetting("vapid_private", priv);
  }
  webpush.setVapidDetails(config.vapidSubject, pub, priv);
  ready = true;
}

export async function vapidPublicKey() {
  const s = await getSettings();
  return s.vapid_public;
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveSubscription(userId: number, sub: any, ua: string) {
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const auth = String(sub?.keys?.auth || "");
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) throw new Error("Data langganan notifikasi tidak valid.");
  const h = await sha256(endpoint);
  await exec(
    `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [userId, h, endpoint, p256dh, auth, ua.slice(0, 250)]
  );
}

export async function removeSubscription(endpoint: string) {
  await exec(`DELETE FROM push_subscriptions WHERE endpoint_hash = ?`, [await sha256(endpoint)]);
}

type Payload = { title: string; body: string; url?: string; tag?: string };

/** Simpan notifikasi di aplikasi + kirim push ke semua perangkat pengguna */
export async function notifyUsers(userIds: number[], p: Payload) {
  if (!userIds.length) return { saved: 0, sent: 0, failed: 0 };
  for (const uid of userIds) {
    await exec(`INSERT INTO notifications (user_id, title, body, url) VALUES (?, ?, ?, ?)`, [uid, p.title, p.body, p.url || "#/"]);
  }
  if (!ready) return { saved: userIds.length, sent: 0, failed: 0 };

  const subs = await q<any>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    userIds
  );
  const s = await getSettings();
  const payload = JSON.stringify({
    title: p.title,
    body: p.body,
    url: p.url || "/",
    tag: p.tag || "calakan",
    icon: "/icon-192.png?v=" + (s.asset_version || "1"),
  });
  let sent = 0,
    failed = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
          TTL: 60 * 60 * 24 * 3,
        });
        sent++;
      } catch (e: any) {
        failed++;
        // Langganan kedaluwarsa / dicabut → hapus
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await exec(`DELETE FROM push_subscriptions WHERE id = ?`, [sub.id]);
        } else {
          console.warn("[push] gagal:", e?.statusCode || "", e?.body || e?.message);
        }
      }
    })
  );
  return { saved: userIds.length, sent, failed };
}
