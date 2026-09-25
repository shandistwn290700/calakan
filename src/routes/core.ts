import { Hono } from "hono";
import { q, one, exec } from "../db";
import {
  requireAuth, createSession, destroySession, destroyOtherSessions, checkLoginRate, failLogin, okLogin, loadUser,
  clientIp, verifyDummy, isDefaultPassword, checkNewPassword, MAX_PASSWORD, type User,
} from "../auth";
import { publicSettings } from "../settings";
import { saveSubscription, removeSubscription, vapidPublicKey, notifyUsers } from "../push";
import { bad, HttpError, mondayOf, str } from "../util";

type Env = { Variables: { user: User } };
export const core = new Hono<Env>();

const body = async (c: any) => (await c.req.json().catch(() => ({}))) as any;

core.get("/public/settings", async (c) => c.json(await publicSettings()));

core.post("/auth/login", async (c) => {
  const b = await body(c);
  const username = str(b.username, 64);
  const password = typeof b.password === "string" ? b.password : "";
  if (!username || !password) throw bad("Username dan password wajib diisi.");
  if (password.length > MAX_PASSWORD) throw new HttpError(401, "Username atau password salah.");
  const ip = clientIp(c);
  checkLoginRate(ip, username);
  const u = await one<any>(`SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?`, [username]);
  let ok = false;
  if (u) ok = await Bun.password.verify(password, u.password_hash).catch(() => false);
  else await verifyDummy(password);
  if (!ok) {
    failLogin(ip, username);
    throw new HttpError(401, "Username atau password salah.");
  }
  if (!u.is_active) throw new HttpError(403, "Akun Anda dinonaktifkan. Hubungi admin sekolah.");
  okLogin(ip, username);
  // Password bawaan (NIS / admin123) wajib diganti; akun lama pun ikut terdeteksi saat login
  const mustChange = isDefaultPassword(password, u.username) ? 1 : undefined;
  await exec(`UPDATE users SET last_login = NOW()${mustChange ? ", must_change_pw = 1" : ""} WHERE id = ?`, [u.id]);
  await createSession(c, u.id);
  return c.json({ ok: true, role: u.role });
});

core.post("/auth/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

core.get("/auth/me", async (c) => {
  const u = await loadUser(c);
  if (!u) return c.json({ guest: true });
  const out: any = { id: u.id, username: u.username, name: u.name, role: u.role, must_change_password: !!u.must_change_pw };
  if (u.must_change_pw) {
    // Selama password belum diganti, hanya data minimum yang dikirim
    out.settings = await publicSettings();
    return c.json(out);
  }
  if (u.role === "ortu") {
    out.student = await one(
      `SELECT s.id, s.nis, s.name, s.gender, c.id AS class_id, c.tingkat, c.rombel, c.name AS class_name, w.name AS wali_name, w2.name AS wali2_name
         FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users w ON w.id = c.wali_id
         LEFT JOIN users w2 ON w2.id = c.wali2_id WHERE s.id = ?`,
      [u.student_id]
    );
  }
  if (u.role === "wali") {
    out.homeroom = await one(
      `SELECT id, tingkat, rombel, name, IF(wali_id = ?, 'utama', 'pendamping') AS as_role
         FROM classes WHERE wali_id = ? OR wali2_id = ? LIMIT 1`,
      [u.id, u.id, u.id]
    );
  }
  const n = await one<any>(`SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND is_read = 0`, [u.id]);
  out.unread = n?.n || 0;
  out.settings = await publicSettings();
  out.today_week = mondayOf();
  return c.json(out);
});

core.post("/auth/password", requireAuth(), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  const old = typeof b.old === "string" ? b.old : "";
  const nw = typeof b.new === "string" ? b.new : "";
  // Percobaan password lama ikut dibatasi agar sesi yang tercuri tidak bisa dipakai menebak password
  const ip = clientIp(c);
  checkLoginRate(ip, u.username);
  const row = await one<any>(`SELECT password_hash FROM users WHERE id = ?`, [u.id]);
  if (old.length > MAX_PASSWORD || !(await Bun.password.verify(old, row.password_hash).catch(() => false))) {
    failLogin(ip, u.username);
    throw bad("Password lama tidak sesuai.");
  }
  const err = checkNewPassword(nw, u.username);
  if (err) throw bad(err);
  if (nw === old) throw bad("Password baru harus berbeda dari password lama.");
  await exec(`UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?`, [await Bun.password.hash(nw), u.id]);
  await destroyOtherSessions(c, u.id);
  return c.json({ ok: true });
});

// ——— Dashboard ———
core.get("/dashboard", requireAuth(), async (c) => {
  const u = c.get("user");
  const week = mondayOf();
  if (u.role === "admin") {
    const cnt = async (sql: string, p: any[] = []) => ((await one<any>(sql, p))?.n as number) || 0;
    return c.json({
      week,
      stats: {
        kelas: await cnt(`SELECT COUNT(*) n FROM classes`),
        siswa: await cnt(`SELECT COUNT(*) n FROM students`),
        wali: await cnt(`SELECT COUNT(*) n FROM users WHERE role = 'wali'`),
        guru: await cnt(`SELECT COUNT(*) n FROM users WHERE role = 'guru'`),
        ortu: await cnt(`SELECT COUNT(*) n FROM users WHERE role = 'ortu'`),
        mapel: await cnt(`SELECT COUNT(*) n FROM subjects`),
        terbit: await cnt(`SELECT COUNT(*) n FROM calakan_weeks WHERE week_start = ? AND status = 'published'`, [week]),
        push: await cnt(`SELECT COUNT(DISTINCT user_id) n FROM push_subscriptions`),
      },
    });
  }
  return c.json({ week });
});

// ——— Notifikasi dalam aplikasi ———
core.get("/notifications", requireAuth(), async (c) => {
  const u = c.get("user");
  const rows = await q(`SELECT id, title, body, url, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`, [u.id]);
  return c.json(rows);
});

core.post("/notifications/read", requireAuth(), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  if (b.id) await exec(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [b.id, u.id]);
  else await exec(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`, [u.id]);
  return c.json({ ok: true });
});

// ——— Push notification ———
core.get("/push/key", requireAuth(), async (c) => c.json({ key: await vapidPublicKey() }));

core.post("/push/subscribe", requireAuth(), async (c) => {
  const b = await body(c);
  try {
    await saveSubscription(c.get("user").id, b.subscription, c.req.header("user-agent") || "");
  } catch (e: any) {
    throw bad(e.message);
  }
  return c.json({ ok: true });
});

core.post("/push/unsubscribe", requireAuth(), async (c) => {
  const b = await body(c);
  if (b.endpoint) await removeSubscription(String(b.endpoint));
  return c.json({ ok: true });
});

core.post("/push/test", requireAuth(), async (c) => {
  const u = c.get("user");
  const r = await notifyUsers([u.id], {
    title: "Tes Notifikasi ✅",
    body: "Notifikasi CALAKAN sudah aktif di perangkat ini.",
    url: "/#/notifikasi",
    tag: "test",
  });
  return c.json(r);
});
