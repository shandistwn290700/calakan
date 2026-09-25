export class HttpError extends Error {
  status: number;
  extra?: any;
  constructor(status: number, message: string, extra?: any) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (msg: string, extra?: any) => new HttpError(400, msg, extra);
export const forbidden = (msg = "Anda tidak memiliki akses ke fitur ini.") => new HttpError(403, msg);
export const notFound = (msg = "Data tidak ditemukan.") => new HttpError(404, msg);

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseYMD(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return isNaN(d.getTime()) ? null : d;
}

/** Senin dari pekan yang memuat tanggal s (default: hari ini) */
export function mondayOf(s?: string) {
  const d = (s && parseYMD(s)) || new Date();
  d.setHours(12, 0, 0, 0);
  const dow = d.getDay(); // 0 = Minggu
  const diff = dow === 0 ? 1 : 1 - dow; // Minggu -> Senin berikutnya
  d.setDate(d.getDate() + diff);
  return toYMD(d);
}

export function addDays(ymd: string, n: number) {
  const d = parseYMD(ymd)!;
  d.setDate(d.getDate() + n);
  return toYMD(d);
}

export function tglIndo(ymd: string) {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14 s.d. 18 September 2026" */
export function rentangIndo(start: string, end: string) {
  const a = parseYMD(start)!;
  const b = parseYMD(end)!;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
    return `${a.getDate()} s.d. ${b.getDate()} ${BULAN[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear())
    return `${a.getDate()} ${BULAN[a.getMonth()]} s.d. ${b.getDate()} ${BULAN[b.getMonth()]} ${b.getFullYear()}`;
  return `${tglIndo(start)} s.d. ${tglIndo(end)}`;
}

/** Versi ringkas untuk judul notifikasi: "14–18 Sep", "29 Sep–3 Okt", "29 Des 2026–2 Jan 2027" */
export function rentangSingkat(start: string, end: string) {
  const a = parseYMD(start)!;
  const b = parseYMD(end)!;
  const bl = (d: Date) => BULAN[d.getMonth()].slice(0, 3);
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${bl(a)} ${a.getFullYear()}–${b.getDate()} ${bl(b)} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${bl(a)}–${b.getDate()} ${bl(b)}`;
  return `${a.getDate()}–${b.getDate()} ${bl(b)}`;
}

export function str(v: any, max = 1000) {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, max);
}

export function int(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Wali kelas pendamping hanya untuk Fase A (kelas 1 dan 2) */
export const MAX_TINGKAT_WALI2 = 2;
export const allowsWali2 = (tingkat: number) => tingkat >= 1 && tingkat <= MAX_TINGKAT_WALI2;

export function faseOf(tingkat: number) {
  if (tingkat <= 2) return "A";
  if (tingkat <= 4) return "B";
  return "C";
}
