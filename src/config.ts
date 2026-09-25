// Bun otomatis membaca file .env
const env = Bun.env;

export const config = {
  port: Number(env.PORT || 3000),
  // DB_* untuk XAMPP/server sendiri; MYSQL* adalah variabel bawaan layanan MySQL di Railway
  db: {
    host: env.DB_HOST || env.MYSQLHOST || "127.0.0.1",
    port: Number(env.DB_PORT || env.MYSQLPORT || 3306),
    user: env.DB_USER || env.MYSQLUSER || "root",
    password: env.DB_PASSWORD || env.MYSQLPASSWORD || "",
    database: env.DB_NAME || env.MYSQLDATABASE || "calakan",
    // Zona waktu sekolah (WIB) agar NOW() di MySQL sama dengan jam sekolah, di server mana pun
    timezone: env.DB_TIMEZONE || "+07:00",
  },
  sessionDays: Number(env.SESSION_DAYS || 14),
  vapidSubject: env.VAPID_SUBJECT || "mailto:admin@sekolah.sch.id",
  // Aktifkan hanya bila aplikasi berada di belakang reverse proxy (Nginx, Cloudflare Tunnel, dll.)
  trustProxy: env.TRUST_PROXY === "1",
};

export const DAY_NAMES = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
