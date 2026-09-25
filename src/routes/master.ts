import { Hono } from "hono";
import { q, one, exec, tx } from "../db";
import { requireAuth, adminPasswordError, type User } from "../auth";
import { accessibleClasses } from "../calakan";
import { studentTemplate, readStudentSheet } from "../excel";
import { bad, notFound, HttpError, int, str, faseOf, allowsWali2 } from "../util";

type Env = { Variables: { user: User } };
export const master = new Hono<Env>();
const body = async (c: any) => (await c.req.json().catch(() => ({}))) as any;
const admin = requireAuth("admin");

function dupMsg(e: any, msg: string) {
  if (e?.code === "ER_DUP_ENTRY") throw bad(msg);
  throw e;
}

/* ================= KELAS ================= */
master.get("/classes", requireAuth(), async (c) => {
  const u = c.get("user");
  if (u.role !== "admin") return c.json(await accessibleClasses(u));
  const rows = await q<any>(
    `SELECT c.*, u.name AS wali_name, u2.name AS wali2_name,
            (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
       FROM classes c LEFT JOIN users u ON u.id = c.wali_id LEFT JOIN users u2 ON u2.id = c.wali2_id
      ORDER BY c.tingkat, c.rombel`
  );
  rows.forEach((r) => (r.fase = faseOf(r.tingkat)));
  return c.json(rows);
});

/** Validasi wali utama & pendamping. Pendamping hanya untuk kelas 1–2 dan harus orang yang berbeda */
async function waliInput(b: any, tingkat: number) {
  const waliId = int(b.wali_id) || null;
  let wali2Id = int(b.wali2_id) || null;
  if (wali2Id && !allowsWali2(tingkat)) throw bad("Wali kelas pendamping hanya untuk kelas 1 dan 2 (Fase A).");
  if (!allowsWali2(tingkat)) wali2Id = null;
  if (waliId && waliId === wali2Id) throw bad("Wali kelas utama dan pendamping harus orang yang berbeda.");
  for (const id of [waliId, wali2Id]) {
    if (!id) continue;
    const w = await one<any>(`SELECT role FROM users WHERE id = ?`, [id]);
    if (w?.role !== "wali") throw bad("Wali kelas yang dipilih tidak valid.");
  }
  return { waliId, wali2Id };
}

/** Satu wali hanya memegang satu kelas (sebagai utama ATAU pendamping) */
async function assignWalis(conn: any, classId: number, waliId: number | null, wali2Id: number | null) {
  for (const id of [waliId, wali2Id]) {
    if (!id) continue;
    await conn.query(`UPDATE classes SET wali_id = NULL WHERE wali_id = ? AND id <> ?`, [id, classId]);
    await conn.query(`UPDATE classes SET wali2_id = NULL WHERE wali2_id = ? AND id <> ?`, [id, classId]);
  }
  await conn.query(`UPDATE classes SET wali_id = ?, wali2_id = ? WHERE id = ?`, [waliId, wali2Id, classId]);
}

function classInput(b: any) {
  const tingkat = int(b.tingkat);
  const rombel = str(b.rombel, 10).toUpperCase();
  const name = str(b.name, 120);
  if (tingkat < 1 || tingkat > 6) throw bad("Tingkat kelas harus 1–6.");
  if (!rombel) throw bad("Kode rombel wajib diisi (contoh: 1A).");
  if (!name) throw bad("Nama kelas wajib diisi (contoh: Abu Bakar Ash-Shiddiq).");
  return { tingkat, rombel, name, kelompok: str(b.kelompok, 60) || null };
}

master.post("/classes", admin, async (c) => {
  const b = await body(c);
  const d = classInput(b);
  const w = await waliInput(b, d.tingkat);
  const id = await tx(async (conn) => {
    const [r]: any = await conn.query(`INSERT INTO classes (tingkat, rombel, name, kelompok) VALUES (?, ?, ?, ?)`, [
      d.tingkat, d.rombel, d.name, d.kelompok,
    ]);
    await assignWalis(conn, r.insertId, w.waliId, w.wali2Id);
    return r.insertId as number;
  }).catch((e) => dupMsg(e, `Rombel ${d.rombel} sudah ada.`));
  return c.json({ ok: true, id });
});

