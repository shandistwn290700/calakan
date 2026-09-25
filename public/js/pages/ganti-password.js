import { post } from "../api.js";
import { esc, withBtn, alertError, toast } from "../ui.js";

/** Layar wajib ganti password (password bawaan / dibuat admin) sebelum aplikasi bisa dipakai */
export default function gantiPassword(root, me, onDone, onLogout) {
  const s = me.settings || {};
  const v = s.version || "1";
  root.innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brandline"><img data-logo src="/logo?v=${v}" alt=""> ${esc(s.school_name || "")}</div>
      <div>
        <h2>${esc(s.app_name || "CALAKAN")}</h2>
        <p style="font-size:18px;font-weight:600;margin:8px 0 6px">Amankan akun Anda</p>
        <p>Password Anda masih password awal yang dibuat admin. Demi keamanan data ananda dan sekolah, buat password baru yang hanya Anda ketahui.</p>
      </div>
      <div class="feat">
        <span><i class="bi bi-shield-lock"></i> Minimal 8 karakter</span>
        <span><i class="bi bi-123"></i> Huruf dan angka</span>
        <span><i class="bi bi-person-x"></i> Bukan username / NIS</span>
      </div>
    </section>
    <section class="login-form">
      <form id="f-pw" autocomplete="on">
        <div class="login-mobile-head">
          <img data-logo src="/logo?v=${v}" alt="">
          <b>${esc(s.app_name || "CALAKAN")}</b>
          <small>${esc(s.school_name || "")}</small>
        </div>
        <h1>Buat Password Baru 🔐</h1>
        <p class="sub">Halo <b>${esc(me.name)}</b>, sebelum melanjutkan, silakan ganti password awal Anda.</p>
        <input type="hidden" name="username" autocomplete="username" value="${esc(me.username)}">
        <label class="field"><span>Password Saat Ini</span>
          <input class="input" name="old" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>Password Baru</span>
          <input class="input" name="new" type="password" autocomplete="new-password" placeholder="Minimal 8 karakter, huruf & angka" required></label>
        <label class="field"><span>Ulangi Password Baru</span>
          <input class="input" name="new2" type="password" autocomplete="new-password" required></label>
        <button class="btn lg block" type="submit" id="btn-save"><i class="bi bi-check2-circle"></i> Simpan & Lanjutkan</button>
        <button class="btn ghost block" type="button" id="btn-out" style="margin-top:10px"><i class="bi bi-box-arrow-left"></i> Keluar</button>
      </form>
    </section>
  </div>`;

  const f = root.querySelector("#f-pw");
  root.querySelector("#btn-out").onclick = onLogout;
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    withBtn(root.querySelector("#btn-save"), async () => {
      try {
        const nw = f.new.value;
        if (nw.length < 8) throw new Error("Password baru minimal 8 karakter.");
        if (!/[A-Za-z]/.test(nw) || !/\d/.test(nw)) throw new Error("Password baru harus mengandung huruf dan angka.");
        if (nw !== f.new2.value) throw new Error("Ulangi password baru tidak sama.");
        await post("/auth/password", { old: f.old.value, new: nw });
        toast("Password berhasil diganti");
        await onDone();
      } catch (err) {
        alertError(err, "Password belum diganti");
      }
    });
  });
}
