import { Hono } from "hono";
import { q, one, exec } from "../db";
import { requireAuth, type User } from "../auth";
import { accessibleClasses, assertCanView, buildWeek, buildWeeks, saveRows, copyRows, canPublish, isWaliOf, isHomeroomOf, schoolDays, weekLabel } from "../calakan";
import { buildWorkbook } from "../excel";
import { notifyUsers } from "../push";
import { bad, forbidden, int, mondayOf, parseYMD, rentangIndo, rentangSingkat, addDays } from "../util";
import { getSettings } from "../settings";

type Env = { Variables: { user: User } };
export const calakanApi = new Hono<Env>();
const body = async (c: any) => (await c.req.json().catch(() => ({}))) as any;
const auth = requireAuth();

const weekOf = (v: any) => {
  if (v && !parseYMD(String(v))) throw bad("Tanggal pekan tidak valid.");
  return mondayOf(v ? String(v) : undefined);
};

calakanApi.get("/classes", auth, async (c) => {
  const u = c.get("user");
  const list = await accessibleClasses(u);
  let mine = new Set<number>();
  if (u.role === "guru" || u.role === "wali") {
    const rows = await q<any>(`SELECT DISTINCT class_id FROM assignments WHERE teacher_id = ?`, [u.id]);
    mine = new Set(rows.map((r) => r.class_id));
  }
  return c.json(list.map((x: any) => ({ ...x, is_homeroom: isHomeroomOf(x, u.id), teaches: mine.has(x.id) })));
});

calakanApi.get("/week", auth, async (c) => {
  const u = c.get("user");
  const classId = int(c.req.query("class_id"));
  const week = weekOf(c.req.query("week"));
  await assertCanView(u, classId);
  const data = await buildWeek(classId, week, u);
  if (u.role === "ortu" && data.week.status !== "published") {
    return c.json({ class: data.class, week: data.week, published: false, days: [] });
  }
  return c.json({ ...data, published: data.week.status === "published" });
});

calakanApi.put("/week", requireAuth("admin", "wali", "guru"), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  const classId = int(b.class_id);
  const week = weekOf(b.week);
  await assertCanView(u, classId);
  const saved = await saveRows(u, classId, week, Array.isArray(b.rows) ? b.rows : []);
  return c.json({ ok: true, saved });
});

calakanApi.post("/copy", requireAuth("admin", "wali", "guru"), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  const classId = int(b.class_id);
  const week = weekOf(b.week);
  const fromClass = int(b.from_class_id) || classId;
  const fromWeek = weekOf(b.from_week || addDays(week, -7));
  if (fromClass === classId && fromWeek === week) throw bad("Sumber salinan sama dengan tujuan.");
  await assertCanView(u, classId);
  await assertCanView(u, fromClass);
  const saved = await copyRows(u, classId, week, fromClass, fromWeek);
  return c.json({ ok: true, saved });
});

calakanApi.post("/publish", requireAuth("admin", "wali"), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  const classId = int(b.class_id);
  const week = weekOf(b.week);
  if (!(await canPublish(u, classId))) throw forbidden("Hanya wali kelas ini atau admin yang dapat menerbitkan CALAKAN.");
  const data = await buildWeek(classId, week, u);
  if (!data.progress.filled) throw bad("CALAKAN pekan ini masih kosong. Isi rencana terlebih dahulu.");
  const wasPublished = data.week.status === "published";
  await exec(
    `INSERT INTO calakan_weeks (class_id, week_start, status, published_at, published_by) VALUES (?, ?, 'published', NOW(), ?)
     ON DUPLICATE KEY UPDATE status = 'published', published_at = NOW(), published_by = VALUES(published_by), has_changes = 0`,
    [classId, week, u.id]
  );
  // Kirim notifikasi ke orang tua di kelas ini
  const parents = await q<any>(
    `SELECT u.id FROM users u JOIN students s ON s.id = u.student_id WHERE s.class_id = ? AND u.role = 'ortu' AND u.is_active = 1`,
    [classId]
  );
  const s = await getSettings();
  // Judul notifikasi di HP hanya muat ±35 karakter: pekan di judul, kelas di awal isi,
  // sehingga keduanya tetap terlihat walau wali kelas menulis pesan sendiri
  const app = s.app_name || "CALAKAN";
  const pekan = rentangSingkat(week, data.week.end);
  const title = wasPublished ? `Pembaruan ${app} ${pekan}` : `${app} ${pekan} sudah terbit`;
  const note = String(b.message || "").trim().slice(0, 200);
  const msg = `Kelas ${data.class.label} · ${
    note || (wasPublished ? "Ada perubahan rencana pembelajaran. Ketuk untuk melihat." : "Rencana pembelajaran sudah dapat dilihat. Ketuk untuk membuka.")
  }`;
  const res = await notifyUsers(
    parents.map((p) => p.id),
    { title, body: msg, url: `/#/calakan?week=${week}`, tag: `calakan-${classId}-${week}` }
  );
  return c.json({ ok: true, notified: res.saved, pushed: res.sent });
});