master.put("/classes/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const b = await body(c);
  const d = classInput(b);
  const w = await waliInput(b, d.tingkat);
  await tx(async (conn) => {
    await conn.query(`UPDATE classes SET tingkat = ?, rombel = ?, name = ?, kelompok = ? WHERE id = ?`, [
      d.tingkat, d.rombel, d.name, d.kelompok, id,
    ]);
    await assignWalis(conn, id, w.waliId, w.wali2Id);
  }).catch((e) => dupMsg(e, `Rombel ${d.rombel} sudah dipakai kelas lain.`));
  return c.json({ ok: true });
});

master.delete("/classes/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const n = await one<any>(`SELECT COUNT(*) n FROM students WHERE class_id = ?`, [id]);
  if (n?.n) throw bad(`Kelas ini masih memiliki ${n.n} siswa. Pindahkan atau hapus siswanya terlebih dahulu.`);
  await exec(`DELETE FROM classes WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

/* ================= SISWA ================= */
master.get("/students", admin, async (c) => {
  const classId = c.req.query("class_id");
  const params: any[] = [];
  let where = "1=1";
  if (classId === "none") where += " AND s.class_id IS NULL";
  else if (classId) {
    where += " AND s.class_id = ?";
    params.push(int(classId));
  }
  const rows = await q(
    `SELECT s.*, c.rombel, c.tingkat, c.name AS class_name, u.id AS account_id, u.username, u.is_active
       FROM students s LEFT JOIN classes c ON c.id = s.class_id LEFT JOIN users u ON u.student_id = s.id
      WHERE ${where} ORDER BY c.tingkat, c.rombel, s.name`,
    params
  );
  return c.json(rows);
});

async function createParentAccount(studentId: number, nis: string, name: string, password?: string) {
  const exists = await one(`SELECT id FROM users WHERE username = ? OR student_id = ?`, [nis, studentId]);
  if (exists) return false;
  const pw = password && !adminPasswordError(password) ? password : nis;
  // Password awal dibuat admin → orang tua wajib menggantinya saat login pertama
  await exec(`INSERT INTO users (username, password_hash, name, role, student_id, must_change_pw) VALUES (?, ?, ?, 'ortu', ?, 1)`, [
    nis, await Bun.password.hash(pw), name, studentId,
  ]);
  return true;
}

function studentInput(b: any) {
  const nis = str(b.nis, 30);
  const name = str(b.name, 150);
  if (!nis) throw bad("NIS wajib diisi.");
  if (!/^[A-Za-z0-9.\-_/]+$/.test(nis)) throw bad("NIS hanya boleh berisi huruf, angka, titik, strip, atau garis miring.");
  if (!name) throw bad("Nama siswa wajib diisi.");
  const gender = b.gender === "L" || b.gender === "P" ? b.gender : null;
  return { nis, name, gender, class_id: int(b.class_id) || null };
}

master.post("/students", admin, async (c) => {
  const b = await body(c);
  const d = studentInput(b);
  const r = await exec(`INSERT INTO students (nis, name, gender, class_id) VALUES (?, ?, ?, ?)`, [d.nis, d.name, d.gender, d.class_id]).catch(
    (e) => dupMsg(e, `NIS ${d.nis} sudah terdaftar.`)
  );
  let account = false;
  if (b.create_account) account = await createParentAccount(r!.insertId, d.nis, d.name, b.password);
  return c.json({ ok: true, id: r!.insertId, account });
});

master.put("/students/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const b = await body(c);
  const d = studentInput(b);
  await exec(`UPDATE students SET nis = ?, name = ?, gender = ?, class_id = ? WHERE id = ?`, [d.nis, d.name, d.gender, d.class_id, id]).catch((e) =>
    dupMsg(e, `NIS ${d.nis} sudah dipakai siswa lain.`)
  );
  // Nama & username akun ortu mengikuti data siswa
  await exec(`UPDATE users SET name = ?, username = ? WHERE student_id = ?`, [d.name, d.nis, id]).catch((e) =>
    dupMsg(e, `Username ${d.nis} sudah dipakai akun lain.`)
  );
  return c.json({ ok: true });
});

master.delete("/students/:id", admin, async (c) => {
  await exec(`DELETE FROM students WHERE id = ?`, [int(c.req.param("id"))]);
  return c.json({ ok: true });
});

master.get("/students/template", admin, async (c) => {
  const classes = await q(`SELECT rombel, tingkat, name FROM classes ORDER BY tingkat, rombel`);
  const buf = await studentTemplate(classes);
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-impor-siswa.xlsx"`,
    },
  });
});

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

