import mysql from "mysql2/promise";
import { config } from "./config";

let pool: mysql.Pool;

export function getPool() {
  return pool;
}

/** SELECT banyak baris */
export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** SELECT satu baris (atau null) */
export async function one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

/** INSERT/UPDATE/DELETE */
export async function exec(sql: string, params: any[] = []) {
  const [res] = await pool.query(sql, params);
  return res as mysql.ResultSetHeader;
}

/** Jalankan beberapa query dalam satu transaksi */
export async function tx<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS settings (
    k VARCHAR(64) NOT NULL PRIMARY KEY,
    v MEDIUMTEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tingkat TINYINT NOT NULL,
    rombel VARCHAR(10) NOT NULL,
    name VARCHAR(120) NOT NULL,
    kelompok VARCHAR(60) NULL,
    wali_id INT NULL,
    wali2_id INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_rombel (rombel)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NULL,
    nis VARCHAR(30) NOT NULL,
    name VARCHAR(150) NOT NULL,
    gender ENUM('L','P') NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nis (nis),
    KEY idx_class (class_id),
    CONSTRAINT fk_students_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(150) NOT NULL,
    role ENUM('admin','wali','guru','ortu') NOT NULL,
    student_id INT NULL,
    nip VARCHAR(40) NULL,
    phone VARCHAR(30) NULL,
    gender ENUM('L','P') NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    last_login DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_username (username),
    UNIQUE KEY uq_student (student_id),
    KEY idx_role (role),
    CONSTRAINT fk_users_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    kode VARCHAR(20) NULL,
    urutan INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_subject (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    class_id INT NOT NULL,
    UNIQUE KEY uq_subject_class (subject_id, class_id),
    KEY idx_teacher (teacher_id),
    CONSTRAINT fk_as_teacher FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_as_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_as_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    hari TINYINT NOT NULL,
    subject_id INT NOT NULL,
    urutan INT NOT NULL DEFAULT 0,
    jam_mulai VARCHAR(5) NULL,
    jam_selesai VARCHAR(5) NULL,
    KEY idx_class_day (class_id, hari, urutan),
    CONSTRAINT fk_sc_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_sc_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS calakan_weeks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    week_start DATE NOT NULL,
    status ENUM('draft','published') NOT NULL DEFAULT 'draft',
    published_at DATETIME NULL,
    published_by INT NULL,
    has_changes TINYINT(1) NOT NULL DEFAULT 0,
    UNIQUE KEY uq_class_week (class_id, week_start),
    CONSTRAINT fk_cw_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS calakan_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    week_start DATE NOT NULL,
    schedule_id INT NULL,
    hari TINYINT NOT NULL,
    subject_id INT NOT NULL,
    urutan INT NOT NULL DEFAULT 0,
    materi TEXT NULL,
    kegiatan TEXT NULL,
    tugas TEXT NULL,
    keterangan TEXT NULL,
    updated_by INT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slot (class_id, week_start, schedule_id),
    KEY idx_week (class_id, week_start),
    CONSTRAINT fk_ci_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_ci_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_ci_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user (user_id),
    CONSTRAINT fk_sess_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NULL,
    url VARCHAR(255) NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_user_read (user_id, is_read),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  // Tugas terjadwal (pengingat & terbit otomatis) yang sudah dijalankan — mencegah push terkirim dua kali
  `CREATE TABLE IF NOT EXISTS job_runs (
    job_key VARCHAR(80) NOT NULL PRIMARY KEY,
    ran_at DATETIME NOT NULL,
    result TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_endpoint (endpoint_hash),
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Relasi wali kelas ditambahkan setelah tabel users ada
const LATE_FK = `ALTER TABLE classes ADD CONSTRAINT fk_class_wali FOREIGN KEY (wali_id) REFERENCES users(id) ON DELETE SET NULL`;

export const DEFAULT_SUBJECTS = [
  ["Aku Anak Disiplin", "AAD"],
  ["Upacara Bendera", "UPC"],
  ["GLS", "GLS"],
  ["Tahfiz", "THF"],
  ["Tilawati", "TLW"],
  ["Hadis dan Doa", "HDS"],
  ["PAI dan BP", "PAI"],
  ["Tauhid", "THD"],
  ["B. Indonesia", "BIN"],
  ["B. Sunda", "BSD"],
  ["B. Arab", "BAR"],
  ["B. Inggris", "BIG"],
  ["Matematika", "MTK"],
  ["Pendidikan Pancasila", "PPKN"],
  ["PJOK", "PJOK"],
  ["Seni Rupa", "SR"],
  ["Menulis Latin", "ML"],
  ["Kokurikuler", "KOK"],
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  app_name: "CALAKAN",
  app_subtitle: "Rencana Pembelajaran Sepekan",
  school_name: "SDIT Bahtera Nuh",
  primary_color: "#0f766e",
  school_days: "5",
  kepala_sekolah: "",
  kota: "",
  favicon: "",
  logo: "",
  footer_text: "",
};

export async function initDb() {
  const { timezone, ...conn } = config.db;
  // 1) Pastikan database ada (akun MySQL production sering tidak boleh CREATE DATABASE; cukup bila sudah ada)
  const boot = await mysql.createConnection({ host: conn.host, port: conn.port, user: conn.user, password: conn.password });
  try {
    await boot.query(
      `CREATE DATABASE IF NOT EXISTS \`${conn.database.replace(/`/g, "")}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (e: any) {
    if (e?.code !== "ER_DBACCESS_DENIED_ERROR" && e?.code !== "ER_ACCESS_DENIED_ERROR") throw e;
  } finally {
    await boot.end();
  }

  pool = mysql.createPool({
    ...conn,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: "utf8mb4",
    multipleStatements: false,
  });
  // Setiap koneksi memakai zona waktu sekolah (NOW(), DEFAULT CURRENT_TIMESTAMP)
  (pool as any).pool.on("connection", (c: any) => c.query("SET time_zone = ?", [timezone]));

  // 2) Tabel
  for (const sql of SCHEMA) await exec(sql);
  const fk = await one(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND CONSTRAINT_NAME = 'fk_class_wali'`
  );
  if (!fk) await exec(LATE_FK);
  // Wali kelas pendamping (khusus Fase A: tingkat 1–2)
  const w2 = await one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND COLUMN_NAME = 'wali2_id'`
  );
  if (!w2) await exec(`ALTER TABLE classes ADD COLUMN wali2_id INT NULL AFTER wali_id`);
  const fk2 = await one(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes' AND CONSTRAINT_NAME = 'fk_class_wali2'`
  );
  if (!fk2) await exec(`ALTER TABLE classes ADD CONSTRAINT fk_class_wali2 FOREIGN KEY (wali2_id) REFERENCES users(id) ON DELETE SET NULL`);
  const col = await one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'calakan_weeks' AND COLUMN_NAME = 'has_changes'`
  );
  if (!col) await exec(`ALTER TABLE calakan_weeks ADD COLUMN has_changes TINYINT(1) NOT NULL DEFAULT 0`);
  const mcp = await one(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_pw'`
  );
  if (!mcp) await exec(`ALTER TABLE users ADD COLUMN must_change_pw TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active`);
  // Token sesi kini disimpan sebagai hash: sesi format lama tidak berlaku lagi (pengguna masuk ulang sekali)
  const sv = await one<{ v: string }>(`SELECT v FROM settings WHERE k = 'session_format'`);
  if (sv?.v !== "2") {
    await exec(`DELETE FROM sessions`);
    await exec(`INSERT INTO settings (k, v) VALUES ('session_format', '2') ON DUPLICATE KEY UPDATE v = '2'`);
  }

  // 3) Data awal
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await exec(`INSERT IGNORE INTO settings (k, v) VALUES (?, ?)`, [k, v]);
  }
  const subjCount = await one<{ n: number }>(`SELECT COUNT(*) n FROM subjects`);
  if (!subjCount?.n) {
    let i = 1;
    for (const [name, kode] of DEFAULT_SUBJECTS) {
      await exec(`INSERT INTO subjects (name, kode, urutan) VALUES (?, ?, ?)`, [name, kode, i++]);
    }
  }
  const admin = await one(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (!admin) {
    const hash = await Bun.password.hash("admin123");
    await exec(`INSERT INTO users (username, password_hash, name, role, must_change_pw) VALUES ('admin', ?, 'Administrator', 'admin', 1)`, [hash]);
    console.log("  » Akun admin awal dibuat → username: admin | password: admin123 (segera ganti!)");
  }
  await exec(`DELETE FROM sessions WHERE expires_at < NOW()`);
}

export const ALL_TABLES = [
  "settings",
  "classes",
  "students",
  "users",
  "subjects",
  "assignments",
  "schedules",
  "calakan_weeks",
  "calakan_items",
  "notifications",
  "push_subscriptions",
  "job_runs",
];
