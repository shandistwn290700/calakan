import { Hono } from "hono";
import { q, one, exec, tx, ALL_TABLES } from "../db";
import { requireAuth, adminPasswordError, clientIp, checkLoginRate, failLogin, MAX_PASSWORD, type User } from "../auth";
import { sealJson, openJson } from "../crypto";
import { getSettings, setSetting, clearSettingsCache } from "../settings";
import { initPush } from "../push";
import { bad, int, str, toYMD } from "../util";

type Env = { Variables: { user: User } };
export const adminApi = new Hono<Env>();
const body = async (c: any) => (await c.req.json().catch(() => ({}))) as any;
const admin = requireAuth("admin");

/* ================= AKUN ================= */
adminApi.get("/users", admin, async (c) => {
  const role = c.req.query("role");
  const params: any[] = [];
  let where = "1=1";
  if (role && ["admin", "wali", "guru", "ortu"].includes(role)) {
    where += " AND u.role = ?";
    params.push(role);
  }
  const rows = await q(
    `SELECT u.id, u.username, u.name, u.role, u.is_active, u.last_login, u.created_at, u.student_id,
            s.nis, s.name AS student_name, sc.rombel AS student_rombel, sc.tingkat AS student_tingkat,
            hc.rombel AS homeroom_rombel, IF(hc.wali2_id = u.id, 'pendamping', 'utama') AS homeroom_as,
            (SELECT COUNT(*) FROM push_subscriptions p WHERE p.user_id = u.id) AS devices
       FROM users u
       LEFT JOIN students s ON s.id = u.student_id
       LEFT JOIN classes sc ON sc.id = s.class_id
       LEFT JOIN classes hc ON hc.wali_id = u.id OR hc.wali2_id = u.id
      WHERE ${where}
      ORDER BY FIELD(u.role,'admin','wali','guru','ortu'), u.name`,
    params
  );
  return c.json(rows);
});

adminApi.post("/users", admin, async (c) => {
  const b = await body(c);
  const role = String(b.role);
  if (!["admin", "wali", "guru", "ortu"].includes(role)) throw bad("Peran akun tidak valid.");
  const password = typeof b.password === "string" ? b.password : "";
  const pwErr = adminPasswordError(password);
  if (pwErr) throw bad(pwErr);
  let username = str(b.username, 64);
  let name = str(b.name, 150);
  let studentId: number | null = null;
  if (role === "ortu") {
    studentId = int(b.student_id);
    const s = await one<any>(`SELECT id, nis, name FROM students WHERE id = ?`, [studentId]);
    if (!s) throw bad("Pilih siswa untuk akun orang tua.");
    const ex = await one(`SELECT id FROM users WHERE student_id = ?`, [studentId]);
    if (ex) throw bad(`Siswa ${s.name} sudah memiliki akun orang tua.`);
    username = s.nis;
    name = s.name;
  }
  if (!/^[A-Za-z0-9._\-@/]{3,64}$/.test(username)) throw bad("Username minimal 3 karakter, tanpa spasi.");
  if (!name) throw bad("Nama wajib diisi.");
  // Password dibuat admin → pemilik akun wajib menggantinya saat login pertama
  const r = await exec(`INSERT INTO users (username, password_hash, name, role, student_id, must_change_pw) VALUES (?, ?, ?, ?, ?, 1)`, [
    username,
    await Bun.password.hash(password),
    name,
    role,
    studentId,
  ]).catch((e) => {
    if (e?.code === "ER_DUP_ENTRY") throw bad(`Username "${username}" sudah dipakai.`);
    throw e;
  });
  return c.json({ ok: true, id: r!.insertId });
});

