// Kumpulan helper tampilan
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape HTML */
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
/** Teks multi-baris → HTML aman */
export const nl2br = (v) => esc(v).replace(/\n/g, "<br>");

export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const HARI = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
/** Nama wali kelas; kelas 1–2 bisa punya wali pendamping */
export const waliText = (c, empty = "-") => (c?.wali_name ? c.wali_name + (c.wali2_name ? " & " + c.wali2_name : "") : c?.wali2_name || empty);

export const ROLE_LABEL = { admin: "Admin", wali: "Wali Kelas", guru: "Guru", ortu: "Orang Tua" };

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null;
}
export function mondayOf(s) {
  const d = (s && parseYmd(s)) || new Date();
  d.setHours(12);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? 1 : 1 - dow));
  return ymd(d);
}
export function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function tgl(s) {
  const d = parseYmd(s);
  return d ? `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}` : "";
}
export function rentang(start, days = 5) {
  const a = parseYmd(start), b = parseYmd(addDays(start, days - 1));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${BULAN[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${BULAN[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${BULAN[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
}
export function waktu(dt) {
  if (!dt) return "-";
  const d = new Date(String(dt).replace(" ", "T"));
  if (isNaN(d)) return dt;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} hari lalu`;
  return `${d.getDate()} ${BULAN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}
export function initials(name = "") {
  const w = String(name).replace(/^(ustadzah|ustadz|ust\.|bu|pak|ibu|bapak)\s+/i, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "") + (w[1]?.[0] || "")).toUpperCase() || "?";
}

// ———————————————— SweetAlert2 ————————————————
const Swal = window.Swal;
export const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 2600,
  timerProgressBar: true,
  didOpen: (t) => {
    t.addEventListener("mouseenter", Swal.stopTimer);
    t.addEventListener("mouseleave", Swal.resumeTimer);
  },
});
export const toast = (title, icon = "success") => Toast.fire({ icon, title });

export async function confirm({ title = "Yakin?", text = "", html, icon = "warning", ok = "Ya, lanjutkan", cancel = "Batal", danger = false } = {}) {
  const r = await Swal.fire({
    title, text, html, icon,
    showCancelButton: true,
    confirmButtonText: ok,
    cancelButtonText: cancel,
    reverseButtons: true,
    focusCancel: danger,
    confirmButtonColor: danger ? "#dc2626" : undefined,
  });
  return r.isConfirmed;
}

export function alertError(err, title = "Gagal") {
  const msg = err?.message || String(err);
  let html = esc(msg);
  if (err?.data?.conflicts?.length) html += `<ul>${err.data.conflicts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
  if (err?.data?.errors?.length) html += `<ul>${err.data.errors.slice(0, 8).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;
  return Swal.fire({ icon: "error", title, html });
}

export function alertOk(title, text = "", html) {
  return Swal.fire({ icon: "success", title, text, html, confirmButtonText: "Oke" });
}

export function swalLoading(title = "Memproses…", text = "Mohon tunggu sebentar") {
  Swal.fire({ title, text, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() });
  return () => Swal.close();
}

/** Tombol dengan status memuat */
export async function withBtn(btn, fn) {
  if (!btn || btn.disabled) return;
  const html = btn.innerHTML;
  const w = btn.offsetWidth;
  btn.disabled = true;
  btn.style.minWidth = w + "px";
  btn.innerHTML = `<span class="spinner"></span>`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = html;
    btn.style.minWidth = "";
  }
}

// ———————————————— Modal formulir ————————————————
/**
 * openModal({ title, body (HTML), size, okText, onOk(modalEl) → true/false|Promise, onOpen(modalEl) })
 * onOk mengembalikan false untuk tetap membuka modal.
 */
export function openModal({ title, body, size = "", okText = "Simpan", cancelText = "Batal", onOk, onOpen, footer = true, icon = "" }) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true">
        <header>${icon ? `<i class="bi ${icon}" style="color:var(--p);font-size:20px"></i>` : ""}<h3>${esc(title)}</h3>
          <button class="icon-btn" data-x aria-label="Tutup"><i class="bi bi-x-lg"></i></button></header>
        <form class="body" novalidate>${body}<button type="submit" hidden></button></form>
        ${footer ? `<footer><button type="button" class="btn ghost" data-x>${esc(cancelText)}</button>
          <button type="button" class="btn" data-ok><i class="bi bi-check2"></i> ${esc(okText)}</button></footer>` : ""}
      </div>`;
    document.body.appendChild(bg);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => bg.classList.add("show"));
    const modal = bg.querySelector(".modal");
    const form = bg.querySelector("form");
    let done = false;
    const close = (val) => {
      if (done) return;
      done = true;
      bg.classList.remove("show");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      setTimeout(() => bg.remove(), 200);
      resolve(val);
    };
    const onKey = (e) => e.key === "Escape" && !Swal.isVisible() && close(null);
    document.addEventListener("keydown", onKey);
    bg.addEventListener("mousedown", (e) => e.target === bg && close(null));
    bg.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => close(null)));
    const submit = async () => {
      const btn = bg.querySelector("[data-ok]");
      if (!onOk) return close(true);
      const res = await withBtn(btn, async () => {
        try {
          return await onOk(modal, form);
        } catch (e) {
          await alertError(e);
          return false;
        }
      });
      if (res !== false) close(res ?? true);
    };
    bg.querySelector("[data-ok]")?.addEventListener("click", submit);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });
    modal.close = close;
    onOpen?.(modal, form);
    setTimeout(() => form.querySelector("input:not([type=hidden]):not([readonly]),select,textarea")?.focus(), 220);
  });
}

/** Ambil nilai form sebagai objek */
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") {
      if (el.dataset.multi) {
        o[el.name] = o[el.name] || [];
        if (el.checked) o[el.name].push(el.value);
      } else o[el.name] = el.checked;
    } else if (el.type === "radio") {
      if (el.checked) o[el.name] = el.value;
    } else o[el.name] = el.value;
  }
  return o;
}

// ———————————————— Tabel: cari & urut ————————————————
/**
 * Mengelola daftar data dengan pencarian + pengurutan kolom.
 * cfg: { data, search: el input, keys: [field untuk dicari], sort: {key, dir}, render(rows) }
 */
export function dataList(cfg) {
  const st = { q: "", key: cfg.sort?.key, dir: cfg.sort?.dir || 1 };
  const norm = (v) => String(v ?? "").toLowerCase();
  const apply = () => {
    let rows = cfg.data.slice();
    if (st.q) {
      const qq = norm(st.q);
      rows = rows.filter((r) => cfg.keys.some((k) => norm(typeof k === "function" ? k(r) : r[k]).includes(qq)));
    }
    if (st.key) {
      const get = cfg.getters?.[st.key] || ((r) => r[st.key]);
      rows.sort((a, b) => {
        const x = get(a), y = get(b);
        if (typeof x === "number" && typeof y === "number") return (x - y) * st.dir;
        return String(x ?? "").localeCompare(String(y ?? ""), "id", { numeric: true, sensitivity: "base" }) * st.dir;
      });
    }
    cfg.render(rows, st);
    // indikator urutan di header
    cfg.table?.querySelectorAll("th.sortable").forEach((th) => {
      const on = th.dataset.sort === st.key;
      th.classList.toggle("sorted", on);
      const i = th.querySelector(".si");
      if (i) i.className = `si bi ${on ? (st.dir > 0 ? "bi-sort-alpha-down" : "bi-sort-alpha-up-alt") : "bi-arrow-down-up"}`;
    });
  };
  if (cfg.search) {
    let t;
    cfg.search.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        st.q = cfg.search.value.trim();
        apply();
      }, 120);
    });
  }
  cfg.table?.querySelectorAll("th.sortable").forEach((th) => {
    if (!th.querySelector(".si")) th.insertAdjacentHTML("beforeend", `<i class="si bi bi-arrow-down-up"></i>`);
    th.addEventListener("click", () => {
      if (st.key === th.dataset.sort) st.dir *= -1;
      else {
        st.key = th.dataset.sort;
        st.dir = 1;
      }
      apply();
    });
  });
  cfg.sortSelect?.addEventListener("change", () => {
    const [k, d] = cfg.sortSelect.value.split(":");
    st.key = k;
    st.dir = Number(d || 1);
    apply();
  });
  apply();
  return {
    refresh(data) {
      if (data) cfg.data = data;
      apply();
    },
    state: st,
  };
}

export const skeleton = (n = 4) =>
  `<div class="card skel-card">${Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - i * 12}%"></div>`).join("")}</div>`;

export const emptyState = (icon, title, text = "") => `<div class="empty"><i class="bi ${icon}"></i><b>${esc(title)}</b>${text ? `<span>${text}</span>` : ""}</div>`;

/** Deretan tab yang digeser (HP): geser tab aktif ke tengah agar tidak tersembunyi di luar layar */
export function showActiveTab(tabs) {
  const a = tabs?.querySelector(".tab.active");
  if (!a || tabs.scrollWidth <= tabs.clientWidth) return;
  const t = tabs.getBoundingClientRect(), r = a.getBoundingClientRect();
  tabs.scrollLeft += r.left + r.width / 2 - (t.left + t.width / 2);
}

/** Komponen pemilih pekan */
export function weekPicker(el, week, onChange, days = 5) {
  const render = () => {
    const isNow = week === mondayOf();
    el.innerHTML = `
      <div class="week">
        <button type="button" data-w="-1" title="Pekan sebelumnya"><i class="bi bi-chevron-left"></i></button>
        <label title="Pilih tanggal"><i class="bi bi-calendar-week"></i> <span>${rentang(week, days)}</span>
          <input type="date" value="${week}" aria-label="Pilih pekan"></label>
        <button type="button" data-w="1" title="Pekan berikutnya"><i class="bi bi-chevron-right"></i></button>
        ${isNow ? "" : `<button type="button" class="today" data-today>Pekan ini</button>`}
      </div>`;
    el.querySelectorAll("[data-w]").forEach((b) =>
      b.addEventListener("click", () => {
        week = addDays(week, 7 * Number(b.dataset.w));
        render();
        onChange(week);
      })
    );
    el.querySelector("[data-today]")?.addEventListener("click", () => {
      week = mondayOf();
      render();
      onChange(week);
    });
    el.querySelector("input").addEventListener("change", (e) => {
      if (!e.target.value) return;
      week = mondayOf(e.target.value);
      render();
      onChange(week);
    });
  };
  render();
}

/** Baca file gambar sebagai data URL (dengan batas ukuran) */
export function readImage(file, maxKB = 1000) {
  return new Promise((res, rej) => {
    if (!file) return res("");
    if (!/^image\//.test(file.type) && !/\.ico$/i.test(file.name)) return rej(new Error("File harus berupa gambar."));
    if (file.size > maxKB * 1024) return rej(new Error(`Ukuran gambar maksimal ${maxKB} KB.`));
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:application\/octet-stream/, "data:image/x-icon"));
    r.onerror = () => rej(new Error("Gagal membaca file."));
    r.readAsDataURL(file);
  });
}

/** Muat skrip eksternal sekali saja */
const loaded = {};
export function loadScript(src) {
  if (!loaded[src])
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error("Gagal memuat " + src));
      document.head.appendChild(s);
    });
  return loaded[src];
}