master.post("/students/import", admin, async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw bad("File Excel belum dipilih.");
  if (file.size > MAX_IMPORT_BYTES) throw bad("Ukuran file Excel maksimal 5 MB.");
  const createAcc = form.get("create_accounts") === "1";
  let rows: Awaited<ReturnType<typeof readStudentSheet>>;
  try {
    rows = await readStudentSheet(await file.arrayBuffer());
  } catch {
    throw bad("File tidak dapat dibaca. Pastikan file berformat Excel (.xlsx), misalnya dari tombol Template.");
  }
  if (!rows.length) throw bad("Tidak ada data siswa yang terbaca. Gunakan template yang disediakan.");
  if (rows.length > MAX_IMPORT_ROWS) throw bad(`Maksimal ${MAX_IMPORT_ROWS} siswa per impor. Bagi file menjadi beberapa bagian.`);
  const classes = await q<any>(`SELECT id, rombel FROM classes`);
  const byRombel = new Map(classes.map((x) => [String(x.rombel).toUpperCase(), x.id]));
  let added = 0, updated = 0, accounts = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const classId = r.rombel ? byRombel.get(r.rombel) : null;
    if (r.rombel && !classId) errors.push(`${r.nis} – rombel "${r.rombel}" tidak ditemukan`);
    const gender = r.gender === "L" || r.gender === "P" ? r.gender : null;
    const ex = await one<any>(`SELECT id FROM students WHERE nis = ?`, [r.nis]);
    let sid: number;
    if (ex) {
      await exec(`UPDATE students SET name = ?, gender = COALESCE(?, gender), class_id = COALESCE(?, class_id) WHERE id = ?`, [r.name, gender, classId || null, ex.id]);
      await exec(`UPDATE users SET name = ? WHERE student_id = ?`, [r.name, ex.id]);
      sid = ex.id;
      updated++;
    } else {
      const res = await exec(`INSERT INTO students (nis, name, gender, class_id) VALUES (?, ?, ?, ?)`, [r.nis, r.name, gender, classId || null]);
      sid = res.insertId;
      added++;
    }
    if (createAcc && (await createParentAccount(sid, r.nis, r.name))) accounts++;
  }
  return c.json({ ok: true, added, updated, accounts, errors });
});

/* ================= MATA PELAJARAN ================= */
master.get("/subjects", admin, async (c) => {
  const subjects = await q<any>(`SELECT * FROM subjects ORDER BY urutan, name`);
  const asg = await q<any>(
    `SELECT a.subject_id, a.class_id, c.rombel, c.tingkat, u.id AS teacher_id, u.name AS teacher, u.role
       FROM assignments a JOIN users u ON u.id = a.teacher_id JOIN classes c ON c.id = a.class_id
      ORDER BY u.name, c.tingkat, c.rombel`
  );
  const used = await q<any>(`SELECT subject_id, COUNT(*) n FROM schedules GROUP BY subject_id`);
  const usedMap = new Map(used.map((x) => [x.subject_id, x.n]));
  for (const s of subjects) {
    const tmap = new Map<number, any>();
    for (const a of asg.filter((x) => x.subject_id === s.id)) {
      if (!tmap.has(a.teacher_id)) tmap.set(a.teacher_id, { id: a.teacher_id, name: a.teacher, role: a.role, classes: [] });
      tmap.get(a.teacher_id).classes.push(a.rombel);
    }
    s.teachers = [...tmap.values()];
    s.schedule_count = usedMap.get(s.id) || 0;
  }
  return c.json(subjects);
});

