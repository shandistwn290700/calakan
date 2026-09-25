import { q, one, exec } from "./db";
import type { User } from "./auth";
import { DAY_NAMES } from "./config";
import { getSettings } from "./settings";
import { addDays, rentangIndo, tglIndo, forbidden, notFound, bad, faseOf, str } from "./util";

export type Row = {
  key: string;
  schedule_id: number | null;
  item_id: number | null;
  subject_id: number;
  subject: string;
  teacher: string | null;
  teacher_id: number | null;
  jam: string;
  materi: string;
  kegiatan: string;
  tugas: string;
  keterangan: string;
  updated_at: string | null;
  updated_by_name: string | null;
  can_edit: boolean;
};

export async function getClass(classId: number) {
  const c = await one<any>(
    `SELECT c.*, u.name AS wali_name, u2.name AS wali2_name FROM classes c
       LEFT JOIN users u ON u.id = c.wali_id LEFT JOIN users u2 ON u2.id = c.wali2_id WHERE c.id = ?`,
    [classId]
  );
  if (!c) throw notFound("Kelas tidak ditemukan.");
  c.fase = faseOf(c.tingkat);
  return c;
}

/** Kelas-kelas yang boleh diakses pengguna pada modul CALAKAN */
export async function accessibleClasses(user: User) {
  const base = `SELECT c.id, c.tingkat, c.rombel, c.name, c.kelompok, c.wali_id, u.name AS wali_name, c.wali2_id, u2.name AS wali2_name
                  FROM classes c LEFT JOIN users u ON u.id = c.wali_id LEFT JOIN users u2 ON u2.id = c.wali2_id`;
  const order = ` ORDER BY c.tingkat, c.rombel`;
  if (user.role === "admin") return q(base + order);
  if (user.role === "ortu") {
    return q(base + ` WHERE c.id = (SELECT class_id FROM students WHERE id = ?)` + order, [user.student_id]);
  }
  return q(
    base +
      ` WHERE c.wali_id = ? OR c.wali2_id = ? OR c.id IN (SELECT class_id FROM assignments WHERE teacher_id = ?)` +
      order,
    [user.id, user.id, user.id]
  );
}

export async function assertCanView(user: User, classId: number) {
  const list = await accessibleClasses(user);
  if (!list.some((c: any) => c.id === classId)) throw forbidden("Anda tidak memiliki akses ke kelas ini.");
}

/** Pengguna adalah wali kelas (utama atau pendamping) dari kelas ini */
export const isHomeroomOf = (cls: { wali_id: number | null; wali2_id?: number | null }, userId: number) =>
  cls.wali_id === userId || cls.wali2_id === userId;

export async function isWaliOf(user: User, classId: number) {
  if (user.role !== "wali") return false;
  const r = await one(`SELECT id FROM classes WHERE id = ? AND (wali_id = ? OR wali2_id = ?)`, [classId, user.id, user.id]);
  return !!r;
}

export async function canPublish(user: User, classId: number) {
  return user.role === "admin" || (await isWaliOf(user, classId));
}

/** Jumlah hari sekolah: 5 (Senin–Jumat, bawaan) atau 6 (Senin–Sabtu) */
export async function schoolDays() {
  const s = await getSettings();
  return Math.min(6, Math.max(5, Number(s.school_days || 5)));
}

/** "14 s.d. 18 September 2026" sesuai jumlah hari sekolah */
export async function weekLabel(weekStart: string) {
  return rentangIndo(weekStart, addDays(weekStart, (await schoolDays()) - 1));
}

const placeholders = (n: number) => Array(n).fill("?").join(",");