adminApi.put("/users/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const me = c.get("user");
  const b = await body(c);
  const u = await one<any>(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!u) throw bad("Akun tidak ditemukan.");
  const isActive = b.is_active === undefined ? u.is_active : b.is_active ? 1 : 0;
  if (id === me.id && !isActive) throw bad("Anda tidak dapat menonaktifkan akun sendiri.");
  let username = u.role === "ortu" ? u.username : str(b.username ?? u.username, 64);
  let name = u.role === "ortu" ? u.name : str(b.name ?? u.name, 150);
  if (!/^[A-Za-z0-9._\-@/]{3,64}$/.test(username)) throw bad("Username minimal 3 karakter, tanpa spasi.");
  await exec(`UPDATE users SET username = ?, name = ?, is_active = ? WHERE id = ?`, [username, name, isActive, id]).catch((e) => {
    if (e?.code === "ER_DUP_ENTRY") throw bad(`Username "${username}" sudah dipakai.`);
    throw e;
  });
  if (b.password) {
    const pw = String(b.password);
    const pwErr = adminPasswordError(pw);
    if (pwErr) throw bad(pwErr);
    // Direset admin untuk orang lain → wajib diganti pemiliknya; semua sesinya diputus
    await exec(`UPDATE users SET password_hash = ?, must_change_pw = ? WHERE id = ?`, [await Bun.password.hash(pw), id === me.id ? 0 : 1, id]);
    if (id !== me.id) await exec(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  }
  if (!isActive) await exec(`DELETE FROM sessions WHERE user_id = ?`, [id]);
  return c.json({ ok: true });
});

adminApi.delete("/users/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  if (id === c.get("user").id) throw bad("Anda tidak dapat menghapus akun sendiri.");
  const u = await one<any>(`SELECT role FROM users WHERE id = ?`, [id]);
  if (u?.role === "admin") {
    const n = await one<any>(`SELECT COUNT(*) n FROM users WHERE role = 'admin'`);
    if (n.n <= 1) throw bad("Minimal harus ada satu akun admin.");
  }
  await exec(`DELETE FROM users WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

/** Buat akun orang tua massal untuk siswa yang belum punya akun (username & password = NIS) */
adminApi.post("/users/generate-parents", admin, async (c) => {
  const b = await body(c);
  const classId = int(b.class_id);
  const studentId = int(b.student_id);
  const rows = await q<any>(
    `SELECT s.id, s.nis, s.name FROM students s LEFT JOIN users u ON u.student_id = s.id
      WHERE u.id IS NULL ${studentId ? "AND s.id = ?" : classId ? "AND s.class_id = ?" : ""}`,
    studentId ? [studentId] : classId ? [classId] : []
  );
  let created = 0;
  const skipped: string[] = [];
  for (const s of rows) {
    const ex = await one(`SELECT id FROM users WHERE username = ?`, [s.nis]);
    if (ex) {
      skipped.push(s.nis);
      continue;
    }
    await exec(`INSERT INTO users (username, password_hash, name, role, student_id, must_change_pw) VALUES (?, ?, ?, 'ortu', ?, 1)`, [
      s.nis,
      await Bun.password.hash(s.nis),
      s.name,
      s.id,
    ]);
    created++;
  }
  return c.json({ ok: true, created, skipped });
});

/* ================= TAMPILAN ================= */
const TEXT_KEYS = ["app_name", "app_subtitle", "school_name", "primary_color", "school_days", "kepala_sekolah", "kota", "footer_text"];

adminApi.get("/settings", admin, async (c) => {
  const s = await getSettings();
  const out: any = {};
  for (const k of TEXT_KEYS) out[k] = s[k] ?? "";
  out.logo = s.logo || "";
  out.favicon = s.favicon || "";
  return c.json(out);
});

function checkImage(v: string, label: string) {
  if (!v) return "";
  const m = /^data:(image\/(png|jpeg|svg\+xml|x-icon|vnd\.microsoft\.icon|webp|gif));base64,[A-Za-z0-9+/=]+$/.exec(v);
  if (!m) throw bad(`${label} harus berupa gambar (PNG, JPG, SVG, ICO, WEBP).`);
  if (v.length > 1_400_000) throw bad(`Ukuran ${label} maksimal 1 MB.`);
  return v;
}

adminApi.put("/settings", admin, async (c) => {
  const b = await body(c);
  for (const k of TEXT_KEYS) {
    if (b[k] === undefined) continue;
    let v = str(b[k], 300);
    if (k === "app_name" && !v) throw bad("Nama aplikasi wajib diisi.");
    if (k === "primary_color" && !/^#[0-9a-fA-F]{6}$/.test(v)) throw bad("Warna utama tidak valid.");
    if (k === "school_days" && !["5", "6"].includes(v)) throw bad("Hari sekolah harus 5 atau 6.");
    await setSetting(k, v);
  }
  if (b.logo !== undefined) await setSetting("logo", checkImage(String(b.logo), "Logo"));
  if (b.favicon !== undefined) await setSetting("favicon", checkImage(String(b.favicon), "Favicon"));
  await setSetting("asset_version", String(Date.now()));
  return c.json({ ok: true });
});

/* ================= BACKUP & RESTORE ================= */
const MIN_PASSPHRASE = 10;

/** Backup & restore menyentuh seluruh data: admin wajib memasukkan ulang password akunnya */
async function confirmAdminPassword(c: any, password: unknown) {
  const u = c.get("user") as User;
  const ip = clientIp(c);
  checkLoginRate(ip, u.username);
  const pw = typeof password === "string" ? password : "";
  const row = await one<any>(`SELECT password_hash FROM users WHERE id = ?`, [u.id]);
  if (!pw || pw.length > MAX_PASSWORD || !(await Bun.password.verify(pw, row.password_hash).catch(() => false))) {
    failLogin(ip, u.username);
    throw bad("Password akun Anda tidak sesuai.");
  }
}

adminApi.post("/backup", admin, async (c) => {
  const b = await body(c);
  await confirmAdminPassword(c, b.password);
  const passphrase = typeof b.passphrase === "string" ? b.passphrase : "";
  if (passphrase.length < MIN_PASSPHRASE || passphrase.length > 200) throw bad(`Kata sandi backup minimal ${MIN_PASSPHRASE} karakter.`);

  const tables: Record<string, any[]> = {};
  for (const t of ALL_TABLES) tables[t] = await q(`SELECT * FROM \`${t}\``);
  const s = await getSettings();
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  // Isi backup (termasuk hash password & kunci push) dienkripsi; yang terbaca hanya info ringkas
  const payload = {
    app: "calakan",
    format: 2,
    encrypted: true,
    school: s.school_name,
    created_at: new Date().toISOString(),
    counts,
    ...(await sealJson({ tables }, passphrase)),
  };
  const now = new Date();
  const fname = `backup-calakan-${toYMD(now)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}.json`;
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${fname}"` },
  });
});

