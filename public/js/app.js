import { get, post, setUnauthorizedHandler } from "./api.js";
import { $, $$, esc, initials, ROLE_LABEL, confirm, toast, alertError } from "./ui.js";
import { registerSW, syncPush } from "./push.js";

// ——————————————————— Menu per peran ———————————————————
const MENUS = {
  admin: [
    { path: "/", icon: "bi-grid-1x2", label: "Dashboard" },
    {
      label: "Data", icon: "bi-database", key: "data",
      children: [
        { path: "/kelas", icon: "bi-building", label: "Data Kelas" },
        { path: "/mapel", icon: "bi-journal-bookmark", label: "Mata Pelajaran" },
        { path: "/guru", icon: "bi-person-badge", label: "Data Guru" },
      ],
    },
    { path: "/jadwal", icon: "bi-calendar3", label: "Jadwal Pelajaran" },
    { path: "/calakan", icon: "bi-journal-richtext", label: "CALAKAN" },
    {
      label: "Pengaturan", icon: "bi-gear", key: "setting",
      children: [
        { path: "/akun", icon: "bi-people", label: "Akun" },
        { path: "/tampilan", icon: "bi-palette", label: "Tampilan" },
        { path: "/backup", icon: "bi-cloud-arrow-down", label: "Backup & Restore" },
      ],
    },
  ],
  wali: [
    { path: "/", icon: "bi-grid-1x2", label: "Dashboard" },
    { path: "/isi", icon: "bi-pencil-square", label: "Isi Rencana" },
    { path: "/calakan", icon: "bi-journal-richtext", label: "CALAKAN Kelas Saya" },
    { path: "/jadwal-saya", icon: "bi-calendar3", label: "Jadwal Mengajar" },
    { path: "/notifikasi", icon: "bi-bell", label: "Notifikasi", badge: true },
    { path: "/profil", icon: "bi-person-circle", label: "Profil" },
  ],
  guru: [
    { path: "/", icon: "bi-grid-1x2", label: "Dashboard" },
    { path: "/isi", icon: "bi-pencil-square", label: "Isi Rencana" },
    { path: "/jadwal-saya", icon: "bi-calendar3", label: "Jadwal Mengajar" },
    { path: "/notifikasi", icon: "bi-bell", label: "Notifikasi", badge: true },
    { path: "/profil", icon: "bi-person-circle", label: "Profil" },
  ],
  ortu: [
    { path: "/", icon: "bi-house-heart", label: "Beranda" },
    { path: "/calakan", icon: "bi-journal-richtext", label: "CALAKAN" },
    { path: "/notifikasi", icon: "bi-bell", label: "Notifikasi", badge: true },
    { path: "/profil", icon: "bi-person-circle", label: "Profil" },
  ],
};

// ——————————————————— Rute ———————————————————
const ROUTES = {
  "/": { title: "Dashboard", page: "dashboard" },
  "/kelas": { title: "Data Kelas", page: "kelas", roles: ["admin"] },
  "/mapel": { title: "Mata Pelajaran", page: "mapel", roles: ["admin"] },
  "/guru": { title: "Data Guru", page: "guru", roles: ["admin"] },
  "/jadwal": { title: "Jadwal Pelajaran", page: "jadwal", roles: ["admin"] },
  "/jadwal-saya": { title: "Jadwal Mengajar", page: "jadwal-saya", roles: ["wali", "guru"] },
  "/calakan": { title: "CALAKAN", page: "calakan", roles: ["admin", "wali", "ortu"] },
  "/isi": { title: "Isi Rencana Pembelajaran", page: "isi", roles: ["admin", "wali", "guru"] },
  "/akun": { title: "Pengaturan Akun", page: "akun", roles: ["admin"] },
  "/tampilan": { title: "Pengaturan Tampilan", page: "tampilan", roles: ["admin"] },
  "/backup": { title: "Backup & Restore", page: "backup", roles: ["admin"] },
  "/notifikasi": { title: "Notifikasi", page: "notifikasi" },
  "/profil": { title: "Profil & Keamanan", page: "profil" },
};

export const state = { me: null, leaveGuard: null };

// ——————————————————— Tema ———————————————————
export function applyTheme(s) {
  if (!s) return;
  document.documentElement.style.setProperty("--p", s.primary_color || "#0f766e");
  $('meta[name="theme-color"]')?.setAttribute("content", s.primary_color || "#0f766e");
  const v = s.version || "1";
  const fav = $("#favicon");
  if (fav) fav.href = `/favicon.ico?v=${v}`;
  $$("img[data-logo]").forEach((i) => (i.src = `/logo?v=${v}`));
}