master.post("/subjects", admin, async (c) => {
  const b = await body(c);
  const name = str(b.name, 100);
  if (!name) throw bad("Nama mata pelajaran wajib diisi.");
  const max = await one<any>(`SELECT COALESCE(MAX(urutan), 0) m FROM subjects`);
  const r = await exec(`INSERT INTO subjects (name, kode, urutan) VALUES (?, ?, ?)`, [name, str(b.kode, 20) || null, int(b.urutan) || max.m + 1]).catch(
    (e) => dupMsg(e, `Mata pelajaran "${name}" sudah ada.`)
  );
  return c.json({ ok: true, id: r!.insertId });
});

master.put("/subjects/:id", admin, async (c) => {
  const b = await body(c);
  const name = str(b.name, 100);
  if (!name) throw bad("Nama mata pelajaran wajib diisi.");
  await exec(`UPDATE subjects SET name = ?, kode = ?, urutan = ? WHERE id = ?`, [name, str(b.kode, 20) || null, int(b.urutan), int(c.req.param("id"))]).catch((e) =>
    dupMsg(e, `Mata pelajaran "${name}" sudah ada.`)
  );
  return c.json({ ok: true });
});

master.delete("/subjects/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const n = await one<any>(`SELECT (SELECT COUNT(*) FROM schedules WHERE subject_id = ?) + (SELECT COUNT(*) FROM calakan_items WHERE subject_id = ?) n`, [id, id]);
  if (n?.n) throw bad("Mata pelajaran ini sudah dipakai di jadwal atau CALAKAN, sehingga tidak dapat dihapus. Ubah namanya saja bila perlu.");
  await exec(`DELETE FROM subjects WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

/* ================= GURU & WALI KELAS ================= */
master.get("/teachers", admin, async (c) => {
  const rows = await q<any>(
    `SELECT u.id, u.username, u.name, u.role, u.nip, u.phone, u.gender, u.is_active, u.last_login,
            c.id AS homeroom_id, c.rombel AS homeroom_rombel, c.tingkat AS homeroom_tingkat, c.name AS homeroom_name,
            IF(c.wali2_id = u.id, 'pendamping', 'utama') AS homeroom_as
       FROM users u LEFT JOIN classes c ON c.wali_id = u.id OR c.wali2_id = u.id
      WHERE u.role IN ('wali','guru')
      ORDER BY u.name`
  );
  const asg = await q<any>(
    `SELECT a.teacher_id, a.subject_id, s.name AS subject, a.class_id, c.rombel, c.tingkat
       FROM assignments a JOIN subjects s ON s.id = a.subject_id JOIN classes c ON c.id = a.class_id
      ORDER BY s.urutan, s.name, c.tingkat, c.rombel`
  );
  for (const t of rows) {
    const mine = asg.filter((a) => a.teacher_id === t.id);
    const map = new Map<number, any>();
    for (const a of mine) {
      if (!map.has(a.subject_id)) map.set(a.subject_id, { subject_id: a.subject_id, subject: a.subject, class_ids: [], rombels: [] });
      map.get(a.subject_id).class_ids.push(a.class_id);
      map.get(a.subject_id).rombels.push(a.rombel);
    }
    t.assignments = [...map.values()];
  }
  return c.json(rows);
});

type AsgIn = { subject_id: number; class_ids: number[] };

/** Ubah input penugasan menjadi pasangan [mapel, kelas] unik yang benar-benar ada di database */
async function normalizeAssignments(list: AsgIn[]) {
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  for (const a of Array.isArray(list) ? list : []) {
    const sid = int(a?.subject_id);
    if (!sid) continue;
    for (const cid of Array.isArray(a.class_ids) ? a.class_ids : []) {
      const k = `${sid}:${int(cid)}`;
      if (!int(cid) || seen.has(k)) continue;
      seen.add(k);
      pairs.push([sid, int(cid)]);
    }
  }
  if (!pairs.length) return pairs;
  const sids = new Set((await q<any>(`SELECT id FROM subjects`)).map((x) => x.id));
  const cids = new Set((await q<any>(`SELECT id FROM classes`)).map((x) => x.id));
  if (pairs.some(([s, c]) => !sids.has(s) || !cids.has(c))) throw bad("Ada mata pelajaran atau kelas yang tidak valid. Muat ulang halaman lalu coba lagi.");
  return pairs;
}

/** Mapel+kelas yang saat ini diampu guru lain */
async function findConflicts(pairs: [number, number][], teacherId: number | null) {
  if (!pairs.length) return [];
  const rows = await q<any>(
    `SELECT a.subject_id, a.class_id, u.name, s.name AS subject, c.rombel
       FROM assignments a JOIN users u ON u.id = a.teacher_id
       JOIN subjects s ON s.id = a.subject_id JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_id <> ?`,
    [teacherId ?? 0]
  );
  const wanted = new Set(pairs.map(([s, c]) => `${s}:${c}`));
  return rows.filter((r) => wanted.has(`${r.subject_id}:${r.class_id}`)).map((r) => `${r.subject} di kelas ${r.rombel} saat ini diampu oleh ${r.name}`);
}

function teacherInput(b: any, isNew: boolean) {
  const name = str(b.name, 150);
  const username = str(b.username, 64);
  const role = b.role === "wali" ? "wali" : "guru";
  if (!name) throw bad("Nama guru wajib diisi.");
  if (!/^[A-Za-z0-9._\-@]{3,64}$/.test(username)) throw bad("Username minimal 3 karakter, tanpa spasi.");
  const password = typeof b.password === "string" ? b.password : "";
  if (isNew || password) {
    const err = adminPasswordError(password);
    if (err) throw bad(err);
  }
  const gender = b.gender === "L" || b.gender === "P" ? b.gender : null;
  return { name, username, role, password, gender, nip: str(b.nip, 40) || null, phone: str(b.phone, 30) || null };
}

/**
 * Simpan guru baru / perubahan guru dalam SATU transaksi:
 * akun, password, kelas perwalian, dan penugasan mapel berhasil semua atau tidak berubah sama sekali.
 */
async function saveTeacher(id: number | null, b: any) {
  const d = teacherInput(b, !id);
  // Satu guru = satu akun: username & NIP tidak boleh dipakai akun lain
  const dupUser = await one<any>(`SELECT id FROM users WHERE username = ? AND id <> ?`, [d.username, id ?? 0]);
  if (dupUser) throw bad(`Username "${d.username}" sudah dipakai.`);
  if (d.nip) {
    const dupNip = await one<any>(`SELECT name FROM users WHERE nip = ? AND id <> ?`, [d.nip, id ?? 0]);
    if (dupNip) throw bad(`NIP/NIY ${d.nip} sudah terdaftar atas nama ${dupNip.name}. Satu guru hanya boleh memiliki satu akun.`);
  }
  const homeroom = d.role === "wali" ? int(b.homeroom_id) || null : null;
  const asPendamping = b.homeroom_as === "pendamping";
  if (homeroom) {
    const hc = await one<any>(`SELECT tingkat FROM classes WHERE id = ?`, [homeroom]);
    if (!hc) throw bad("Kelas perwalian tidak ditemukan.");
    if (asPendamping && !allowsWali2(hc.tingkat)) throw bad("Wali kelas pendamping hanya untuk kelas 1 dan 2 (Fase A).");
  }
  const pairs = await normalizeAssignments(b.assignments);
  const conflicts = await findConflicts(pairs, id);
  if (conflicts.length && !b.force) throw new HttpError(409, "Ada mata pelajaran yang sudah diampu guru lain.", { conflicts });
  const hash = d.password ? await Bun.password.hash(d.password) : null;

  return tx(async (conn) => {
    let tid = id;
    if (tid) {
      await conn.query(`UPDATE users SET username = ?, name = ?, role = ?, nip = ?, phone = ?, gender = ? WHERE id = ?`, [
        d.username, d.name, d.role, d.nip, d.phone, d.gender, tid,
      ]);
      if (hash) {
        await conn.query(`UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?`, [hash, tid]);
        await conn.query(`DELETE FROM sessions WHERE user_id = ?`, [tid]);
      }
    } else {
      const [r]: any = await conn.query(
        `INSERT INTO users (username, password_hash, name, role, nip, phone, gender, must_change_pw) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [d.username, hash, d.name, d.role, d.nip, d.phone, d.gender]
      );
      tid = r.insertId as number;
    }
    // satu wali hanya memegang satu kelas
    await conn.query(`UPDATE classes SET wali_id = NULL WHERE wali_id = ?`, [tid]);
    await conn.query(`UPDATE classes SET wali2_id = NULL WHERE wali2_id = ?`, [tid]);
    if (homeroom) await conn.query(`UPDATE classes SET ${asPendamping ? "wali2_id" : "wali_id"} = ? WHERE id = ?`, [tid, homeroom]);
    await conn.query(`DELETE FROM assignments WHERE teacher_id = ?`, [tid]);
    for (const [sid, cid] of pairs) {
      await conn.query(`DELETE FROM assignments WHERE subject_id = ? AND class_id = ?`, [sid, cid]);
      await conn.query(`INSERT INTO assignments (teacher_id, subject_id, class_id) VALUES (?, ?, ?)`, [tid, sid, cid]);
    }
    return tid!;
  }).catch((e) => dupMsg(e, `Username "${d.username}" sudah dipakai.`));
}

