import { api, download } from "../api.js";
import { esc, toast, openModal, swalLoading } from "../ui.js";

const LABEL = {
  settings: "Pengaturan", classes: "Kelas", students: "Siswa", users: "Akun", subjects: "Mata pelajaran", assignments: "Penugasan guru",
  schedules: "Jadwal", calakan_weeks: "Status pekan", calakan_items: "Isian CALAKAN", notifications: "Notifikasi", push_subscriptions: "Perangkat push",
};
const MIN_PASSPHRASE = 10;

export default async function backup({ el }) {
  el.innerHTML = `
    <div class="grid c2" style="align-items:start">
      <div class="card">
        <div class="card-h"><h3><i class="bi bi-cloud-arrow-down" style="color:var(--p)"></i> Backup Data</h3></div>
        <div class="card-b">
          <p style="margin-top:0">Unduh seluruh isi database (kelas, siswa, guru, akun, jadwal, CALAKAN, dan pengaturan) menjadi satu file <b>.json</b> yang <b>terenkripsi</b>.</p>
          <div class="callout"><i class="bi bi-shield-lock"></i><div><b>File dikunci dengan kata sandi backup</b>
            <p>Tanpa kata sandi tersebut, isi backup tidak dapat dibaca maupun dipulihkan. <b>Catat dan simpan kata sandinya di tempat aman</b> — bila lupa, backup tidak bisa dibuka.</p></div></div>
          <div class="callout mt"><i class="bi bi-lightbulb"></i><div><p>Lakukan backup rutin (misal setiap akhir pekan) dan simpan di Google Drive atau flashdisk.</p></div></div>
          <button class="btn mt" id="dl"><i class="bi bi-download"></i> Unduh Backup Sekarang</button>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h3><i class="bi bi-cloud-arrow-up" style="color:var(--danger)"></i> Restore Data</h3></div>
        <div class="card-b">
          <div class="callout danger"><i class="bi bi-exclamation-octagon"></i><div><b>Perhatian!</b>
            <p>Restore akan <b>menghapus seluruh data saat ini</b> dan menggantinya dengan isi file backup. Semua pengguna harus masuk ulang.</p></div></div>
          <label class="field mt"><span>File backup (.json)</span><input class="input" type="file" id="file" accept=".json,application/json" style="padding:8px"></label>
          <div id="info"></div>
          <button class="btn danger" id="restore" disabled><i class="bi bi-arrow-repeat"></i> Restore dari File</button>
        </div>
      </div>
    </div>`;

  el.querySelector("#dl").onclick = async () => {
    const ok = await openModal({
      title: "Unduh Backup Terenkripsi",
      icon: "bi-shield-lock",
      okText: "Unduh",
      body: `
        <label class="field"><span>Password akun Anda <em>*</em></span><input class="input" type="password" name="password" autocomplete="current-password">
          <small class="hint">Konfirmasi bahwa Anda adalah admin yang sedang masuk.</small></label>
        <label class="field"><span>Kata sandi backup <em>*</em></span><input class="input" type="password" name="passphrase" autocomplete="new-password" placeholder="Minimal ${MIN_PASSPHRASE} karakter"></label>
        <label class="field"><span>Ulangi kata sandi backup <em>*</em></span><input class="input" type="password" name="passphrase2" autocomplete="new-password"></label>
        <div class="callout warn"><i class="bi bi-exclamation-triangle"></i><div><p>Kata sandi backup <b>tidak disimpan</b> di aplikasi. Bila lupa, file backup tidak dapat dipulihkan.</p></div></div>`,
      onOk: async (m, f) => {
        const passphrase = f.passphrase.value;
        if (!f.password.value) throw new Error("Masukkan password akun Anda.");
        if (passphrase.length < MIN_PASSPHRASE) throw new Error(`Kata sandi backup minimal ${MIN_PASSPHRASE} karakter.`);
        if (passphrase !== f.passphrase2.value) throw new Error("Ulangi kata sandi backup tidak sama.");
        await download("/backup", "backup-calakan.json", { method: "POST", body: { password: f.password.value, passphrase } });
        return true;
      },
    });
    if (ok) toast("Backup terenkripsi berhasil diunduh");
  };

  let parsed = null;
  let encrypted = false;
  const file = el.querySelector("#file");
  file.onchange = async () => {
    parsed = null;
    el.querySelector("#restore").disabled = true;
    const f = file.files[0];
    if (!f) return (el.querySelector("#info").innerHTML = "");
    try {
      const j = JSON.parse(await f.text());
      if (j.app !== "calakan") throw new Error("File ini bukan backup CALAKAN.");
      parsed = f;
      encrypted = !!j.encrypted;
      const counts = j.counts || Object.fromEntries(Object.entries(j.tables || {}).map(([k, v]) => [k, v.length]));
      const d = new Date(j.created_at);
      el.querySelector("#info").innerHTML = `<div class="card" style="box-shadow:none;margin-bottom:14px"><div class="card-b" style="padding:12px 16px">
        <b>${esc(j.school || "Backup")}</b> · dibuat ${esc(d.toLocaleString("id-ID"))}
        <div class="small" style="margin-top:6px">${
          encrypted
            ? `<span class="badge ok"><i class="bi bi-shield-lock"></i> Terenkripsi</span>`
            : `<span class="badge warn"><i class="bi bi-unlock"></i> Format lama (tidak terenkripsi)</span>`
        }</div>
        <div class="chips" style="margin-top:8px">${Object.entries(counts)
          .map(([k, v]) => `<span class="badge">${esc(LABEL[k] || k)}: ${Number(v) || 0}</span>`)
          .join("")}</div></div></div>`;
      el.querySelector("#restore").disabled = false;
    } catch (err) {
      el.querySelector("#info").innerHTML = `<p style="color:var(--danger)"><i class="bi bi-x-circle"></i> ${esc(err.message || "File tidak valid.")}</p>`;
    }
  };

  el.querySelector("#restore").onclick = async () => {
    if (!parsed) return;
    const ok = await openModal({
      title: "Restore Database",
      icon: "bi-arrow-repeat",
      okText: "Restore",
      body: `
        <div class="callout danger"><i class="bi bi-exclamation-octagon"></i><div><p>Seluruh data saat ini akan <b>diganti</b> dengan isi file backup.</p></div></div>
        ${encrypted ? `<label class="field mt"><span>Kata sandi backup <em>*</em></span><input class="input" type="password" name="passphrase" autocomplete="off"></label>` : ""}
        <label class="field ${encrypted ? "" : "mt"}"><span>Password akun Anda <em>*</em></span><input class="input" type="password" name="password" autocomplete="current-password"></label>
        <label class="field"><span>Ketik <b>RESTORE</b> untuk melanjutkan <em>*</em></span><input class="input" name="confirm" autocomplete="off" placeholder="RESTORE"></label>`,
      onOk: async (m, f) => {
        if (f.confirm.value !== "RESTORE") throw new Error("Ketik RESTORE dengan huruf kapital.");
        if (encrypted && !f.passphrase.value) throw new Error("Masukkan kata sandi backup.");
        if (!f.password.value) throw new Error("Masukkan password akun Anda.");
        const fd = new FormData();
        fd.append("file", parsed);
        fd.append("password", f.password.value);
        if (encrypted) fd.append("passphrase", f.passphrase.value);
        const close = swalLoading("Memulihkan data…", "Jangan tutup halaman ini");
        try {
          await api("/restore", { method: "POST", form: fd });
        } finally {
          close();
        }
        return true;
      },
    });
    if (!ok) return;
    await window.Swal.fire({ icon: "success", title: "Restore berhasil", text: "Silakan masuk kembali.", confirmButtonText: "Masuk" });
    location.href = "/";
  };
}
