import { get, post, put, del } from "../api.js";
import { esc, openModal, formData, confirm, toast, alertError, dataList, emptyState, initials, waktu } from "../ui.js";

export default async function guru({ el }) {
  let teachers = [], classes = [], subjects = [];
  el.innerHTML = `
    <div class="card">
      <div class="card-h">
        <h3><i class="bi bi-person-badge" style="color:var(--p)"></i> Data Guru & Wali Kelas</h3>
        <div class="search"><i class="bi bi-search"></i><input class="input" id="q" placeholder="Cari nama, NIP, mapel, kelas…"></div>
        <button class="btn" id="add"><i class="bi bi-person-plus"></i> Tambah Guru</button>
      </div>
      <div class="card-b p0">
        <div class="table-wrap"><table class="t responsive" id="t-wali"><thead><tr>
          <th>Kelas</th><th>Wali Kelas</th><th>Mapel yang Diampu</th><th>Login Terakhir</th><th></th></tr></thead>
          <tbody></tbody></table></div>
      </div>
    </div>
    <div class="card mt">
      <div class="card-h"><h3><i class="bi bi-person-video3" style="color:var(--p)"></i> Guru Mata Pelajaran</h3>
        <select class="select sm" id="sort" style="width:auto"><option value="name:1">Nama A–Z</option><option value="name:-1">Nama Z–A</option>
        <option value="mapel:1">Mapel A–Z</option><option value="jml:-1">Beban terbanyak</option></select></div>
      <div class="card-b p0">
        <div class="table-wrap"><table class="t responsive" id="t-guru"><thead><tr>
          <th class="sortable" data-sort="name">Nama Guru</th><th class="sortable" data-sort="mapel">Mapel yang Diampu</th><th class="sortable" data-sort="jml">Kelas</th><th>Login Terakhir</th><th></th></tr></thead>
          <tbody></tbody></table></div>
      </div>
    </div>`;

  const asgHtml = (t) =>
    t.assignments.length
      ? `<div class="chips">${t.assignments.map((a) => `<span class="badge p" title="${esc(a.rombels.join(", "))}">${esc(a.subject)} <span style="opacity:.7">· ${esc(a.rombels.join(", "))}</span></span>`).join("")}</div>`
      : `<span class="muted small">Belum ada</span>`;
  const person = (t) =>
    `<div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(t.name))}</span><div><div class="cell-title">${esc(t.name)}${
      t.is_active ? "" : ` <span class="badge danger">Nonaktif</span>`
    }</div><div class="cell-sub">${esc(t.username)}${t.nip ? " · NIP " + esc(t.nip) : ""}</div></div></div>`;
  const actions = (t) => `<td class="actions"><button class="btn icon sm ghost" data-edit="${t.id}" title="Ubah"><i class="bi bi-pencil"></i></button>
    <button class="btn icon sm ghost" data-del="${t.id}" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button></td>`;

  const search = el.querySelector("#q");
  const keys = ["name", "username", "nip", "homeroom_rombel", "homeroom_name", (r) => r.assignments.map((a) => a.subject + " " + a.rombels.join(" ")).join(" ")];

  // Wali kelas: selalu urut rombel
  const listW = dataList({
    data: [],
    search,
    keys,
    sort: { key: "rombel_sort" },
    render(rows) {
      el.querySelector("#t-wali tbody").innerHTML = rows.length
        ? rows
            .map(
              (t) => `<tr>
          <td data-label="Kelas">${t.homeroom_rombel ? `<span class="badge p" style="font-size:13px">${esc(t.homeroom_rombel)}</span> <span class="small">${esc(t.homeroom_name)}</span>${t.homeroom_as === "pendamping" ? ` <span class="badge">Pendamping</span>` : ""}` : `<span class="badge warn">Belum ditetapkan</span>`}</td>
          <td class="main-cell">${person(t)}</td>
          <td data-label="Mapel">${asgHtml(t)}</td>
          <td data-label="Login" class="small muted nowrap">${t.last_login ? esc(waktu(t.last_login)) : "Belum pernah"}</td>
          ${actions(t)}</tr>`
            )
            .join("")
        : `<tr><td colspan="5">${emptyState("bi-person-x", "Belum ada wali kelas")}</td></tr>`;
    },
  });
  const listG = dataList({
    data: [],
    search,
    keys,
    table: el.querySelector("#t-guru"),
    sortSelect: el.querySelector("#sort"),
    sort: { key: "name" },
    getters: { mapel: (r) => r.assignments[0]?.subject || "~", jml: (r) => r.assignments.reduce((a, x) => a + x.class_ids.length, 0) },
    render(rows) {
      el.querySelector("#t-guru tbody").innerHTML = rows.length
        ? rows
            .map(
              (t) => `<tr><td class="main-cell">${person(t)}</td><td data-label="Mapel">${asgHtml(t)}</td>
          <td data-label="Kelas">${t.assignments.reduce((a, x) => a + x.class_ids.length, 0)} kelas</td>
          <td data-label="Login" class="small muted nowrap">${t.last_login ? esc(waktu(t.last_login)) : "Belum pernah"}</td>${actions(t)}</tr>`
            )
            .join("")
        : `<tr><td colspan="5">${emptyState("bi-person-x", "Belum ada guru mata pelajaran")}</td></tr>`;
    },
  });

  async function load() {
    [teachers, classes, subjects] = await Promise.all([get("/teachers"), get("/classes"), get("/subjects")]);
    teachers.forEach((t) => (t.rombel_sort = t.homeroom_rombel ? `${t.homeroom_tingkat}-${t.homeroom_rombel}-${t.homeroom_as === "pendamping" ? 2 : 1}` : "zz"));
    listW.refresh(teachers.filter((t) => t.role === "wali"));
    listG.refresh(teachers.filter((t) => t.role === "guru"));
  }

  // ——— Editor penugasan (mapel × kelas) ———
  const asgRow = (a = {}) => `
    <div class="card" data-asg style="padding:12px;margin-bottom:10px;box-shadow:none">
      <div class="row" style="flex-wrap:nowrap">
        <select class="select sm" data-subj><option value="">— Pilih mata pelajaran —</option>
          ${subjects.map((s) => `<option value="${s.id}" ${a.subject_id == s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>
        <button type="button" class="btn icon sm ghost" data-rm title="Hapus baris"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="row" style="margin-top:10px;align-items:flex-start">
        <div class="chips" style="flex:1">${classes
          .map(
            (c) => `<label class="chip-check"><input type="checkbox" value="${c.id}" ${a.class_ids?.includes(c.id) ? "checked" : ""}><span>${esc(c.rombel)}</span></label>`
          )
          .join("")}</div>
        <button type="button" class="btn sm ghost" data-all>Semua</button>
      </div>
    </div>`;

  async function form(t = { assignments: [] }) {
    const payload = await openModal({
      title: t.id ? "Ubah Data Guru" : "Tambah Guru",
      icon: "bi-person-badge",
      size: "lg",
      body: `
        <div class="grid c2">
          <label class="field"><span>Nama Lengkap (dengan gelar/sapaan) <em>*</em></span><input class="input" name="name" value="${esc(t.name || "")}" placeholder="Ustadzah Siti Aminah, S.Pd"></label>
          <label class="field"><span>Jenis Kelamin</span><select class="select" name="gender"><option value="">-</option>
            <option value="L" ${t.gender === "L" ? "selected" : ""}>Laki-laki</option><option value="P" ${t.gender === "P" ? "selected" : ""}>Perempuan</option></select></label>
          <label class="field"><span>NIP / NIY</span><input class="input" name="nip" value="${esc(t.nip || "")}"></label>
          <label class="field"><span>No. HP</span><input class="input" name="phone" value="${esc(t.phone || "")}" inputmode="tel"></label>
        </div>
        <div class="grid c2">
          <div class="field"><span>Peran <em>*</em></span>
            <div class="row"><label class="chip-check"><input type="radio" name="role" value="wali" ${t.role === "wali" ? "checked" : ""}><span><i class="bi bi-house-door"></i> Wali Kelas</span></label>
            <label class="chip-check"><input type="radio" name="role" value="guru" ${t.role !== "wali" ? "checked" : ""}><span><i class="bi bi-person-video3"></i> Guru Mapel</span></label></div></div>
          <label class="field" data-homeroom><span>Wali untuk Kelas</span><select class="select" name="homeroom_id"><option value="">— Pilih kelas —</option>
            ${classes
              .map(
                (c) => `<option value="${c.id}" data-tingkat="${c.tingkat}" ${t.homeroom_id === c.id ? "selected" : ""}>${esc(c.rombel)} · ${esc(c.name)}${c.wali_name && c.wali_id !== t.id ? ` (kini: ${esc(c.wali_name)})` : ""}</option>`
              )
              .join("")}</select></label>
        </div>
        <div class="grid c2" data-as hidden>
          <div></div>
          <label class="field"><span>Sebagai</span><select class="select" name="homeroom_as">
            <option value="utama" ${t.homeroom_as !== "pendamping" ? "selected" : ""}>Wali kelas utama</option>
            <option value="pendamping" ${t.homeroom_as === "pendamping" ? "selected" : ""}>Wali kelas pendamping</option></select>
            <small class="hint">Kelas 1 dan 2 (Fase A) boleh memiliki wali utama dan pendamping.</small></label>
        </div>
        <div class="grid c2">
          <label class="field"><span>Username <em>*</em></span><input class="input" name="username" value="${esc(t.username || "")}" autocapitalize="none" placeholder="siti.aminah"></label>
          <label class="field"><span>Password ${t.id ? "" : "<em>*</em>"}</span><input class="input" name="password" type="text" autocomplete="new-password" placeholder="${t.id ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"}"></label>
        </div>
        <div class="field"><span>Mata Pelajaran yang Diampu & Kelasnya</span>
          <small class="hint" style="margin:0 0 10px">Wali kelas juga dapat mengajar di kelas lain sesuai penugasan.</small>
          <div id="asg-list">${(t.assignments.length ? t.assignments : [{}]).map(asgRow).join("")}</div>
          <button type="button" class="btn sm soft" id="asg-add"><i class="bi bi-plus-lg"></i> Tambah mapel</button>
        </div>`,
      onOpen: (m) => {
        const list = m.querySelector("#asg-list");
        const hr = m.querySelector("select[name=homeroom_id]");
        const toggleHome = () => {
          const isWali = m.querySelector("input[name=role]:checked").value === "wali";
          m.querySelector("[data-homeroom]").hidden = !isWali;
          const fa = isWali && Number(hr.selectedOptions[0]?.dataset.tingkat) <= 2;
          m.querySelector("[data-as]").hidden = !fa;
          if (!fa) m.querySelector("select[name=homeroom_as]").value = "utama";
        };
        m.querySelectorAll("input[name=role]").forEach((r) => (r.onchange = toggleHome));
        hr.onchange = toggleHome;
        toggleHome();
        m.querySelector("#asg-add").onclick = () => list.insertAdjacentHTML("beforeend", asgRow());
        list.addEventListener("click", (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          const row = b.closest("[data-asg]");
          if (b.dataset.rm !== undefined) row.remove();
          if (b.dataset.all !== undefined) {
            const boxes = [...row.querySelectorAll("input[type=checkbox]")];
            const all = boxes.every((x) => x.checked);
            boxes.forEach((x) => (x.checked = !all));
          }
        });
      },
      onOk: async (m, f) => {
        const d = formData(f);
        d.assignments = [...m.querySelectorAll("[data-asg]")]
          .map((r) => ({
            subject_id: Number(r.querySelector("[data-subj]").value),
            class_ids: [...r.querySelectorAll("input[type=checkbox]:checked")].map((x) => Number(x.value)),
          }))
          .filter((a) => a.subject_id && a.class_ids.length);
        const send = (force) => (t.id ? put(`/teachers/${t.id}`, { ...d, force }) : post("/teachers", { ...d, force }));
        try {
          await send(false);
        } catch (err) {
          if (err.status !== 409) throw err;
          const ok = await confirm({
            title: "Mapel sudah diampu guru lain",
            html: `<ul>${err.data.conflicts.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>Alihkan penugasan tersebut ke <b>${esc(d.name)}</b>?`,
            ok: "Ya, alihkan",
          });
          if (!ok) return false;
          await send(true);
        }
        return true;
      },
    });
    if (payload) {
      toast(t.id ? "Data guru diperbarui" : "Guru ditambahkan");
      await load();
    }
  }

  el.querySelector("#add").onclick = () => form();
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-edit],button[data-del]");
    if (!b) return;
    const t = teachers.find((x) => x.id == (b.dataset.edit || b.dataset.del));
    if (b.dataset.edit) return form(t);
    if (
      await confirm({
        title: `Hapus ${t.name}?`,
        html: "Akun login dan seluruh penugasan mapelnya akan dihapus. Isian CALAKAN yang sudah dibuat tetap tersimpan.",
        ok: "Ya, hapus",
        danger: true,
      })
    ) {
      try {
        await del(`/teachers/${t.id}`);
        toast("Guru dihapus");
        await load();
      } catch (err) {
        alertError(err);
      }
    }
  });
  await load();
}
