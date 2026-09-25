import { post } from "../api.js";
import { esc, withBtn, alertError, toast } from "../ui.js";

export default function login(root, s, onSuccess) {
  const v = s.version || "1";
  root.innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brandline"><img data-logo src="/logo?v=${v}" alt=""> ${esc(s.school_name || "")}</div>
      <div>
        <h2>${esc(s.app_name || "CALAKAN")}</h2>
        <p style="font-size:18px;font-weight:600;margin:8px 0 6px">${esc(s.app_subtitle || "")}</p>
        <p>Rencanakan, terbitkan, dan pantau pembelajaran sepekan dalam satu tempat — guru mengisi, wali kelas menerbitkan, orang tua langsung menerima notifikasi.</p>
      </div>
      <div class="feat">
        <span><i class="bi bi-pencil-square"></i> Isi rencana per mapel</span>
        <span><i class="bi bi-file-earmark-pdf"></i> Cetak PDF & Excel</span>
        <span><i class="bi bi-bell"></i> Notifikasi orang tua</span>
      </div>
      <svg class="deco" viewBox="0 0 200 200"><g fill="none" stroke="#fff" stroke-width="2">
        <path d="M100 10 L120 80 L190 100 L120 120 L100 190 L80 120 L10 100 L80 80 Z"/><circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="85"/>
        <rect x="58" y="58" width="84" height="84" transform="rotate(45 100 100)"/><rect x="58" y="58" width="84" height="84"/></g></svg>
    </section>
    <section class="login-form">
      <form id="f-login" autocomplete="on">
        <div class="login-mobile-head">
          <img data-logo src="/logo?v=${v}" alt="">
          <b>${esc(s.app_name || "CALAKAN")}</b>
          <small>${esc(s.school_name || "")}</small>
        </div>
        <h1>Ahlan wa Sahlan 👋</h1>
        <p class="sub">Silakan masuk dengan akun yang diberikan oleh admin sekolah.</p>
        <label class="field"><span>Username / NIS</span>
          <input class="input" name="username" autocomplete="username" autocapitalize="none" placeholder="contoh: 2026001" required></label>
        <label class="field"><span>Password</span>
          <div class="pw-wrap"><input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required>
          <button type="button" id="pw-toggle" aria-label="Tampilkan password"><i class="bi bi-eye"></i></button></div></label>
        <button class="btn lg block" type="submit" id="btn-login"><i class="bi bi-box-arrow-in-right"></i> Masuk</button>
        <p class="muted small" style="margin-top:18px;text-align:center"><i class="bi bi-shield-lock"></i> Orang tua masuk menggunakan <b>NIS</b> anak. Lupa password? Hubungi admin sekolah.</p>
      </form>
    </section>
  </div>`;

  const f = root.querySelector("#f-login");
  root.querySelector("#pw-toggle").onclick = (e) => {
    const i = f.password;
    i.type = i.type === "password" ? "text" : "password";
    e.currentTarget.innerHTML = `<i class="bi ${i.type === "password" ? "bi-eye" : "bi-eye-slash"}"></i>`;
  };
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = f.username.value.trim();
    const password = f.password.value;
    if (!username || !password) return toast("Isi username dan password.", "warning");
    await withBtn(root.querySelector("#btn-login"), async () => {
      try {
        await post("/auth/login", { username, password });
        const me = await onSuccess();
        if (me?.must_change_password) toast("Silakan buat password baru terlebih dahulu", "info");
        else toast("Berhasil masuk. Selamat bertugas!");
      } catch (err) {
        alertError(err, "Gagal masuk");
      }
    });
  });
}