function groupBy<T>(rows: T[], key: (r: T) => number) {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const k = key(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

/**
 * Menyusun CALAKAN banyak kelas untuk satu pekan dengan jumlah query tetap
 * (tidak bertambah seiring jumlah kelas). Urutan hasil mengikuti classIds; kelas yang tidak ada dilewati.
 */
export async function buildWeeks(classIds: number[], weekStart: string, user: User | null) {
  const ids = [...new Set(classIds.filter((x) => Number.isInteger(x) && x > 0))];
  if (!ids.length) return [];
  const days = await schoolDays();
  const ph = placeholders(ids.length);
  const staff = user && (user.role === "guru" || user.role === "wali");

  const [classes, schedule, items, weeks, mine] = await Promise.all([
    q<any>(
      `SELECT c.*, u.name AS wali_name, u2.name AS wali2_name FROM classes c
         LEFT JOIN users u ON u.id = c.wali_id LEFT JOIN users u2 ON u2.id = c.wali2_id WHERE c.id IN (${ph})`,
      ids
    ),
    q<any>(
      `SELECT sc.id, sc.class_id, sc.hari, sc.urutan, sc.subject_id, sc.jam_mulai, sc.jam_selesai, sb.name AS subject,
              a.teacher_id, t.name AS teacher
         FROM schedules sc
         JOIN subjects sb ON sb.id = sc.subject_id
         LEFT JOIN assignments a ON a.subject_id = sc.subject_id AND a.class_id = sc.class_id
         LEFT JOIN users t ON t.id = a.teacher_id
        WHERE sc.class_id IN (${ph})
        ORDER BY sc.hari, sc.urutan, sc.id`,
      ids
    ),
    q<any>(
      `SELECT ci.*, sb.name AS subject, ub.name AS updated_by_name, a.teacher_id, t.name AS teacher
         FROM calakan_items ci
         JOIN subjects sb ON sb.id = ci.subject_id
         LEFT JOIN users ub ON ub.id = ci.updated_by
         LEFT JOIN assignments a ON a.subject_id = ci.subject_id AND a.class_id = ci.class_id
         LEFT JOIN users t ON t.id = a.teacher_id
        WHERE ci.class_id IN (${ph}) AND ci.week_start = ?
        ORDER BY ci.hari, ci.urutan, ci.id`,
      [...ids, weekStart]
    ),
    q<any>(
      `SELECT w.*, u.name AS published_by_name FROM calakan_weeks w LEFT JOIN users u ON u.id = w.published_by
        WHERE w.class_id IN (${ph}) AND w.week_start = ?`,
      [...ids, weekStart]
    ),
    staff
      ? q<any>(`SELECT subject_id, class_id FROM assignments WHERE teacher_id = ? AND class_id IN (${ph})`, [user!.id, ...ids])
      : Promise.resolve([] as any[]),
  ]);

  const clsById = new Map(classes.map((c) => [c.id, c]));
  const schedByClass = groupBy(schedule, (r) => r.class_id);
  const itemsByClass = groupBy(items, (r) => r.class_id);
  const weekByClass = new Map(weeks.map((w) => [w.class_id, w]));
  const mineByClass = groupBy(mine, (r) => r.class_id);

  const out = [];
  for (const id of ids) {
    const cls = clsById.get(id);
    if (!cls) continue;
    out.push(
      assembleWeek(cls, schedByClass.get(id) || [], itemsByClass.get(id) || [], weekByClass.get(id), new Set((mineByClass.get(id) || []).map((r) => r.subject_id)), user, days, weekStart)
    );
  }
  return out;
}

/** Menyusun CALAKAN satu kelas untuk satu pekan */
export async function buildWeek(classId: number, weekStart: string, user: User | null) {
  const [w] = await buildWeeks([classId], weekStart, user);
  if (!w) throw notFound("Kelas tidak ditemukan.");
  return w;
}

function assembleWeek(cls: any, schedule: any[], items: any[], week: any, mySubjects: Set<number>, user: User | null, schoolDays: number, weekStart: string) {
  cls.fase = faseOf(cls.tingkat);
  const isWali = !!user && user.role === "wali" && isHomeroomOf(cls, user.id);
  const canEdit = (subjectId: number, teacherId: number | null) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (user.role === "ortu") return false;
    if (mySubjects.has(subjectId)) return true;
    // Wali kelas boleh mengisi mapel di kelasnya yang belum punya pengampu
    return isWali && !teacherId;
  };

  const itemBySchedule = new Map<number, any>();
  const orphans: any[] = [];
  const scheduleIds = new Set(schedule.map((x) => x.id));
  for (const it of items) {
    if (it.schedule_id && scheduleIds.has(it.schedule_id)) itemBySchedule.set(it.schedule_id, it);
    else orphans.push(it);
  }

  const days: any[] = [];
  let total = 0,
    filled = 0,
    mine = 0,
    mineFilled = 0,
    lastUpdate: string | null = null;
  for (let h = 1; h <= schoolDays; h++) {
    const rows: Row[] = [];
    for (const sc of schedule.filter((x) => x.hari === h)) {
      const it = itemBySchedule.get(sc.id);
      rows.push({
        key: "s" + sc.id,
        schedule_id: sc.id,
        item_id: it?.id ?? null,
        subject_id: sc.subject_id,
        subject: sc.subject,
        teacher: sc.teacher,
        teacher_id: sc.teacher_id,
        jam: sc.jam_mulai ? `${sc.jam_mulai}${sc.jam_selesai ? "–" + sc.jam_selesai : ""}` : "",
        materi: it?.materi ?? "",
        kegiatan: it?.kegiatan ?? "",
        tugas: it?.tugas ?? "",
        keterangan: it?.keterangan ?? "",
        updated_at: it?.updated_at ?? null,
        updated_by_name: it?.updated_by_name ?? null,
        can_edit: canEdit(sc.subject_id, sc.teacher_id),
      });
    }
    for (const it of orphans.filter((x) => x.hari === h)) {
      rows.push({
        key: "i" + it.id,
        schedule_id: null,
        item_id: it.id,
        subject_id: it.subject_id,
        subject: it.subject,
        teacher: it.teacher,
        teacher_id: it.teacher_id,
        jam: "",
        materi: it.materi ?? "",
        kegiatan: it.kegiatan ?? "",
        tugas: it.tugas ?? "",
        keterangan: it.keterangan ?? "",
        updated_at: it.updated_at,
        updated_by_name: it.updated_by_name,
        can_edit: canEdit(it.subject_id, it.teacher_id),
      });
    }
    for (const r of rows) {
      total++;
      const f = !!(r.materi || r.kegiatan);
      if (f) filled++;
      if (r.can_edit) {
        mine++;
        if (f) mineFilled++;
      }
      if (r.updated_at && (!lastUpdate || r.updated_at > lastUpdate)) lastUpdate = r.updated_at;
    }
    days.push({ hari: h, name: DAY_NAMES[h], date: addDays(weekStart, h - 1), date_label: tglIndo(addDays(weekStart, h - 1)), rows });
  }

  const weekEnd = addDays(weekStart, schoolDays - 1);
  const status = week?.status || "draft";
  return {
    class: {
      id: cls.id,
      tingkat: cls.tingkat,
      rombel: cls.rombel,
      name: cls.name,
      kelompok: cls.kelompok,
      fase: cls.fase,
      wali_id: cls.wali_id,
      wali_name: cls.wali_name,
      wali2_id: cls.wali2_id,
      wali2_name: cls.wali2_name,
      label: `${cls.tingkat} ${cls.name}`,
    },
    week: {
      start: weekStart,
      end: weekEnd,
      label: rentangIndo(weekStart, weekEnd),
      status,
      published_at: week?.published_at ?? null,
      published_by_name: week?.published_by_name ?? null,
      has_changes: status === "published" && !!week?.has_changes,
      last_update: lastUpdate,
    },
    progress: { total, filled, mine, mine_filled: mineFilled },
    can_publish: !!user && (user.role === "admin" || isWali),
    days,
  };
}

type SaveRow = { schedule_id?: number; item_id?: number; materi?: string; kegiatan?: string; tugas?: string; keterangan?: string };

export async function saveRows(user: User, classId: number, weekStart: string, rows: SaveRow[]) {
  const data = await buildWeek(classId, weekStart, user);
  const all = data.days.flatMap((d: any) => d.rows.map((r: Row) => ({ ...r, hari: d.hari })));
  const bySchedule = new Map(all.filter((r) => r.schedule_id).map((r) => [r.schedule_id, r]));
  const byItem = new Map(all.filter((r) => r.item_id).map((r) => [r.item_id, r]));
  const schedules = await q<any>(`SELECT id, hari, urutan, subject_id FROM schedules WHERE class_id = ?`, [classId]);
  const scMap = new Map(schedules.map((s) => [s.id, s]));

  let saved = 0;
  for (const r of rows) {
    const target = r.schedule_id ? bySchedule.get(Number(r.schedule_id)) : r.item_id ? byItem.get(Number(r.item_id)) : null;
    if (!target) throw bad("Baris rencana tidak ditemukan. Muat ulang halaman lalu coba lagi.");
    if (!target.can_edit) throw forbidden(`Anda tidak mengampu ${target.subject} di kelas ini.`);
    const vals = [str(r.materi, 2000), str(r.kegiatan, 2000), str(r.tugas, 2000), str(r.keterangan, 1000)];
    const changed =
      vals[0] !== target.materi || vals[1] !== target.kegiatan || vals[2] !== target.tugas || vals[3] !== target.keterangan;
    if (!changed) continue;
    if (target.schedule_id) {
      const sc = scMap.get(target.schedule_id);
      await exec(
        `INSERT INTO calakan_items (class_id, week_start, schedule_id, hari, subject_id, urutan, materi, kegiatan, tugas, keterangan, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE materi = VALUES(materi), kegiatan = VALUES(kegiatan), tugas = VALUES(tugas),
           keterangan = VALUES(keterangan), updated_by = VALUES(updated_by), updated_at = NOW()`,
        [classId, weekStart, sc.id, sc.hari, sc.subject_id, sc.urutan, ...vals, user.id]
      );
    } else {
      await exec(
        `UPDATE calakan_items SET materi = ?, kegiatan = ?, tugas = ?, keterangan = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND class_id = ?`,
        [...vals, user.id, target.item_id, classId]
      );
    }
    saved++;
  }
  if (saved) {
    await exec(`INSERT IGNORE INTO calakan_weeks (class_id, week_start, status) VALUES (?, ?, 'draft')`, [classId, weekStart]);
    await exec(`UPDATE calakan_weeks SET has_changes = 1 WHERE class_id = ? AND week_start = ? AND status = 'published'`, [classId, weekStart]);
  }
  return saved;
}

/** Salin isian (hanya ke baris kosong yang boleh diedit) dari kelas/pekan lain */
export async function copyRows(user: User, classId: number, weekStart: string, fromClassId: number, fromWeek: string) {
  const target = await buildWeek(classId, weekStart, user);
  const source = await buildWeek(fromClassId, fromWeek, null);
  const pick = (days: any[]) => {
    const m = new Map<string, Row>();
    for (const d of days) {
      const count: Record<number, number> = {};
      for (const r of d.rows as Row[]) {
        count[r.subject_id] = (count[r.subject_id] || 0) + 1;
        m.set(`${d.hari}:${r.subject_id}:${count[r.subject_id]}`, r);
      }
    }
    return m;
  };
  const src = pick(source.days);
  const toSave: SaveRow[] = [];
  for (const d of target.days) {
    const count: Record<number, number> = {};
    for (const r of d.rows as Row[]) {
      count[r.subject_id] = (count[r.subject_id] || 0) + 1;
      if (!r.can_edit || r.materi || r.kegiatan || r.tugas) continue;
      const s = src.get(`${d.hari}:${r.subject_id}:${count[r.subject_id]}`);
      if (!s || !(s.materi || s.kegiatan || s.tugas)) continue;
      toSave.push({
        schedule_id: r.schedule_id ?? undefined,
        item_id: r.schedule_id ? undefined : r.item_id ?? undefined,
        materi: s.materi,
        kegiatan: s.kegiatan,
        tugas: s.tugas,
        keterangan: s.keterangan,
      });
    }
  }
  return saveRows(user, classId, weekStart, toSave);
}
