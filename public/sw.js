/* Service worker CALAKAN: push notification + fallback offline sederhana */
const CACHE = "calakan-shell-v4";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/css/app.css?v=4", "/icon-192.png"]).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Navigasi: coba jaringan dulu, bila offline pakai cache
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  e.respondWith(fetch(req).catch(() => caches.match("/")));
});

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "CALAKAN", body: e.data ? e.data.text() : "" };
  }
  const title = d.title || "CALAKAN";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || "",
      icon: d.icon || "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag || "calakan",
      renotify: true,
      data: { url: d.url || "/" },
      vibrate: [80, 40, 80],
    })
  );
  // beri tahu tab yang terbuka agar memperbarui lonceng notifikasi
  self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ type: "push", data: d })));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if (new URL(c.url).origin === self.location.origin) {
          c.focus();
          return c.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