// ——————————————————— Boot ———————————————————
async function boot() {
  registerSW();
  setUnauthorizedHandler(() => {
    if (state.me) {
      state.me = null;
      toast("Sesi berakhir, silakan masuk kembali.", "info");
      showLogin();
    }
  });
  try {
    state.me = await get("/auth/me", { quiet: true });
    if (state.me?.guest) state.me = null;
  } catch (e) {
    state.me = null;
    if (e.status !== 401) {
      hideSplash();
      $("#app").innerHTML = `<div class="empty" style="padding-top:20vh"><i class="bi bi-wifi-off"></i><b>Tidak dapat memuat aplikasi</b>
        <span>${esc(e.message)}</span><div class="mt"><button class="btn" id="btn-retry">Coba lagi</button></div></div>`;
      $("#btn-retry").onclick = () => location.reload();
      return;
    }
  }
  if (!state.me) return showLogin();
  startApp();
}

function hideSplash() {
  const s = $("#splash");
  if (!s) return;
  s.classList.add("hide");
  setTimeout(() => s.remove(), 400);
}

async function showLogin() {
  const settings = await get("/public/settings", { quiet: true }).catch(() => ({}));
  applyTheme(settings);
  document.title = `Masuk – ${settings.app_name || "CALAKAN"}`;
  const { default: login } = await import("./pages/login.js");
  login($("#app"), settings, async () => {
    state.me = await get("/auth/me");
    startApp(true);
    return state.me;
  });
  hideSplash();
}

export async function refreshMe() {
  state.me = await get("/auth/me", { quiet: true });
  applyTheme(state.me.settings);
  renderShell();
  state.leaveGuard = null;
  route();
  return state.me;
}

/** Password bawaan / dibuat admin: wajib diganti sebelum aplikasi bisa dipakai */
async function showForceChange() {
  applyTheme(state.me.settings);
  document.title = `Ganti Password – ${state.me.settings?.app_name || "CALAKAN"}`;
  const { default: page } = await import("./pages/ganti-password.js");
  page(
    $("#app"),
    state.me,
    async () => {
      state.me = await get("/auth/me");
      startApp(true);
    },
    async () => {
      await post("/auth/logout", {}).catch(() => {});
      state.me = null;
      location.hash = "";
      showLogin();
    }
  );
  hideSplash();
}

function startApp(fromLogin = false) {
  if (state.me.must_change_password) return showForceChange();
  applyTheme(state.me.settings);
  renderShell();
  window.removeEventListener("hashchange", route);
  window.addEventListener("hashchange", route);
  if (fromLogin) location.hash = "#/";
  route();
  hideSplash();
  syncPush();
}

// ——————————————————— Kerangka (sidebar + topbar) ———————————————————
function menuHtml(items) {
  return items
    .map((m) => {
      if (m.children) {
        return `<div class="group" data-group="${m.key}">
          <button class="nav-item" type="button"><i class="bi ${m.icon}"></i><span>${m.label}</span><i class="bi bi-chevron-right chev"></i></button>
          <div class="sub">${menuHtml(m.children)}</div></div>`;
      }
      return `<a href="#${m.path}" data-path="${m.path}"><i class="bi ${m.icon}"></i><span>${m.label}</span>${m.badge ? `<span class="badge-dot" data-unread hidden></span>` : ""}</a>`;
    })
    .join("");
}