calakanApi.post("/unpublish", requireAuth("admin", "wali"), async (c) => {
  const u = c.get("user");
  const b = await body(c);
  const classId = int(b.class_id);
  const week = weekOf(b.week);
  if (!(await canPublish(u, classId))) throw forbidden();
  await exec(`UPDATE calakan_weeks SET status = 'draft', has_changes = 0 WHERE class_id = ? AND week_start = ?`, [classId, week]);
  return c.json({ ok: true });
});

/** Rekap status semua kelas yang dapat diakses untuk satu pekan */
calakanApi.get("/overview", requireAuth("admin", "wali", "guru"), async (c) => {
  const u = c.get("user");
  const week = weekOf(c.req.query("week"));
  const list = (await accessibleClasses(u)) as any[];
  const built = await buildWeeks(list.map((x) => x.id), week, u);
  const out = built.map((d) => ({
    class: d.class,
    status: d.week.status,
    has_changes: d.week.has_changes,
    published_at: d.week.published_at,
    progress: d.progress,
    can_publish: d.can_publish,
    is_homeroom: isHomeroomOf(d.class, u.id),
  }));
  return c.json({ week, label: await weekLabel(week), classes: out });
});

/** Beberapa kelas sekaligus (untuk cetak PDF gabungan) */
calakanApi.get("/bulk", requireAuth("admin", "wali"), async (c) => {
  const u = c.get("user");
  const week = weekOf(c.req.query("week"));
  const ids = await exportClassIds(u, c.req.query("class_id"));
  return c.json(await buildWeeks(ids, week, null));
});

async function exportClassIds(u: User, param?: string) {
  if (u.role === "admin") {
    if (!param || param === "all") return (await q<any>(`SELECT id FROM classes ORDER BY tingkat, rombel`)).map((x) => x.id);
    return [int(param)];
  }
  // Wali kelas: hanya kelasnya sendiri
  const cls = await one<any>(`SELECT id FROM classes WHERE wali_id = ? OR wali2_id = ? LIMIT 1`, [u.id, u.id]);
  if (!cls) throw forbidden("Anda belum ditetapkan sebagai wali kelas.");
  if (param && param !== "all" && int(param) !== cls.id) throw forbidden("Anda hanya dapat mencetak CALAKAN kelas Anda.");
  return [cls.id];
}

calakanApi.get("/export.xlsx", requireAuth("admin", "wali"), async (c) => {
  const u = c.get("user");
  const week = weekOf(c.req.query("week"));
  const ids = await exportClassIds(u, c.req.query("class_id"));
  const weeks = await buildWeeks(ids, week, null);
  if (!weeks.length) throw bad("Kelas tidak ditemukan.");
  const buf = await buildWorkbook(weeks);
  const name = ids.length === 1 ? `CALAKAN-${weeks[0].class.rombel}-${week}.xlsx` : `CALAKAN-Semua-Kelas-${week}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
});

/** Riwayat pekan yang sudah terbit (orang tua) */
calakanApi.get("/history", auth, async (c) => {
  const u = c.get("user");
  let classId = int(c.req.query("class_id"));
  if (u.role === "ortu") {
    const s = await one<any>(`SELECT class_id FROM students WHERE id = ?`, [u.student_id]);
    classId = s?.class_id;
  } else await assertCanView(u, classId);
  if (!classId) return c.json([]);
  const rows = await q<any>(
    `SELECT week_start, published_at FROM calakan_weeks WHERE class_id = ? AND status = 'published' ORDER BY week_start DESC LIMIT 30`,
    [classId]
  );
  const days = await schoolDays();
  return c.json(rows.map((r) => ({ ...r, label: rentangIndo(r.week_start, addDays(r.week_start, days - 1)) })));
});

export { isWaliOf };
