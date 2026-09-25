/**
 * Data contoh (demo) berdasarkan spreadsheet CALAKAN FASE A.
 * Jalankan:  bun run demo
 * PERINGATAN: menambahkan kelas, guru, siswa & jadwal contoh ke database.
 */
import { initDb, q, one, exec } from "../src/db";

await initDb();

const exists = await one(`SELECT id FROM classes WHERE rombel = '1A'`);
if (exists) {
  console.log("Data demo tampaknya sudah ada (rombel 1A ditemukan). Dibatalkan.");
  process.exit(0);
}

const sid = async (name: string) => (await one<any>(`SELECT id FROM subjects WHERE name = ?`, [name]))!.id;
const hash = await Bun.password.hash("guru123");

async function user(username: string, name: string, role: string, gender = "L") {
  const r = await exec(`INSERT INTO users (username, password_hash, name, role, gender) VALUES (?, ?, ?, ?, ?)`, [username, hash, name, role, gender]);
  return r.insertId;
}

// ——— Kelas & wali ———
const kelas = [
  { rombel: "1A", tingkat: 1, name: "Abu Bakar Ash-Shiddiq", wali: ["wali1a", "Ustadzah Siti Aminah", "P"] },
  { rombel: "1B", tingkat: 1, name: "Umar bin Khattab", wali: ["wali1b", "Ustadz Ahmad Fauzi", "L"] },
  { rombel: "2A", tingkat: 2, name: "Utsman bin Affan", wali: ["wali2a", "Ustadzah Nur Hasanah", "P"] },
  { rombel: "2B", tingkat: 2, name: "Ali bin Abi Thalib", wali: ["wali2b", "Ustadz Rizki Maulana", "L"] },
];
const classId: Record<string, number> = {};
const waliId: Record<string, number> = {};
for (const k of kelas) {
  const w = await user(k.wali[0], k.wali[1], "wali", k.wali[2]);
  const r = await exec(`INSERT INTO classes (tingkat, rombel, name, kelompok, wali_id) VALUES (?, ?, ?, 'Kelas Shigor', ?)`, [k.tingkat, k.rombel, k.name, w]);
  classId[k.rombel] = r.insertId;
  waliId[k.rombel] = w;
}

// Kelas 1 & 2 (Fase A) boleh punya wali pendamping
const pendamping1a = await user("wali1a2", "Ustadzah Rahmawati", "wali", "P");
await exec(`UPDATE classes SET wali2_id = ? WHERE id = ?`, [pendamping1a, classId["1A"]]);

// ——— Guru mapel ———
const gTahfiz = await user("guru.tahfiz", "Ustadz Hafidz Ramadhan", "guru");
const gPjok = await user("guru.pjok", "Pak Dedi Kurniawan", "guru");
const gBahasa = await user("guru.bahasa", "Ustadzah Laila Fitriani", "guru", "P");

const wali = ["Aku Anak Disiplin", "Upacara Bendera", "GLS", "B. Indonesia", "B. Sunda", "Hadis dan Doa", "Seni Rupa", "Matematika", "Tilawati", "Pendidikan Pancasila", "PAI dan BP", "Tauhid", "Menulis Latin", "Kokurikuler"];
for (const r of Object.keys(classId)) {
  for (const s of wali) await exec(`INSERT INTO assignments (teacher_id, subject_id, class_id) VALUES (?, ?, ?)`, [waliId[r], await sid(s), classId[r]]);
  await exec(`INSERT INTO assignments (teacher_id, subject_id, class_id) VALUES (?, ?, ?)`, [gTahfiz, await sid("Tahfiz"), classId[r]]);
  await exec(`INSERT INTO assignments (teacher_id, subject_id, class_id) VALUES (?, ?, ?)`, [gPjok, await sid("PJOK"), classId[r]]);
  await exec(`INSERT INTO assignments (teacher_id, subject_id, class_id) VALUES (?, ?, ?)`, [gBahasa, await sid(r.startsWith("1") ? "B. Arab" : "B. Inggris"), classId[r]]);
}

