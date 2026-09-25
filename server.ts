import { Hono } from "hono";
import { join, normalize } from "node:path";
import { config } from "./src/config";
import { initDb } from "./src/db";
import { initPush } from "./src/push";
import { getSettings, publicSettings } from "./src/settings";
import { HttpError } from "./src/util";
import { isHttps, sessionsCleanup } from "./src/auth";
import { core } from "./src/routes/core";
import { master } from "./src/routes/master";
import { adminApi } from "./src/routes/admin";
import { calakanApi } from "./src/routes/calakan";

const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, "public");
const NM = join(ROOT, "node_modules");

const app = new Hono();

// ——— Keamanan dasar ———
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

app.use("*", async (c, next) => {
  const m = c.req.method;
  if (c.req.path.startsWith("/api/") && m !== "GET" && m !== "HEAD") {
    // Tolak permintaan lintas situs (CSRF)
    if (c.req.header("sec-fetch-site") === "cross-site") return c.json({ error: "Permintaan ditolak (lintas situs)." }, 403);
    const origin = c.req.header("origin");
    if (origin) {
      const host = (config.trustProxy && c.req.header("x-forwarded-host")) || c.req.header("host");
      let oh = "";
      try {
        oh = new URL(origin).host;
      } catch {}
      if (oh !== host) return c.json({ error: "Permintaan ditolak (origin tidak sah)." }, 403);
    }
  }
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("Referrer-Policy", "same-origin");
  c.header("Content-Security-Policy", CSP);
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  if (isHttps(c)) c.header("Strict-Transport-Security", "max-age=15552000");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
});

// ——— API ———
const api = new Hono();
api.route("/", core);
api.route("/", master);
api.route("/", adminApi);
api.route("/calakan", calakanApi);
api.all("*", (c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
app.route("/api", api);

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, ...(err.extra || {}) }, err.status as any);
  console.error("[error]", err);
  const msg = (err as any)?.code === "ECONNREFUSED" ? "Database tidak dapat dihubungi. Pastikan MySQL di XAMPP sudah berjalan." : "Terjadi kesalahan pada server.";
  return c.json({ error: msg }, 500);
});

// ——— Aset dinamis: favicon, ikon, manifest ———
function dataUrlResponse(dataUrl: string) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  return new Response(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300" } });
}

app.get("/favicon.ico", async () => {
  const s = await getSettings();
  return dataUrlResponse(s.favicon || s.logo || "") || new Response(Bun.file(join(PUBLIC, "img/icon.svg")), { headers: { "Content-Type": "image/svg+xml" } });
});
app.get("/logo", async () => {
  const s = await getSettings();
  return dataUrlResponse(s.logo || "") || new Response(Bun.file(join(PUBLIC, "img/icon.svg")), { headers: { "Content-Type": "image/svg+xml" } });
});
for (const [path, file] of [
  ["/icon-192.png", "img/icon-192.png"],
  ["/icon-512.png", "img/icon-512.png"],
  ["/apple-touch-icon.png", "img/icon-192.png"],
]) {
  app.get(path, async () => {
    const s = await getSettings();
    if (s.logo && /^data:image\/(png|jpeg|webp)/.test(s.logo)) return dataUrlResponse(s.logo)!;
    return new Response(Bun.file(join(PUBLIC, file)), { headers: { "Content-Type": "image/png" } });
  });
}
app.get("/manifest.webmanifest", async (c) => {
  const s = await publicSettings();
  return c.json(
    {
      name: `${s.app_name} – ${s.school_name}`,
      short_name: s.app_name,
      description: s.app_subtitle,
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f6f7f9",
      theme_color: s.primary_color,
      icons: [
        { src: `/icon-192.png?v=${s.version}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/icon-512.png?v=${s.version}`, sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    },
    200,
    { "Content-Type": "application/manifest+json" }
  );
});

// ——— Library pihak ketiga (dilayani lokal, tanpa internet) ———
const VENDOR: Record<string, string> = {
  "sweetalert2.min.js": "sweetalert2/dist/sweetalert2.all.min.js",
  "jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js",
  "jspdf.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js",
};
const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};
const typeOf = (p: string) => TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream";

async function sendFile(abs: string, base: string, cache = "no-cache") {
  const n = normalize(abs);
  if (!n.startsWith(base)) return null;
  const f = Bun.file(n);
  if (!(await f.exists())) return null;
  return new Response(f, { headers: { "Content-Type": typeOf(n), "Cache-Control": cache } });
}

app.get("/vendor/*", async (c) => {
  const rest = c.req.path.replace(/^\/vendor\//, "");
  const week = "public, max-age=604800";
  if (VENDOR[rest]) return (await sendFile(join(NM, VENDOR[rest]), NM, week)) || c.notFound();
  if (rest.startsWith("bootstrap-icons/")) {
    const base = join(NM, "bootstrap-icons/font");
    return (await sendFile(join(base, rest.slice(16)), base, week)) || c.notFound();
  }
  if (rest.startsWith("font/")) {
    const base = join(NM, "@fontsource/plus-jakarta-sans");
    return (await sendFile(join(base, rest.slice(5)), base, week)) || c.notFound();
  }
  return c.notFound();
});

// ——— Service worker harus di root agar cakupannya seluruh aplikasi ———
app.get("/sw.js", async () => {
  const r = await sendFile(join(PUBLIC, "sw.js"), PUBLIC);
  r!.headers.set("Service-Worker-Allowed", "/");
  return r!;
});

// ——— File statis + SPA ———
app.get("*", async (c) => {
  const p = decodeURIComponent(c.req.path);
  if (p !== "/" && p.includes(".")) {
    return (await sendFile(join(PUBLIC, p), PUBLIC)) || c.text("Tidak ditemukan", 404);
  }
  return (await sendFile(join(PUBLIC, "index.html"), PUBLIC))!;
});

// ——— Mulai ———
try {
  await initDb();
  await initPush();
} catch (e: any) {
  console.error("\n✖ Gagal terhubung ke database MySQL.");
  console.error("  Pastikan MySQL di XAMPP Control Panel sudah [Start] dan pengaturan .env benar.");
  console.error("  Detail:", e?.message || e, "\n");
  process.exit(1);
}

const server = Bun.serve({ port: config.port, fetch: app.fetch, maxRequestBodySize: 64 * 1024 * 1024 });
// Bersihkan sesi kedaluwarsa & catatan percobaan login lama setiap jam
setInterval(() => sessionsCleanup().catch((e) => console.warn("[cleanup]", e?.message || e)), 60 * 60_000);
const s = await getSettings();
console.log(`\n  ✔ ${s.app_name} berjalan di http://localhost:${server.port}\n`);
