# CALAKAN – Rencana Pembelajaran Sepekan

Aplikasi web untuk menyusun, menerbitkan, dan membagikan **Rencana Pembelajaran Sepekan (CALAKAN)**. Guru mengisi rencana mapelnya, wali kelas memeriksa lalu menerbitkan, dan orang tua langsung mendapat **push notification**.

- **Runtime:** [Bun](https://bun.sh) (ringan & cepat)
- **Database:** MySQL/MariaDB (bawaan **XAMPP**)
- **Tampilan:** SPA responsif (Android/iPhone), sidebar, SweetAlert2, loader, PWA

---

## 1. Persiapan (Windows + XAMPP)

1. **Jalankan MySQL**: buka *XAMPP Control Panel*, lalu klik **Start** pada **MySQL**. Apache tidak diperlukan.
2. **Pasang Bun** (sekali saja). Buka *PowerShell* lalu jalankan:
   ```powershell
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
   Tutup PowerShell, buka lagi, lalu cek dengan `bun --version`.
3. **Ekstrak folder `calakan`**, misalnya ke `C:\calakan`.

## 2. Instalasi

Buka terminal di folder `calakan`, lalu jalankan:

```bash
bun install
copy .env.example .env      # di Linux/Mac: cp .env.example .env
```

Periksa isi `.env`. Pengaturan bawaan XAMPP adalah user `root` tanpa password, dan biasanya tidak perlu diubah.

## 3. Menjalankan

```bash
bun run start
```

Setelah itu buka **http://localhost:3000**.
Cara lain: klik dua kali `start.bat`.

- Database `calakan` dan semua tabelnya **dibuat otomatis** saat aplikasi pertama kali dijalankan. Isinya bisa dilihat lewat phpMyAdmin.
- Login admin awal: **`admin` / `admin123`**. Saat pertama masuk, aplikasi **mewajibkan** Anda membuat password baru.

### Data contoh (opsional)

Untuk mencoba semua fitur dengan data dari spreadsheet CALAKAN Fase A:

```bash
bun run demo
```

| Peran | Username | Password |
|---|---|---|
| Wali kelas | `wali1a`, `wali1b`, `wali2a`, `wali2b` | `guru123` |
| Wali kelas pendamping (1A) | `wali1a2` | `guru123` |
| Guru mapel | `guru.tahfiz`, `guru.pjok`, `guru.bahasa` | `guru123` |
| Orang tua | NIS `2026001` s.d. `2026024` | sama dengan NIS (wajib diganti saat pertama masuk) |

Pekan contoh: **14–18 September 2026**. Data demo bisa dihapus lewat menu Data Kelas, atau dengan menghapus database `calakan` di phpMyAdmin lalu menjalankan aplikasi lagi.

---

## 4. Alur Penggunaan

1. **Admin** menyiapkan **Data Kelas** (termasuk siswa, bisa diimpor dari Excel), **Mata Pelajaran**, dan **Data Guru**. Guru ditambahkan beserta mapel yang diampu di tiap kelas.
2. **Admin** menyusun **Jadwal Pelajaran** per kelas. Setiap mapel di jadwal menjadi satu baris isian CALAKAN.
3. **Admin** membuat **akun orang tua**, bisa sekaligus secara massal. Username dan password awal = NIS.
4. **Guru / wali kelas** membuka **Isi Rencana**, memilih kelas dan pekan, lalu mengisi *Materi, Rencana Kegiatan, Tugas, Keterangan*. Isian bisa disalin dari pekan lalu atau dari kelas paralel.
5. **Wali kelas** memeriksa **CALAKAN Kelas Saya**, lalu menekan **Terbitkan**. Orang tua di kelas itu langsung menerima notifikasi.
6. Jika ada perubahan setelah terbit, wali kelas menekan **Kirim Pembaruan**.
7. **Admin** dapat melihat dan mencetak CALAKAN semua kelas ke **PDF** atau **Excel**. Wali kelas hanya dapat mencetak kelasnya sendiri.

### Hak akses

| Fitur | Admin | Wali Kelas | Guru | Orang Tua |
|---|:-:|:-:|:-:|:-:|
| Kelola kelas, siswa, mapel, guru, jadwal, akun | ✔ | | | |
| Tampilan, backup & restore | ✔ | | | |
| Isi rencana sesuai mapel yang diampu | ✔ (semua) | ✔ | ✔ | |
| Terbitkan & kirim notifikasi | ✔ | ✔ (kelasnya) | | |
| Cetak PDF / Excel | ✔ (semua kelas) | ✔ (kelasnya) | | |
| Lihat CALAKAN yang sudah terbit + notifikasi | | | | ✔ |

> Wali kelas juga boleh mengisi mapel di kelasnya yang **belum punya guru pengampu**.
>
> Kelas **1 dan 2 (Fase A)** boleh memiliki **wali kelas utama dan pendamping**. Keduanya punya hak yang sama (mengisi, menerbitkan, mencetak). Kolom tanda tangan PDF/Excel memakai nama wali utama.

---

## 5. Push Notification

- Notifikasi selalu tersimpan di menu **Notifikasi** di dalam aplikasi.
- **Push** ke HP/laptop (tetap muncul walau aplikasi ditutup) mensyaratkan alamat **`https://`** atau **`localhost`**. Ini aturan browser.
  - Di komputer server sendiri (`http://localhost:3000`), push sudah bisa langsung dicoba.
  - Untuk HP di jaringan yang sama (misal `http://192.168.1.10:3000`), aplikasi tetap bisa dibuka, **tetapi push tidak aktif** karena belum HTTPS.
  - Cara cepat mencoba push dari HP: jalankan [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/):
    ```bash
    cloudflared tunnel --url http://localhost:3000
    ```
    Buka alamat `https://….trycloudflare.com` yang muncul dari HP.
    Saat memakai tunnel/proxy, isi `TRUST_PROXY=1` di `.env` agar pembatas login membaca IP asli pengguna.
  - Untuk pemakaian sehari-hari, pasang di hosting/VPS dengan domain dan HTTPS.
- **iPhone/iPad** (iOS 16.4+): buka lewat Safari, lalu pilih **Bagikan › Tambah ke Layar Utama**, buka dari ikon tersebut, dan aktifkan notifikasi.
- Kunci VAPID dibuat otomatis dan disimpan di database. Kuncinya ikut ter-backup, sehingga langganan notifikasi tetap berlaku setelah restore.

## 6. Backup & Restore

*Pengaturan › Backup & Restore*:
- **Unduh Backup** menyimpan seluruh data ke satu file `.json` **terenkripsi** (AES-256-GCM), termasuk pengaturan, logo, dan akun.
  - Admin wajib memasukkan ulang password akunnya, lalu membuat **kata sandi backup** (minimal 10 karakter).
  - Kata sandi backup **tidak disimpan** di aplikasi. Catat di tempat aman; tanpa kata sandi itu backup tidak bisa dibuka.
- **Restore** mengganti seluruh data dengan isi file backup (butuh kata sandi backup + password admin). Semua pengguna harus login ulang setelahnya.
- File backup format lama (belum terenkripsi) masih bisa di-restore.

## 7. Struktur Proyek

```
calakan/
├─ server.ts              # server Bun (Hono) + aset statis
├─ Dockerfile, railway.json # deploy (Railway / Docker)
├─ src/
│  ├─ db.ts               # koneksi MySQL, skema tabel, data awal
│  ├─ auth.ts             # sesi login (cookie HttpOnly), pembatas percobaan login
│  ├─ calakan.ts          # logika CALAKAN (susun pekan, hak edit, salin)
│  ├─ excel.ts            # ekspor Excel & impor siswa
│  ├─ push.ts             # web push (VAPID)
│  ├─ crypto.ts           # enkripsi file backup
│  └─ routes/             # endpoint API
├─ public/
│  ├─ index.html, sw.js   # SPA + service worker
│  ├─ css/app.css
│  └─ js/                 # halaman (pages/), komponen, PDF (print.js)
└─ scripts/seed-demo.ts   # data contoh
```

## 8. Keamanan

- Hanya **admin** yang dapat membuat akun. Tidak ada pendaftaran mandiri.
- Password disimpan dalam bentuk *hash* (argon2 bawaan Bun).
- **Password awal wajib diganti**: akun dengan password bawaan (`admin123`, NIS) atau yang dibuat/direset admin harus membuat password baru sebelum bisa memakai aplikasi. Password baru minimal 8 karakter, berisi huruf dan angka, dan tidak boleh sama dengan username/NIS.
- Pembatas login berlapis (jendela 15 menit): 5 kali gagal per IP+username, 10 kali per username (dari IP mana pun), 30 kali per IP. Header `X-Forwarded-For` hanya dipercaya bila `TRUST_PROXY=1`.
- Pesan dan waktu respons login sama untuk username yang tidak ada, sehingga username tidak bisa ditebak.
- Token sesi disimpan di database dalam bentuk hash. Cookie *HttpOnly*, *SameSite*, dan *Secure* saat HTTPS.
- Ganti password mengeluarkan akun dari semua perangkat lain.
- Permintaan lintas situs (CSRF) ditolak; header keamanan (CSP, HSTS saat HTTPS, dll.) aktif.
- Satu guru satu akun: username dan NIP/NIY tidak boleh dipakai dua akun. Guru hanya bisa mengakses kelas yang ditugaskan admin.
- Hak akses dicek di server untuk setiap permintaan.

## 9. Pengaturan `.env`

| Variabel | Bawaan | Keterangan |
|---|---|---|
| `PORT` | 3000 | Port aplikasi |
| `DB_HOST` / `DB_PORT` | 127.0.0.1 / 3306 | Alamat MySQL |
| `DB_USER` / `DB_PASSWORD` | root / (kosong) | Akun MySQL |
| `DB_NAME` | calakan | Nama database (dibuat otomatis) |
| `SESSION_DAYS` | 14 | Lama sesi login |
| `VAPID_SUBJECT` | mailto:admin@sekolah.sch.id | Kontak untuk layanan push |
| `TRUST_PROXY` | 0 | Isi `1` hanya bila di belakang reverse proxy (Nginx, Cloudflare Tunnel, Railway) agar IP & HTTPS terbaca benar |
| `DB_TIMEZONE` | +07:00 | Zona waktu MySQL (WIB). Ubah bila sekolah di WITA (`+08:00`) / WIT (`+09:00`) |

Jika `DB_*` tidak diisi, aplikasi juga membaca variabel bawaan Railway: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`.

## 10. Deploy ke Railway

Repositori ini sudah berisi `Dockerfile` dan `railway.json` (build Docker, healthcheck `/api/public/settings`, restart otomatis bila gagal).

1. Di [railway.com](https://railway.com), buat **New Project › Deploy from GitHub repo** dan pilih repositori ini.
2. Di proyek yang sama, tambahkan **New › Database › MySQL**.
3. Buka service aplikasi › **Variables**, lalu tambahkan:
   | Variabel | Nilai |
   |---|---|
   | `MYSQLHOST` | `${{MySQL.MYSQLHOST}}` |
   | `MYSQLPORT` | `${{MySQL.MYSQLPORT}}` |
   | `MYSQLUSER` | `${{MySQL.MYSQLUSER}}` |
   | `MYSQLPASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
   | `MYSQLDATABASE` | `${{MySQL.MYSQLDATABASE}}` |
   | `TRUST_PROXY` | `1` |
   | `VAPID_SUBJECT` | `mailto:email-admin-sekolah` |
4. Buka **Settings › Networking › Generate Domain** (atau pasang domain sekolah). HTTPS otomatis aktif.
5. Buka domain tersebut, masuk dengan `admin` / `admin123`, lalu buat password baru.

Catatan: jangan jalankan `bun run demo` di production. Waktu aplikasi & database sudah dikunci ke WIB walau server Railway memakai UTC.

## 11. Kendala Umum

| Masalah | Solusi |
|---|---|
| `Gagal terhubung ke database MySQL` | Pastikan MySQL di XAMPP sudah **Start** dan isi `.env` benar. |
| `bun` tidak dikenali | Tutup lalu buka lagi terminal setelah memasang Bun. |
| Port 3000 sudah dipakai | Ubah `PORT` di `.env`, misalnya menjadi 3001. |
| Tombol notifikasi tidak muncul di HP | Akses lewat HTTPS (lihat bagian 5). |