// ——— Siswa + akun orang tua (username & password = NIS) ———
const namaSiswa = ["Muhammad Alfatih", "Aisyah Zahra", "Hasan Albana", "Fatimah Azzahra", "Umar Abdullah", "Khadijah Nur", "Zaid Hamdan", "Maryam Salsabila"];
let nis = 2026001;
for (const r of Object.keys(classId)) {
  for (let i = 0; i < 6; i++) {
    const nm = namaSiswa[(i + Object.keys(classId).indexOf(r) * 2) % namaSiswa.length];
    const g = i % 2 ? "P" : "L";
    const res = await exec(`INSERT INTO students (nis, name, gender, class_id) VALUES (?, ?, ?, ?)`, [String(nis), nm, g, classId[r]]);
    await exec(`INSERT INTO users (username, password_hash, name, role, student_id) VALUES (?, ?, ?, 'ortu', ?)`, [String(nis), await Bun.password.hash(String(nis)), nm, res.insertId]);
    nis++;
  }
}

// ——— Jadwal + isi CALAKAN pekan 14–18 September 2026 (dari spreadsheet) ———
type R = [string, string?, string?, string?, string?];
const fase1: Record<number, R[]> = {
  1: [
    ["Aku Anak Disiplin", "Kerapihan seragam dan kelengkapan atribut", "Memeriksa kerapihan seragam dan kelengkapan atribut", "Kuku sudah terpotong rapi", "-"],
    ["Upacara Bendera", "Upacara Senin pagi", "Mengikuti upacara Senin pagi", "Upacara Senin pagi di lapang", "-"],
    ["GLS", "Nama-nama surat dalam Al-Qur'an 1-3", "Menyanyikan lagu nama-nama surat", "Menulis nama surat beserta artinya", "-"],
    ["B. Indonesia", "Pelajaran 3 Bersikap Santun", "Menjelaskan sikap dan ucapan santun", "Mengerjakan latihan di buku paket"],
    ["B. Sunda", "Evaluasi 2", "Mengerjakan evaluasi 2 bersama-sama"],
    ["Hadis dan Doa", "STS Praktik Hadis dan Doa", "Setor hafalan Hadis ke-1 s.d. Hadis ke-4", "Menghafalkan Hadis ke-1 s.d. Hadis ke-4"],
    ["Seni Rupa", "Mengenal unsur garis", "Membuat berbagai macam garis dari benang wol", "Membuat garis dari benang wol"],
  ],
  2: [
    ["GLS", "Salat Duha", "Salat Duha di masjid", "Mengerjakan salat Duha"],
    ["Tahfiz", "Surah an-Naba'", "Murajaah dan ziyadah surah an-Naba' ayat 18"],
    ["PJOK", "STS Praktik PJOK", "Gerak non lokomotor"],
    ["Matematika", "Pelajaran 3 Pengurangan bilangan", "Mengenalkan pengurangan bilangan", "Mengerjakan latihan di buku paket bersama-sama"],
    ["Tilawati", "Tilawati Jilid 1 Hal. 1"],
    ["Pendidikan Pancasila", "Pelajaran 2 Nyaman karena Patuh Aturan", "Menjelaskan manfaat patuh aturan", "Menulis aturan yang ada di rumah"],
  ],
  3: [
    ["Tahfiz", "Surah an-Naba'", "STS Praktik surah an-Naba'", "Hafalkan surah an-Naba' ayat 1-13"],
    ["PAI dan BP", "Pelajaran 3 (melanjutkan materi)", "Perilaku anak muslim"],
    ["B. Arab", "Review materi", "Mengerjakan latihan soal"],
    ["Matematika", "Pasangan bilangan dalam pengurangan", "Mengerjakan latihan di buku paket"],
    ["Tilawati", "STS Praktik Tilawati", "Membaca Tilawati jilid 1"],
  ],
  4: [["GLS"], ["Tahfiz"], ["B. Indonesia"], ["Matematika"], ["Tilawati"]],
  5: [["GLS"], ["Tahfiz"], ["PAI dan BP"], ["Seni Rupa"]],
};
const fase2: Record<number, R[]> = {
  1: [
    ["Aku Anak Disiplin", "Pengkondisian dan pemeriksaan kelengkapan atribut", "Pemeriksaan kuku"],
    ["Upacara Bendera"],
    ["GLS", "Modul keagamaan", "Iman kepada Rasul (lanjutan)"],
    ["Kokurikuler", "Jurnal kebiasaan baik anak Indonesia hebat", "Manfaat berolahraga"],
    ["B. Indonesia", "Evaluasi Pembelajaran 2", "Mengerjakan evaluasi bersama-sama"],
    ["Hadis dan Doa", "STS hadis ke-3 dan 4", "Tes lisan (praktik) hafalan hadis 3 dan 4", "Menghafalkan hadis 3 dan 4"],
    ["Seni Rupa", "Pembelajaran 2 (Warna menciptakan suasana)", "Menyimak penjelasan tentang warna dan suasana"],
  ],
  2: [
    ["GLS", "Kunjungan ke taman baca", "Membaca bersama"],
    ["Tahfiz", "Q.S. 'Abasa", "Murajaah Q.S. 'Abasa dan setoran ayat 1-25", "Setoran Q.S. 'Abasa ayat 1-25"],
    ["B. Sunda", "Pangajaran 2 (Salawasna Sehat)", "Ngaregepkeun bacaan"],
    ["Menulis Latin", "Melanjutkan", "Menyalin huruf latin ke huruf sambung"],
    ["PJOK", "STS Praktik PJOK", "Kombinasi gerak non lokomotor & lokomotor"],
    ["Tilawati", "STS semester 1", "Tes bacaan jilid 2 dan 3"],
    ["Pendidikan Pancasila", "Melanjutkan pembelajaran 2", "Pentingnya mematuhi aturan"],
  ],
  3: [
    ["Tahfiz", "Q.S. 'Abasa", "STS Praktik Q.S. 'Abasa ayat 1-17"],
    ["B. Inggris", "Number", "Review materi", "-"],
    ["Tauhid", "Allah Maha Pengasih dan Penyayang", "Review materi", "", "-"],
    ["B. Indonesia", "Pembelajaran 3 (Keselamatan Diri)", "Memahami rambu-rambu lalu lintas"],
    ["Tilawati", "Jilid 2 dan 3", "Membaca bersama dan membaca simak"],
  ],
  4: [["GLS"], ["Tahfiz"], ["Matematika"], ["Tilawati"]],
  5: [["GLS"], ["Tahfiz"], ["PAI dan BP"], ["Seni Rupa"]],
};

