/**
 * Jadwal pengisian & penerbitan CALAKAN (semua waktu dalam WIB, tidak bergantung zona waktu server):
 *   Kamis 10.00 – Jumat 13.00  wali kelas & guru mengisi CALAKAN PEKAN DEPAN
 *   Kamis 10.00, Jumat 10.00, Jumat 12.00  push pengingat ke yang belum lengkap
 *   Sabtu 19.00  semua kelas yang terisi terbit otomatis + push ke orang tua
 * Di luar jendela itu hanya admin (Waka Kurikulum) yang dapat mengubah isian.
 */
import { q, exec } from "./db";
import type { User } from "./auth";
import { now } from "./clock";
import { accessibleClasses, buildWeeks, publishWeek } from "./calakan";
import { notifyUsers } from "./push";
import { getSettings } from "./settings";
import { addDays, rentangSingkat, BULAN } from "./util";

const WIB_MS = 7 * 3600e3;
const pad = (n: number) => String(n).padStart(2, "0");
const HARI_WIB = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Date untuk tanggal (YYYY-MM-DD) pukul hh:mm WIB */
export const atWib = (ymd: string, hh: number, mm = 0) => new Date(`${ymd}T${pad(hh)}:${pad(mm)}:00+07:00`);

function wibParts(t: Date) {
  const w = new Date(t.getTime() + WIB_MS);
  return { ymd: w.toISOString().slice(0, 10), dow: w.getUTCDay() };
}

/** "Kamis, 1 Oktober pukul 10.00 WIB" */
export function waktuWib(t: Date) {
  const w = new Date(t.getTime() + WIB_MS);
  return `${HARI_WIB[w.getUTCDay()]}, ${w.getUTCDate()} ${BULAN[w.getUTCMonth()]} pukul ${pad(w.getUTCHours())}.${pad(w.getUTCMinutes())} WIB`;
}

/** Siklus mingguan yang memuat waktu t (Senin–Minggu WIB) */
export function cycle(t = now()) {
  const { ymd, dow } = wibParts(t);
  const monday = addDays(ymd, dow === 0 ? -6 : 1 - dow);
  const kamis = addDays(monday, 3), jumat = addDays(monday, 4), sabtu = addDays(monday, 5);
  return {
    monday,
    /** pekan yang diisi pada siklus ini */
    target: addDays(monday, 7),
    openAt: atWib(kamis, 10),
    remindAt: atWib(jumat, 10),
    lastCallAt: atWib(jumat, 12),
    closeAt: atWib(jumat, 13),
    publishAt: atWib(sabtu, 19),
    endAt: atWib(addDays(monday, 7), 0),
  };
}

const shift = (t: Date, days: number) => new Date(t.getTime() + days * 86400e3);

/** Status jendela pengisian saat ini */
export function fillWindow(t = now()) {
  const c = cycle(t);
  const open = t >= c.openAt && t < c.closeAt;
  // jendela berikutnya/berjalan & pekan terakhir yang pengisiannya sudah ditutup
  const next = t < c.closeAt ? c : cycle(shift(c.openAt, 7));
  const lastClosedTarget = t >= c.closeAt ? c.target : c.monday;
  return { open, target: next.target, openAt: next.openAt, closeAt: next.closeAt, publishAt: next.publishAt, lastClosedTarget };
}

export function windowInfo(t = now()) {
  const w = fillWindow(t);
  return {
    open: w.open,
    target_week: w.target,
    target_label: rentangSingkat(w.target, addDays(w.target, 4)),
    open_at: w.openAt.toISOString(),
    close_at: w.closeAt.toISOString(),
    publish_at: w.publishAt.toISOString(),
    open_label: waktuWib(w.openAt),
    close_label: waktuWib(w.closeAt),
    publish_label: waktuWib(w.publishAt),
    last_closed_week: w.lastClosedTarget,
    now: t.toISOString(),
  };
}

/** Jumlah rencana milik pengguna (guru/wali) pada suatu pekan dan yang sudah terisi */
export async function myProgress(user: User, week: string) {
  const ids = ((await accessibleClasses(user)) as any[]).map((c) => c.id);
  const weeks = await buildWeeks(ids, week, user);
  let mine = 0, filled = 0;
  for (const w of weeks) {
    mine += w.progress.mine;
    filled += w.progress.mine_filled;
  }
  return { mine, filled, pending: mine - filled };
}

export type EditLock = { message: string; contact_admin: boolean; pending: number } | null;

/** null = boleh diisi; selain itu berisi alasan terkunci untuk wali/guru */
export async function editLock(user: User, week: string, t = now()): Promise<EditLock> {
  if (user.role === "admin") return null;
  const w = fillWindow(t);
  const pekan = rentangSingkat(week, addDays(week, 4));
  if (w.open && week === w.target) return null;
  if (week <= w.lastClosedTarget) {
    // Pengisian pekan ini sudah lewat: hanya Waka Kurikulum/Admin
    const p = await myProgress(user, week);
    return {
      pending: p.pending,
      contact_admin: true,
      message: p.pending
        ? `Waktu pengisian CALAKAN pekan ${pekan} sudah ditutup. Masih ada ${p.pending} rencana Anda yang belum terisi. Hubungi Waka Kurikulum/Admin untuk mengisinya.`
        : `Waktu pengisian CALAKAN pekan ${pekan} sudah ditutup. Perubahan hanya dapat dilakukan oleh Waka Kurikulum/Admin.`,
    };
  }
  if (week === w.target)
    return { pending: 0, contact_admin: false, message: `Pengisian CALAKAN pekan ${pekan} dibuka ${waktuWib(w.openAt)} sampai ${waktuWib(w.closeAt)}.` };
  if (w.open)
    return { pending: 0, contact_admin: false, message: `Saat ini yang dapat diisi hanya CALAKAN pekan ${rentangSingkat(w.target, addDays(w.target, 4))}.` };
  return { pending: 0, contact_admin: false, message: `CALAKAN pekan ${pekan} belum dapat diisi. Pengisian dibuka hari Kamis–Jumat sebelum pekan tersebut.` };
}