function renderShell() {
  const me = state.me;
  const s = me.settings;
  document.title = s.app_name;
  const subtitle =
    me.role === "ortu" && me.student
      ? `Kelas ${me.student.tingkat ?? ""} ${me.student.class_name ?? ""}`
      : me.role === "wali" && me.homeroom
      ? `Wali Kelas${me.homeroom.as_role === "pendamping" ? " Pendamping" : ""} ${me.homeroom.tingkat} ${me.homeroom.name}`
      : ROLE_LABEL[me.role];
  $("#app").innerHTML = `
    <div class="layout" id="layout">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img data-logo src="/logo?v=${s.version}" alt=""><div><b>${esc(s.app_name)}</b><small>${esc(s.school_name || s.app_subtitle)}</small></div></div>
        <nav class="nav">
          <div class="nav-label">Menu</div>
          ${menuHtml(MENUS[me.role] || [])}
          <div class="nav-label">Akun</div>
          <button class="nav-item logout" type="button" id="btn-logout"><i class="bi bi-box-arrow-left"></i><span>Log out</span></button>
        </nav>
        <div class="side-foot">
          <div class="side-user"><div class="avatar">${esc(initials(me.name))}</div>
            <div style="min-width:0"><b>${esc(me.name)}</b><small>${esc(subtitle)}</small></div></div>
        </div>
      </aside>
      <div class="backdrop" id="backdrop"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn hamburger" id="btn-menu" aria-label="Menu"><i class="bi bi-list"></i></button>
          <h1 id="page-title"></h1>
          <a class="icon-btn" href="#/notifikasi" title="Notifikasi" id="btn-bell"><i class="bi bi-bell"></i><span class="count" data-unread hidden></span></a>
        </header>
        <main class="content" id="view"></main>
        <div class="footer">${esc(s.footer_text || `© ${new Date().getFullYear()} ${s.school_name} · ${s.app_name} – ${s.app_subtitle}`)}</div>
      </div>
    </div>`;

  const layout = $("#layout");
  $("#btn-menu").onclick = () => layout.classList.add("nav-open");
  $("#backdrop").onclick = () => layout.classList.remove("nav-open");
  $$(".nav .group > button").forEach((b) => (b.onclick = () => b.parentElement.classList.toggle("open")));
  $$(".nav a").forEach((a) => a.addEventListener("click", () => layout.classList.remove("nav-open")));
  $("#btn-logout").onclick = logout;
  if (me.role === "admin") $("#btn-bell").hidden = true;
  setUnread(me.unread);
}

export function setUnread(n) {
  if (state.me) state.me.unread = n;
  $$("[data-unread]").forEach((el) => {
    el.hidden = !n;
    el.textContent = n > 99 ? "99+" : n;
  });
}

async function logout() {
  if (!(await confirm({ title: "Keluar dari aplikasi?", icon: "question", ok: "Ya, keluar" }))) return;
  await post("/auth/logout", {}).catch(() => {});
  state.me = null;
  location.hash = "";
  showLogin();
}

// ——————————————————— Router ———————————————————
let current = null;
let lastHash = location.hash;

function parseHash() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

export function go(path) {
  location.hash = "#" + path;
}

async function route() {
  if (!state.me || state.me.must_change_password) return;
  // cegah meninggalkan halaman bila ada perubahan belum disimpan
  if (state.leaveGuard && location.hash !== lastHash) {
    const ok = await state.leaveGuard();
    if (!ok) {
      history.replaceState(null, "", lastHash || "#/");
      return;
    }
  }
  state.leaveGuard = null;
  state.dirty = false;
  lastHash = location.hash;
  const { path, query } = parseHash();
  let r = ROUTES[path];
  if (!r || (r.roles && !r.roles.includes(state.me.role))) {
    if (path !== "/") return go("/");
    r = ROUTES["/"];
  }
  const token = (current = {});
  $$(".nav a").forEach((a) => {
    const on = a.dataset.path === path;
    a.classList.toggle("active", on);
    if (on) a.closest(".group")?.classList.add("open");
  });
  const titleEl = $("#page-title");
  titleEl.textContent = r.title;
  const view = $("#view");
  view.innerHTML = `<div class="page">${'<div class="card skel-card"><div class="skel" style="width:40%"></div><div class="skel"></div><div class="skel" style="width:80%"></div></div>'}</div>`;
  window.scrollTo({ top: 0 });
  try {
    const mod = await import(`./pages/${r.page}.js`);
    if (token !== current) return;
    const el = document.createElement("div");
    el.className = "page";
    view.innerHTML = "";
    view.appendChild(el);
    await mod.default({
      el,
      me: state.me,
      query,
      setTitle: (t) => (titleEl.textContent = t),
      setLeaveGuard: (fn) => (state.leaveGuard = fn),
      isCurrent: () => token === current,
    });
  } catch (e) {
    console.error(e);
    if (token !== current) return;
    view.innerHTML = `<div class="card"><div class="empty"><i class="bi bi-exclamation-octagon"></i><b>Halaman gagal dimuat</b><span>${esc(e.message)}</span></div></div>`;
  }
}

window.addEventListener("beforeunload", (e) => {
  if (state.leaveGuard && state.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// pesan dari service worker (push masuk saat aplikasi terbuka)
navigator.serviceWorker?.addEventListener("message", (ev) => {
  if (ev.data?.type === "push" && state.me) {
    setUnread((state.me.unread || 0) + 1);
    toast(ev.data.data?.title || "Notifikasi baru", "info");
  }
});

window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.status) {
    e.preventDefault();
    alertError(e.reason);
  }
});

boot();