const WEEK = "2026-09-14";
for (const r of Object.keys(classId)) {
  const plan = r.startsWith("1") ? fase1 : fase2;
  for (const [hari, rows] of Object.entries(plan)) {
    let u = 1;
    for (const row of rows) {
      const subj = await sid(row[0]);
      const s = await exec(`INSERT INTO schedules (class_id, hari, subject_id, urutan) VALUES (?, ?, ?, ?)`, [classId[r], Number(hari), subj, u]);
      if (row[1]) {
        await exec(
          `INSERT INTO calakan_items (class_id, week_start, schedule_id, hari, subject_id, urutan, materi, kegiatan, tugas, keterangan, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [classId[r], WEEK, s.insertId, Number(hari), subj, u, row[1] || "", row[2] || "", row[3] || "", row[4] || "", waliId[r]]
        );
      }
      u++;
    }
  }
  await exec(`INSERT INTO calakan_weeks (class_id, week_start, status) VALUES (?, ?, 'draft')`, [classId[r], WEEK]);
}
// 1A langsung diterbitkan sebagai contoh
await exec(`UPDATE calakan_weeks SET status = 'published', published_at = NOW(), published_by = ? WHERE class_id = ? AND week_start = ?`, [waliId["1A"], classId["1A"], WEEK]);

console.log(`
✔ Data demo berhasil dibuat.
  Wali kelas : wali1a, wali1b, wali2a, wali2b        (password: guru123)
  Pendamping : wali1a2 (kelas 1A)                    (password: guru123)
  Guru mapel : guru.tahfiz, guru.pjok, guru.bahasa   (password: guru123)
  Orang tua  : NIS 2026001 s.d. 2026024               (password = NIS)
  Pekan contoh: 14–18 September 2026
`);
process.exit(0);