master.post("/teachers", admin, async (c) => {
  const id = await saveTeacher(null, await body(c));
  return c.json({ ok: true, id });
});

master.put("/teachers/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  const t = await one<any>(`SELECT id FROM users WHERE id = ? AND role IN ('wali','guru')`, [id]);
  if (!t) throw notFound("Guru tidak ditemukan.");
  await saveTeacher(id, await body(c));
  return c.json({ ok: true });
});

master.delete("/teachers/:id", admin, async (c) => {
  const id = int(c.req.param("id"));
  await exec(`DELETE FROM users WHERE id = ? AND role IN ('wali','guru')`, [id]);
  return c.json({ ok: true });
});

/* ================= JADWAL PELAJARAN ================= */
master.get("/schedules", requireAuth("admin", "wali", "guru"), async (c) => {
  const u = c.get("user");
  const classId = int(c.req.query("class_id"));
  if (u.role !== "admin") {
    const list = await accessibleClasses(u);
    if (!list.some((x: any) => x.id === classId)) throw new HttpError(403, "Anda tidak memiliki akses ke kelas ini.");
  }
  const rows = await q(
    `SELECT sc.id, sc.hari, sc.urutan, sc.subject_id, sc.jam_mulai, sc.jam_selesai, s.name AS subject, t.name AS teacher, t.id AS teacher_id
       FROM schedules sc JOIN subjects s ON s.id = sc.subject_id
       LEFT JOIN assignments a ON a.subject_id = sc.subject_id AND a.class_id = sc.class_id
       LEFT JOIN users t ON t.id = a.teacher_id
      WHERE sc.class_id = ? ORDER BY sc.hari, sc.urutan, sc.id`,
    [classId]
  );
  return c.json(rows);
});