// ——————————————— Tugas terjadwal ———————————————

type Kind = "buka" | "ingat" | "akhir";

/** Push ke wali kelas & guru yang rencananya untuk pekan target belum lengkap */
export async function remindTeachers(target: string, kind: Kind) {
  const s = await getSettings();
  const app = s.app_name || "CALAKAN";
  const pekan = rentangSingkat(target, addDays(target, 4));
  const users = await q<User>(
    `SELECT id, username, name, role, student_id, is_active, must_change_pw FROM users WHERE role IN ('wali','guru') AND is_active = 1`
  );
  let sent = 0;
  for (const u of users) {
    const p = await myProgress(u, target);
    if (!p.mine || !p.pending) continue;
    const msg = {
      buka: { title: `${app} ${pekan} dibuka`, body: `Silakan isi ${p.pending} rencana pembelajaran Anda paling lambat Jumat pukul 13.00 WIB.` },
      ingat: { title: `Pengingat: ${app} ${pekan}`, body: `Masih ada ${p.pending} rencana yang belum Anda isi. Batas pengisian Jumat pukul 13.00 WIB.` },
      akhir: {
        title: `1 jam lagi ${app} ${pekan} ditutup`,
        body: `${p.pending} rencana belum terisi. Setelah pukul 13.00 WIB, pengisian hanya dapat dilakukan oleh Waka Kurikulum/Admin.`,
      },
    }[kind];
    await notifyUsers([u.id], { ...msg, url: `/#/isi?week=${target}`, tag: `isi-${target}` });
    sent++;
  }
  return { sent };
}

/** Sabtu 19.00: terbitkan semua kelas yang sudah terisi untuk pekan target, lalu kabari orang tua */
export async function autoPublish(target: string) {
  const classes = await q<any>(`SELECT id FROM classes ORDER BY tingkat, rombel`);
  const weeks = await buildWeeks(classes.map((c) => c.id), target, null);
  const out = { published: 0, skippedEmpty: [] as string[], notified: 0 };
  for (const w of weeks) {
    if (!w.progress.filled) {
      out.skippedEmpty.push(w.class.rombel);
      continue;
    }
    // Sudah terbit & tidak ada perubahan (mis. diterbitkan admin lebih dulu) → orang tua sudah tahu
    if (w.week.status === "published" && !w.week.has_changes) continue;
    const r = await publishWeek(w.class.id, target, null);
    if (r) {
      out.published++;
      out.notified += r.saved;
    }
  }
  return out;
}

function jobsFor(c: ReturnType<typeof cycle>) {
  return [
    { key: `buka:${c.target}`, at: c.openAt, until: c.remindAt, run: () => remindTeachers(c.target, "buka") },
    { key: `ingat:${c.target}`, at: c.remindAt, until: c.lastCallAt, run: () => remindTeachers(c.target, "ingat") },
    { key: `akhir:${c.target}`, at: c.lastCallAt, until: c.closeAt, run: () => remindTeachers(c.target, "akhir") },
    // bila server sempat mati pukul 19.00, penerbitan tetap dijalankan sampai Senin 00.00
    { key: `terbit:${c.target}`, at: c.publishAt, until: c.endAt, run: () => autoPublish(c.target) },
  ];
}

/** Jalankan tugas yang sudah jatuh tempo. Setiap tugas hanya sekali (dicatat di tabel job_runs). */
export async function tick(t = now()) {
  const ran: any[] = [];
  for (const job of jobsFor(cycle(t))) {
    if (t < job.at || t >= job.until) continue;
    const claim = await exec(`INSERT IGNORE INTO job_runs (job_key, ran_at) VALUES (?, NOW())`, [job.key]);
    if (!claim.affectedRows) continue;
    try {
      const result = await job.run();
      await exec(`UPDATE job_runs SET result = ? WHERE job_key = ?`, [JSON.stringify(result).slice(0, 1000), job.key]);
      console.log(`[jadwal] ${job.key}`, JSON.stringify(result));
      ran.push({ job: job.key, ...result });
    } catch (e: any) {
      // gagal → hapus catatan agar dicoba lagi pada menit berikutnya
      await exec(`DELETE FROM job_runs WHERE job_key = ?`, [job.key]);
      console.error(`[jadwal] ${job.key} gagal:`, e?.message || e);
    }
  }
  return ran;
}

export function startScheduler() {
  const run = () => tick().catch((e) => console.error("[jadwal]", e?.message || e));
  run();
  return setInterval(run, 60_000);
}
