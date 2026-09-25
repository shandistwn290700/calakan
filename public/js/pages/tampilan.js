import { get, put } from "../api.js";
import { esc, toast, alertError, withBtn, readImage, formData } from "../ui.js";
import { refreshMe, applyTheme } from "../app.js";

const PRESETS = ["#0f766e", "#047857", "#15803d", "#0369a1", "#1d4ed8", "#6d28d9", "#be123c", "#b45309", "#334155"];

export default async function tampilan({ el }) {
  const s = await get("/settings");
  let logo = s.logo, favicon = s.favicon;

  el.innerHTML = `
    <form id="f" class="grid c2" style="align-items:start">
      <div class="card">
        <div class="card-h"><h3><i class="bi bi-type" style="color:var(--p)"></i> Identitas Aplikasi</h3></div>
        <div class="card-b">
          <label class="field"><span>Nama Aplikasi <em>*</em></span><input class="input" name="app_name" value="${esc(s.app_name)}" maxlength="40"></label>
          <label class="field"><span>Subjudul</span><input class="input" name="app_subtitle" value="${esc(s.app_subtitle)}" maxlength="80"></label>
          <label class="field"><span>Nama Sekolah</span><input class="input" name="school_name" value="${esc(s.school_name)}" maxlength="120"></label>
          <label class="field"><span>Teks Footer</span><input class="input" name="footer_text" value="${esc(s.footer_text)}" placeholder="Kosongkan untuk teks otomatis"></label>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3><i class="bi bi-palette" style="color:var(--p)"></i> Warna & Gambar</h3></div>
        <div class="card-b">
          <div class="field"><span>Warna Utama</span>
            <div class="color-row"><input type="color" name="primary_color" value="${esc(s.primary_color)}">
              <div class="chips">${PRESETS.map((c) => `<button type="button" class="btn icon sm" data-c="${c}" style="background:${c};border-radius:50%" title="${c}"></button>`).join("")}</div></div></div>
          <div class="field"><span>Logo Sekolah</span>
            <div class="img-drop"><div class="prev" id="logo-prev"></div>
              <div style="flex:1"><input type="file" id="logo" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>
                <button type="button" class="btn sm soft" id="logo-btn"><i class="bi bi-upload"></i> Pilih logo</button>
                <button type="button" class="btn sm ghost" id="logo-rm">Hapus</button>
                <small class="hint">PNG/JPG persegi, maks 1 MB. Dipakai di sidebar, login, ikon aplikasi & PDF.</small></div></div></div>
          <div class="field"><span>Favicon (ikon tab browser)</span>
            <div class="img-drop"><div class="prev" id="fav-prev" style="width:48px;height:48px"></div>
              <div style="flex:1"><input type="file" id="fav" accept="image/png,image/x-icon,image/svg+xml,.ico" hidden>
                <button type="button" class="btn sm soft" id="fav-btn"><i class="bi bi-upload"></i> Pilih favicon</button>
                <button type="button" class="btn sm ghost" id="fav-rm">Hapus</button>
                <small class="hint">Jika kosong, logo dipakai sebagai favicon.</small></div></div></div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3><i class="bi bi-printer" style="color:var(--p)"></i> Cetak & Kalender</h3></div>
        <div class="card-b">
          <label class="field"><span>Nama Kepala Sekolah</span><input class="input" name="kepala_sekolah" value="${esc(s.kepala_sekolah)}" placeholder="Untuk kolom tanda tangan PDF/Excel"></label>
          <label class="field"><span>Kota (tempat tanda tangan)</span><input class="input" name="kota" value="${esc(s.kota)}" placeholder="contoh: Bandung"></label>
          <label class="field"><span>Hari Sekolah</span><select class="select" name="school_days">
            <option value="5" ${s.school_days == "5" ? "selected" : ""}>5 hari (Senin–Jumat)</option>
            <option value="6" ${s.school_days == "6" ? "selected" : ""}>6 hari (Senin–Sabtu)</option></select></label>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h3><i class="bi bi-eye" style="color:var(--p)"></i> Pratinjau</h3></div>
        <div class="card-b"><div id="preview"></div></div>
      </div>
    </form>
    <div class="savebar"><span class="muted small">Perubahan diterapkan ke semua pengguna setelah disimpan.</span><div class="spacer"></div>
      <button class="btn" id="save"><i class="bi bi-save"></i> Simpan Tampilan</button></div>`;

  const f = el.querySelector("#f");
  const imgPrev = (id, v) => (el.querySelector(id).innerHTML = v ? `<img src="${v}" alt="">` : `<i class="bi bi-image muted" style="font-size:22px"></i>`);
  const preview = () => {
    const d = formData(f);
    const c = d.primary_color;
    el.querySelector("#preview").innerHTML = `
      <div style="border-radius:14px;overflow:hidden;border:1px solid var(--line)">
        <div style="background:linear-gradient(135deg,${c},color-mix(in srgb,${c} 55%,#06120f));color:#fff;padding:16px;display:flex;gap:12px;align-items:center">
          <div style="width:40px;height:40px;border-radius:11px;background:#fff;display:grid;place-items:center;overflow:hidden">${logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain">` : `<img src="/img/icon.svg" style="width:100%">`}</div>
          <div><b style="font-size:16px">${esc(d.app_name || "CALAKAN")}</b><div style="font-size:12px;opacity:.8">${esc(d.school_name)}</div></div></div>
        <div style="padding:14px;display:flex;gap:8px;flex-wrap:wrap"><span class="btn sm" style="background:${c}">Tombol utama</span>
          <span class="badge" style="background:color-mix(in srgb,${c} 14%,white);color:${c}">Label</span></div></div>`;
  };
  imgPrev("#logo-prev", logo);
  imgPrev("#fav-prev", favicon);
  preview();
  f.addEventListener("input", preview);
  el.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => {
    f.primary_color.value = b.dataset.c;
    preview();
  }));

  const bindImg = (btn, input, rm, prevId, set) => {
    el.querySelector(btn).onclick = () => el.querySelector(input).click();
    el.querySelector(input).onchange = async (e) => {
      try {
        const v = await readImage(e.target.files[0], 1000);
        set(v);
        imgPrev(prevId, v);
        preview();
      } catch (err) {
        alertError(err);
      }
      e.target.value = "";
    };
    el.querySelector(rm).onclick = () => {
      set("");
      imgPrev(prevId, "");
      preview();
    };
  };
  bindImg("#logo-btn", "#logo", "#logo-rm", "#logo-prev", (v) => (logo = v));
  bindImg("#fav-btn", "#fav", "#fav-rm", "#fav-prev", (v) => (favicon = v));

  el.querySelector("#save").onclick = (e) =>
    withBtn(e.currentTarget, async () => {
      try {
        await put("/settings", { ...formData(f), logo, favicon });
        toast("Tampilan disimpan");
        await refreshMe();
      } catch (err) {
        alertError(err);
      }
    });
}
