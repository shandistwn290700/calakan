import { get, post, put, del } from "../api.js";
import { esc, openModal, formData, confirm, toast, alertError, alertOk, dataList, emptyState, initials, waktu, ROLE_LABEL } from "../ui.js";

export default async function akun({ el, me, query }) {
  let users = [], classes = [];
  let role = query.role || "";
  let classFilter = "";

  el.innerHTML = `
    <div class="card">
      <div class="card-h">
        <div class="tabs" id="tabs" style="flex:1"></div>
      </div>
      <div class="card-h" style="border-top:0">
        <div class="search"><i class="bi bi-search"></i><input class="input" id="q" placeholder="Cari nama, username, NIS…"></div>
        <select class="select sm" id="cls" style="width:auto" hidden></select>
        <select class="select sm" id="sort" style="width:auto">
          <option value="name:1">Nama A–Z</option><option value="name:-1">Nama Z–A</option><option value="username:1">Username</option>
          <option value="last_login:-1">Login terbaru</option><option value="created_at:-1">Dibuat terbaru</option></select>
        <div class="spacer"></div>
        <button class="btn ghost sm" id="gen"><i class="bi bi-people"></i> Buat akun ortu massal</button>
        <button class="btn sm" id="add"><i class="bi bi-plus-lg"></i> Tambah Akun</button>
      </div>
      <div class="card-b p0"><div class="table-wrap">
        <table class="t responsive" id="tbl"><thead><tr>
          <th class="sortable" data-sort="name">Nama</th><th class="sortable" data-sort="username">Username</th><th class="sortable" data-sort="role">Peran</th>
          <th>Keterangan</th><th class="sortable" data-sort="is_active">Status</th><th class="sortable" data-sort="last_login">Login Terakhir</th><th></th></tr></thead><tbody></tbody></table>
      </div></div>
    </div>
    <p class="muted small mt"><i class="bi bi-shield-lock"></i> Hanya admin yang dapat membuat akun. Data guru lengkap (mapel & kelas yang diampu) dikelola di menu <a href="#/guru">Data Guru</a>.</p>`;

  const tb = el.querySelector("#tbl tbody");
  const info = (u) => {
    if (u.role === "ortu") return u.student_name ? `Siswa: <b>${esc(u.student_name)}</b> · ${esc(u.student_rombel || "tanpa kelas")}` : "-";
    if (u.role === "wali") return u.homeroom_rombel ? `Wali kelas ${esc(u.homeroom_rombel)}${u.homeroom_as === "pendamping" ? " (pendamping)" : ""}` : `<span class="badge warn">Belum ada kelas</span>`;
    return "";
  };
  const list = dataList({
    data: [],
    table: el.querySelector("#tbl"),
    search: el.querySelector("#q"),
    sortSelect: el.querySelector("#sort"),
    keys: ["name", "username", "nis", "student_rombel", "homeroom_rombel"],
    sort: { key: "name" },
    getters: { last_login: (r) => r.last_login || "", role: (r) => ["admin", "wali", "guru", "ortu"].indexOf(r.role) },
    render(rows) {
      tb.innerHTML = rows.length
        ? rows
            .map(
              (u) => `<tr>
        <td class="main-cell"><div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(u.name))}</span><div class="cell-title">${esc(u.name)}${
                u.id === me.id ? ` <span class="badge">Anda</span>` : ""
              }</div></div></td>
        <td data-label="Username"><code>${esc(u.username)}</code></td>
        <td data-label="Peran"><span class="badge role-${u.role}">${ROLE_LABEL[u.role]}</span></td>
        <td data-label="Keterangan" class="small">${info(u)}${u.devices ? ` <span class="badge info" title="Perangkat menerima push"><i class="bi bi-bell"></i> ${u.devices}</span>` : ""}</td>
        <td data-label="Status">${u.is_active ? `<span class="badge ok">Aktif</span>` : `<span class="badge danger">Nonaktif</span>`}</td>
        <td data-label="Login" class="small muted nowrap">${u.last_login ? esc(waktu(u.last_login)) : "Belum pernah"}</td>
        <td class="actions">
          <button class="btn icon sm ghost" data-edit="${u.id}" title="Ubah"><i class="bi bi-pencil"></i></button>
          <button class="btn icon sm ghost" data-pw="${u.id}" title="Reset password"><i class="bi bi-key"></i></button>
          ${u.id !== me.id ? `<button class="btn icon sm ghost" data-del="${u.id}" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button>` : ""}
        </td></tr>`
            )
            .join("")
        : `<tr><td colspan="7">${emptyState("bi-person-x", "Tidak ada akun")}</td></tr>`;
    },
  });

  function tabs() {
    const count = (r) => (r ? users.filter((u) => u.role === r).length : users.length);
    const items = [["", "Semua"], ["admin", "Admin"], ["wali", "Wali Kelas"], ["guru", "Guru"], ["ortu", "Orang Tua"]];
    el.querySelector("#tabs").innerHTML = items.map(([k, l]) => `<button class="tab ${role === k ? "active" : ""}" data-r="${k}">${l}<span class="n">${count(k)}</span></button>`).join("");
    const cls = el.querySelector("#cls");
    cls.hidden = role !== "ortu";
    cls.innerHTML = `<option value="">Semua kelas</option>` + classes.map((c) => `<option value="${esc(c.rombel)}" ${classFilter === c.rombel ? "selected" : ""}>${esc(c.rombel)} · ${esc(c.name)}</option>`).join("");
  }
  function apply() {
    let rows = users;
    if (role) rows = rows.filter((u) => u.role === role);
    if (role === "ortu" && classFilter) rows = rows.filter((u) => u.student_rombel === classFilter);
    list.refresh(rows);
  }
  async function load() {
    [users, classes] = await Promise.all([get("/users"), get("/classes")]);
    tabs();
    apply();
  }

  el.querySelector("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    role = b.dataset.r;
    classFilter = "";
    history.replaceState(null, "", `#/akun${role ? "?role=" + role : ""}`);
    tabs();
    apply();
  });
  el.querySelector("#cls").onchange = (e) => {
    classFilter = e.target.value;
    apply();
  };

  // ——— Tambah akun ———
  el.querySelector("#add").onclick = async () => {
    const students = (await get("/students")).filter((s) => !s.account_id);
    const ok = await openModal({
      title: "Tambah Akun",
      icon: "bi-person-plus",
      body: `
        <div class="field"><span>Peran</span><div class="row">
          ${["ortu", "wali", "guru", "admin"].map((r, i) => `<label class="chip-check"><input type="radio" name="role" value="${r}" ${(role || "ortu") === r ? "checked" : ""}><span>${ROLE_LABEL[r]}</span></label>`).join("")}
        </div></div>
        <div data-for="ortu"><label class="field"><span>Siswa <em>*</em></span><select class="select" name="student_id">
          <option value="">— Pilih siswa (yang belum memiliki akun) —</option>
          ${students.map((s) => `<option value="${s.id}" data-nis="${esc(s.nis)}">${esc(s.rombel || "-")} · ${esc(s.name)} (${esc(s.nis)})</option>`).join("")}</select>
          <small class="hint">Username otomatis memakai NIS, nama akun memakai nama siswa.</small></label></div>
        <div data-for="staff" hidden>
          <label class="field"><span>Nama Lengkap <em>*</em></span><input class="input" name="name"></label>
          <label class="field"><span>Username <em>*</em></span><input class="input" name="username" autocapitalize="none"></label>
        </div>
        <label class="field"><span>Password <em>*</em></span><input class="input" name="password" type="text" autocomplete="new-password" placeholder="Minimal 6 karakter"></label>
        <div class="callout" data-for="staff-note" hidden><i class="bi bi-info-circle"></i><div><p>Untuk guru & wali kelas, disarankan menambah lewat menu <a href="#/guru">Data Guru</a> agar mapel yang diampu langsung ditetapkan.</p></div></div>`,
      onOpen: (m) => {
        const sync = () => {
          const r = m.querySelector("input[name=role]:checked").value;
          m.querySelector("[data-for=ortu]").hidden = r !== "ortu";
          m.querySelector("[data-for=staff]").hidden = r === "ortu";
          m.querySelector("[data-for=staff-note]").hidden = !(r === "wali" || r === "guru");
        };
        m.querySelectorAll("input[name=role]").forEach((x) => (x.onchange = sync));
        m.querySelector("select[name=student_id]").onchange = (e) => {
          const nis = e.target.selectedOptions[0]?.dataset.nis;
          const pw = m.querySelector("input[name=password]");
          if (nis && !pw.value) pw.value = nis;
        };
        sync();
      },
      onOk: async (m, f) => {
        await post("/users", formData(f));
        return true;
      },
    });
    if (ok) {
      toast("Akun ditambahkan");
      load();
    }
  };

  // ——— Buat akun ortu massal ———
  el.querySelector("#gen").onclick = async () => {
    const r = await openModal({
      title: "Buat Akun Orang Tua Massal",
      icon: "bi-people",
      okText: "Buat Akun",
      body: `<p class="muted" style="margin-top:0">Membuat akun untuk setiap siswa yang <b>belum memiliki akun</b>. Username dan password awal = <b>NIS</b>. Orang tua wajib mengganti password saat pertama masuk.</p>
        <label class="field"><span>Kelas</span><select class="select" name="class_id"><option value="">Semua kelas</option>
        ${classes.map((c) => `<option value="${c.id}">${esc(c.rombel)} · ${esc(c.name)}</option>`).join("")}</select></label>`,
      onOk: async (m, f) => post("/users/generate-parents", { class_id: Number(f.class_id.value) || 0 }),
    });
    if (r) {
      alertOk("Selesai", "", `<b>${r.created}</b> akun orang tua dibuat.${r.skipped.length ? `<br>${r.skipped.length} dilewati karena username (NIS) sudah dipakai.` : ""}`);
      load();
    }
  };

  // ——— Aksi per baris ———
  tb.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const u = users.find((x) => x.id == (b.dataset.edit || b.dataset.pw || b.dataset.del));
    if (b.dataset.edit) {
      const ok = await openModal({
        title: "Ubah Akun",
        icon: "bi-pencil",
        body: `
          <label class="field"><span>Nama</span><input class="input" name="name" value="${esc(u.name)}" ${u.role === "ortu" ? "readonly" : ""}></label>
          <label class="field"><span>Username</span><input class="input" name="username" value="${esc(u.username)}" ${u.role === "ortu" ? "readonly" : ""}>
            ${u.role === "ortu" ? `<small class="hint">Nama & username akun orang tua mengikuti data siswa (ubah di Data Kelas).</small>` : ""}</label>
          <label class="check"><input type="checkbox" name="is_active" ${u.is_active ? "checked" : ""} ${u.id === me.id ? "disabled" : ""}> Akun aktif (dapat masuk)</label>`,
        onOk: async (m, f) => {
          await put(`/users/${u.id}`, formData(f));
          return true;
        },
      });
      if (ok) {
        toast("Akun diperbarui");
        load();
      }
    }
    if (b.dataset.pw) {
      const suggestion = u.role === "ortu" && u.nis ? u.nis : "";
      const ok = await openModal({
        title: "Reset Password",
        icon: "bi-key",
        okText: "Reset",
        body: `<p style="margin-top:0">Atur password baru untuk <b>${esc(u.name)}</b> (${esc(u.username)}).</p>
          <label class="field"><span>Password baru</span><input class="input" name="password" type="text" value="${esc(suggestion)}" placeholder="Minimal 6 karakter"></label>
          <small class="hint">Pengguna akan keluar dari semua perangkat dan wajib membuat password baru saat masuk berikutnya.</small>`,
        onOk: async (m, f) => {
          const pw = f.password.value;
          if (pw.length < 6) throw new Error("Password minimal 6 karakter.");
          await put(`/users/${u.id}`, { password: pw });
          return pw;
        },
      });
      if (ok) alertOk("Password direset", "", `Password baru: <code style="font-size:16px">${esc(ok)}</code><br><small>Sampaikan kepada pengguna secara pribadi.</small>`);
    }
    if (b.dataset.del && (await confirm({ title: `Hapus akun ${u.username}?`, text: "Pengguna tidak dapat lagi masuk ke aplikasi.", ok: "Ya, hapus", danger: true }))) {
      try {
        await del(`/users/${u.id}`);
        toast("Akun dihapus");
        load();
      } catch (err) {
        alertError(err);
      }
    }
  });

  await load();
}