/** Jadwal mengajar milik guru yang sedang login (lintas kelas) */
master.get("/schedules/mine", requireAuth("wali", "guru"), async (c) => {
  const u = c.get("user");
  const rows = await q(
    `SELECT sc.id, sc.hari, sc.urutan, sc.jam_mulai, sc.jam_selesai, s.name AS subject, c.id AS class_id, c.rombel, c.tingkat, c.name AS class_name
       FROM assignments a
       JOIN schedules sc ON sc.subject_id = a.subject_id AND sc.class_id = a.class_id
       JOIN subjects s ON s.id = a.subject_id JOIN classes c ON c.id = a.class_id
      WHERE a.teacher_id = ?
      ORDER BY sc.hari, sc.jam_mulai, sc.urutan, c.tingkat, c.rombel`,
    [u.id]
  );
  return c.json(rows);
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

master.put("/schedules/:classId", admin, async (c) => {
  const classId = int(c.req.param("classId"));
  const cls = await one(`SELECT id FROM classes WHERE id = ?`, [classId]);
  if (!cls) throw notFound("Kelas tidak ditemukan.");
  const b = await body(c);
  const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
  const subj = new Set((await q<any>(`SELECT id FROM subjects`)).map((x) => x.id));
  for (const r of rows) {
    if (int(r.hari) < 1 || int(r.hari) > 6) throw bad("Hari tidak valid.");
    if (!subj.has(int(r.subject_id))) throw bad("Ada mata pelajaran yang belum dipilih.");
    if (r.jam_mulai && !TIME.test(r.jam_mulai)) throw bad("Format jam harus HH:MM.");
    if (r.jam_selesai && !TIME.test(r.jam_selesai)) throw bad("Format jam harus HH:MM.");
  }
  await tx(async (conn) => {
    const [exist]: any = await conn.query(`SELECT id FROM schedules WHERE class_id = ?`, [classId]);
    const existIds = new Set<number>(exist.map((x: any) => x.id));
    const keep = new Set<number>();
    for (const r of rows) {
      const vals = [int(r.hari), int(r.subject_id), int(r.urutan), r.jam_mulai || null, r.jam_selesai || null];
      if (r.id && existIds.has(int(r.id))) {
        keep.add(int(r.id));
        await conn.query(`UPDATE schedules SET hari = ?, subject_id = ?, urutan = ?, jam_mulai = ?, jam_selesai = ? WHERE id = ?`, [...vals, int(r.id)]);
      } else {
        await conn.query(`INSERT INTO schedules (class_id, hari, subject_id, urutan, jam_mulai, jam_selesai) VALUES (?, ?, ?, ?, ?, ?)`, [classId, ...vals]);
      }
    }
    for (const id of existIds) {
      if (!keep.has(id)) {
        // Isian CALAKAN yang sudah kosong ikut dibersihkan; yang berisi tetap disimpan sebagai arsip
        await conn.query(
          `DELETE FROM calakan_items WHERE schedule_id = ? AND COALESCE(materi,'') = '' AND COALESCE(kegiatan,'') = '' AND COALESCE(tugas,'') = ''`,
          [id]
        );
        await conn.query(`DELETE FROM schedules WHERE id = ?`, [id]);
      }
    }
    // sinkronkan snapshot hari/mapel/urutan pada isian yang masih terhubung
    await conn.query(
      `UPDATE calakan_items ci JOIN schedules sc ON sc.id = ci.schedule_id SET ci.hari = sc.hari, ci.subject_id = sc.subject_id, ci.urutan = sc.urutan WHERE sc.class_id = ?`,
      [classId]
    );
  });
  return c.json({ ok: true });
});

master.post("/schedules/copy", admin, async (c) => {
  const b = await body(c);
  const from = int(b.from_class_id),
    to = int(b.to_class_id);
  if (!from || !to || from === to) throw bad("Pilih kelas sumber dan tujuan yang berbeda.");
  const src = await q<any>(`SELECT hari, subject_id, urutan, jam_mulai, jam_selesai FROM schedules WHERE class_id = ?`, [from]);
  await tx(async (conn) => {
    await conn.query(`DELETE FROM schedules WHERE class_id = ?`, [to]);
    for (const r of src)
      await conn.query(`INSERT INTO schedules (class_id, hari, subject_id, urutan, jam_mulai, jam_selesai) VALUES (?, ?, ?, ?, ?, ?)`, [
        to, r.hari, r.subject_id, r.urutan, r.jam_mulai, r.jam_selesai,
      ]);
  });
  return c.json({ ok: true, count: src.length });
});
