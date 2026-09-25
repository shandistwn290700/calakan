import type { Context, Next } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { getConnInfo } from "hono/bun";
import { q, one, exec } from "./db";
import { config } from "./config";
import { HttpError } from "./util";

export type Role = "admin" | "wali" | "guru" | "ortu";
export type User = {
  id: number;
  username: string;
  name: string;
  role: Role;
  student_id: number | null;
  is_active: number;
  must_change_pw: number;
};

export const COOKIE = "calakan_sid";
export const DEFAULT_ADMIN_PASSWORD = "admin123";
/** Batas panjang password agar hashing tidak bisa dipakai untuk membebani server */
export const MAX_PASSWORD = 128;

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Token disimpan di database dalam bentuk hash, sehingga isi tabel sessions tidak bisa dipakai untuk masuk */
function hashToken(token: string) {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

/** HTTPS langsung, atau lewat proxy tepercaya (TRUST_PROXY=1) */
export function isHttps(c: Context) {
  if (new URL(c.req.url).protocol === "https:") return true;
  return config.trustProxy && (c.req.header("x-forwarded-proto") || "").split(",")[0].trim() === "https";
}

/**
 * IP klien. Header X-Forwarded-For hanya dipercaya bila TRUST_PROXY=1.
 * Diambil entri PALING KANAN (ditambahkan proxy tepercaya); entri kiri bisa dikirim sendiri oleh klien.
 */
export function clientIp(c: Context) {
  if (config.trustProxy) {
    const xff = (c.req.header("x-forwarded-for") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  try {
    return getConnInfo(c).remote.address || "unknown";
  } catch {
    return "unknown";
  }
}

export async function createSession(c: Context, userId: number) {
  const token = randomToken();
  await exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`, [
    hashToken(token),
    userId,
    config.sessionDays,
  ]);
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttps(c),
    path: "/",
    maxAge: config.sessionDays * 86400,
  });
}

export async function destroySession(c: Context) {
  const token = getCookie(c, COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) await exec(`DELETE FROM sessions WHERE token = ?`, [hashToken(token)]);
  deleteCookie(c, COOKIE, { path: "/" });
}

/** Keluarkan pengguna dari semua perangkat lain (sesi saat ini dipertahankan) */
export async function destroyOtherSessions(c: Context, userId: number) {
  const token = getCookie(c, COOKIE);
  await exec(`DELETE FROM sessions WHERE user_id = ? AND token <> ?`, [userId, token ? hashToken(token) : ""]);
}

export async function loadUser(c: Context): Promise<User | null> {
  const cached = c.get("user") as User | undefined;
  if (cached) return cached;
  const token = getCookie(c, COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const u = await one<User>(
    `SELECT u.id, u.username, u.name, u.role, u.student_id, u.is_active, u.must_change_pw
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = 1`,
    [hashToken(token)]
  );
  if (u) c.set("user", u);
  return u;
}

/** Endpoint yang tetap boleh dipakai saat pengguna wajib mengganti password */
const PW_CHANGE_ALLOWED = new Set(["/api/auth/password"]);

/** Middleware: wajib login. Pilihan: batasi peran tertentu */
export function requireAuth(...roles: Role[]) {
  return async (c: Context, next: Next) => {
    const user = await loadUser(c);
    if (!user) throw new HttpError(401, "Sesi Anda telah berakhir. Silakan masuk kembali.");
    if (user.must_change_pw && !PW_CHANGE_ALLOWED.has(c.req.path))
      throw new HttpError(403, "Anda wajib mengganti password terlebih dahulu.", { code: "must_change_password" });
    if (roles.length && !roles.includes(user.role)) throw new HttpError(403, "Anda tidak memiliki akses ke fitur ini.");
    await next();
  };
}

/** Password dianggap bawaan bila sama dengan username (mis. NIS) atau password admin awal */
export function isDefaultPassword(password: string, username: string) {
  return password === DEFAULT_ADMIN_PASSWORD || password.toLowerCase() === username.toLowerCase();
}

/** Aturan password yang dipilih sendiri oleh pengguna */
export function checkNewPassword(pw: string, username: string) {
  if (pw.length < 8) return "Password baru minimal 8 karakter.";
  if (pw.length > MAX_PASSWORD) return `Password maksimal ${MAX_PASSWORD} karakter.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password baru harus mengandung huruf dan angka.";
  if (isDefaultPassword(pw, username)) return "Password baru tidak boleh sama dengan username atau password bawaan.";
  return null;
}

/** Aturan password yang disetel admin untuk orang lain (boleh sederhana, mis. NIS, karena wajib diganti) */
export function adminPasswordError(pw: string) {
  if (pw.length < 6) return "Password minimal 6 karakter.";
  if (pw.length > MAX_PASSWORD) return `Password maksimal ${MAX_PASSWORD} karakter.`;
  return null;
}

// ——— Pembatas percobaan login ———
// Tiga lapis: per IP+username, per username (serangan dari banyak IP), dan per IP (menebak banyak akun).
const WINDOW = 15 * 60_000;
const LIMITS = { pair: 5, user: 10, ip: 30 };
type Bucket = { n: number; until: number };
const attempts = new Map<string, Bucket>();

function keysFor(ip: string, username: string) {
  const u = username.toLowerCase();
  return { pair: `p|${ip}|${u}`, user: `u|${u}`, ip: `i|${ip}` } as const;
}

export function checkLoginRate(ip: string, username: string) {
  const now = Date.now();
  const k = keysFor(ip, username);
  for (const kind of ["pair", "user", "ip"] as const) {
    const a = attempts.get(k[kind]);
    if (a && a.until > now && a.n >= LIMITS[kind]) {
      const menit = Math.ceil((a.until - now) / 60000);
      throw new HttpError(429, `Terlalu banyak percobaan gagal. Coba lagi dalam ${menit} menit.`);
    }
  }
}

export function failLogin(ip: string, username: string) {
  const now = Date.now();
  const k = keysFor(ip, username);
  for (const kind of ["pair", "user", "ip"] as const) {
    const a = attempts.get(k[kind]);
    if (!a || a.until < now) attempts.set(k[kind], { n: 1, until: now + WINDOW });
    else {
      a.n++;
      // setiap kegagalan setelah terkunci memperpanjang masa kunci
      if (a.n >= LIMITS[kind]) a.until = now + WINDOW;
    }
  }
}

export function okLogin(ip: string, username: string) {
  const k = keysFor(ip, username);
  attempts.delete(k.pair);
  attempts.delete(k.user);
}

/** Hash tiruan agar waktu respons sama walau username tidak ada (mencegah menebak username) */
let dummyHash: Promise<string> | null = null;
export async function verifyDummy(password: string) {
  dummyHash ??= Bun.password.hash("calakan-dummy-password");
  await Bun.password.verify(password, await dummyHash).catch(() => false);
}

export async function sessionsCleanup() {
  await q(`DELETE FROM sessions WHERE expires_at < NOW()`);
  const now = Date.now();
  for (const [k, a] of attempts) if (a.until < now) attempts.delete(k);
}
