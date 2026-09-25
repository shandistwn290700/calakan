import { post } from "../api.js";
import { esc, waliText, initials, ROLE_LABEL, withBtn, toast, alertError, formData } from "../ui.js";
import { pushCard } from "../components/pushcard.js";

export default async function profil({ el, me }) {
  const st = me.student;
  el.innerHTML = `
    <div class="grid c2" style="align-items:start">
      <div class="card"><div class="card-b">
        <div class="row" style="flex-wrap:nowrap"><div class="avatar" style="width:56px;height:56px;font-size:18px">${esc(initials(me.name))}</div>
          <div><h3 style="font-size:18px">${esc(me.name)}</h3><div class="row" style="margin-top:4px"><span class="badge role-${me.role}">${ROLE_LABEL[me.role]}</span>
          <code class="small">${esc(me.username)}</code></div></div></div>
        ${
          st
            ? `<div class="callout mt"><i class="bi bi-mortarboard"></i><div><b>${esc(st.name)}</b><p>NIS ${esc(st.nis)} · Kelas ${esc(st.tingkat ?? "")} ${esc(st.class_name || "-")}${
                st.wali_name || st.wali2_name ? ` · Wali: ${esc(waliText(st))}` : ""
              }</p></div></div>`
            : ""
        }
        ${me.homeroom ? `<div class="callout mt"><i class="bi bi-house-door"></i><div><b>Wali Kelas${me.homeroom.as_role === "pendamping" ? " Pendamping" : ""} ${esc(me.homeroom.tingkat)} ${esc(me.homeroom.name)}</b><p>Rombel ${esc(me.homeroom.rombel)}</p></div></div>` : ""}
        <h4 style="margin:22px 0 10px">Notifikasi Perangkat</h4>
        <div id="push-slot"></div>
      </div></div>

      <div class="card">
        <div class="card-h"><h3><i class="bi bi-shield-lock" style="color:var(--p)"></i> Ganti Password</h3></div>
        <form class="card-b" id="f">
          <label class="field"><span>Password Lama</span><input class="input" type="password" name="old" autocomplete="current-password"></label>
          <label class="field"><span>Password Baru</span><input class="input" type="password" name="new" autocomplete="new-password" placeholder="Minimal 8 karakter, huruf & angka"></label>
          <label class="field"><span>Ulangi Password Baru</span><input class="input" type="password" name="new2" autocomplete="new-password"></label>
          <button class="btn" type="submit"><i class="bi bi-check2"></i> Simpan Password</button>
        </form>
      </div>
    </div>`;
  pushCard(el.querySelector("#push-slot"), { full: true });
  const f = el.querySelector("#f");
  f.onsubmit = (e) => {
    e.preventDefault();
    withBtn(f.querySelector("button"), async () => {
      const d = formData(f);
      try {
        if (d.new.length < 8) throw new Error("Password baru minimal 8 karakter.");
        if (!/[A-Za-z]/.test(d.new) || !/d/.test(d.new)) throw new Error("Password baru harus mengandung huruf dan angka.");
        if (d.new !== d.new2) throw new Error("Ulangi password baru tidak sama.");
        await post("/auth/password", { old: d.old, new: d.new });
        f.reset();
        toast("Password diganti. Perangkat lain telah dikeluarkan.");
      } catch (err) {
        alertError(err);
      }
    });
  };
}