adminApi.post("/restore", admin, async (c) => {
  const ct = c.req.header("content-type") || "";
  if (!ct.includes("multipart/form-data")) throw bad("File backup belum dipilih.");
  const form = await c.req.formData();
  await confirmAdminPassword(c, form.get("password"));
  const f = form.get("file");
  if (!(f instanceof File)) throw bad("File backup belum dipilih.");
  let file: any;
  try {
    file = JSON.parse(await f.text());
  } catch {
    throw bad("File backup rusak atau bukan format JSON.");
  }
  if (file?.app !== "calakan") throw bad("File ini bukan backup CALAKAN.");
  let data: any = file;
  if (file.encrypted) {
    const passphrase = String(form.get("passphrase") || "");
    data = await openJson(file, passphrase);
    if (!data) throw bad("Kata sandi backup salah, atau file backup telah diubah.");
  }
  if (!data || typeof data.tables !== "object" || data.tables === null) throw bad("File ini bukan backup CALAKAN.");
  if (!Array.isArray(data.tables.users) || !data.tables.users.some((u: any) => u.role === "admin"))
    throw bad("Backup tidak berisi akun admin, restore dibatalkan demi keamanan.");

  const counts: Record<string, number> = {};
  await tx(async (conn) => {
    await conn.query(`SET FOREIGN_KEY_CHECKS = 0`);
    try {
      for (const t of ALL_TABLES) await conn.query(`DELETE FROM \`${t}\``);
      for (const t of ALL_TABLES) {
        const rows: any[] = Array.isArray(data.tables[t]) ? data.tables[t] : [];
        const [colsRes]: any = await conn.query(`SHOW COLUMNS FROM \`${t}\``);
        const valid = new Set(colsRes.map((x: any) => x.Field));
        for (const r of rows) {
          const cols = Object.keys(r).filter((k) => valid.has(k));
          if (!cols.length) continue;
          await conn.query(
            `INSERT INTO \`${t}\` (${cols.map((k) => `\`${k}\``).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
            cols.map((k) => r[k])
          );
        }
        counts[t] = rows.length;
      }
    } finally {
      await conn.query(`SET FOREIGN_KEY_CHECKS = 1`);
    }
  });
  // Semua pengguna wajib masuk ulang (ID akun bisa berbeda setelah restore)
  await exec(`DELETE FROM sessions`);
  clearSettingsCache();
  await initPush();
  return c.json({ ok: true, counts });
});
