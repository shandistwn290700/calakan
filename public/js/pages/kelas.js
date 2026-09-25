import { get, post, put, del, api, download } from "../api.js";
import { esc, openModal, formData, confirm, toast, alertError, alertOk, dataList, emptyState, withBtn } from "../ui.js";

export default async function kelas({ el, query }) {
  let classes = [], teachers = [], students = [];
  let selected = query.class_id ? Number(query.class_id) : null;

  el.innerHTML = `
    <div class="card">
      <div class="card-h">
        <h3><i class="bi bi-building" style="color:var(--p)"></i> Daftar Kelas</h3>
        <div class="search"><i class="bi bi-search"></i><input class="input" id="q-kelas" placeholder="Cari kelas / wali…"></div>
        <button class="btn" id="add-kelas"><i class="bi bi-plus-lg"></i> Tambah Kelas</button>
      </div>
      <div class="card-b p0"><div class="table-wrap">
        <table class="t responsive" id="t-kelas"><thead><tr>
          <th class="sortable" data-sort="rombel">Rombel</th><th class="sortable" data-sort="name">Nama Kelas</th>
          <th class="sortable" data-sort="fase">Fase</th><th class="sortable" data-sort="wali_name">Wali Kelas</th>
          <th class="sortable" data-sort="student_count">Siswa</th><th></th></tr></thead><tbody></tbody></table>
      </div></div>
    </div>

    <div class="card mt" id="card-siswa">
      <div class="card-h">
        <h3><i class="bi bi-mortarboard" style="color:var(--p)"></i> Data Siswa</h3>
        <select class="select sm" id="sel-kelas" style="width:auto;min-width:200px"></select>
      </div>
      <div class="card-h" style="border-top:0;padding-top:0">
        <div class="search"><i class="bi bi-search"></i><input class="input" id="q-siswa" placeholder="Cari NIS / nama siswa…"></div>
        <select class="select sm" id="sort-siswa" style="width:auto">
          <option value="name:1">Nama A–Z</option><option value="name:-1">Nama Z–A</option>
          <option value="nis:1">NIS terkecil</option><option value="nis:-1">NIS terbesar</option><option value="gender:1">Jenis kelamin</option>
        </select>
        <div class="spacer"></div>
        <button class="btn ghost sm" id="tpl"><i class="bi bi-file-earmark-arrow-down"></i> Template</button>
        <button class="btn ghost sm" id="imp"><i class="bi bi-file-earmark-arrow-up"></i> Impor Excel</button>
        <button class="btn sm" id="add-siswa"><i class="bi bi-person-plus"></i> Tambah Siswa</button>
      </div>
      <div class="card-b p0"><div class="table-wrap">
        <table class="t responsive" id="t-siswa"><thead><tr>
          <th>No</th><th class="sortable" data-sort="nis">NIS</th><th class="sortable" data-sort="name">Nama Siswa</th><th class="sortable" data-sort="gender">L/P</th>
          <th>Akun Orang Tua</th><th></th></tr></thead><tbody></tbody></table>
      </div></div>
    </div>`;

  const tbK = el.querySelector("#t-kelas tbody");
  const tbS = el.querySelector("#t-siswa tbody");

  async function loadClasses() {
    [classes, teachers] = await Promise.all([get("/classes"), get("/teachers")]);
    classes.forEach((c) => (c.rombel_sort = `${c.tingkat}-${c.rombel}`));
    listK.refresh(classes);
    const sel = el.querySelector("#sel-kelas");
    sel.innerHTML =
      classes.map((c) => `<option value="${c.id}">${esc(c.rombel)} · ${esc(c.name)} (${c.student_count})</option>`).join("") +
      `<option value="none">— Siswa belum punya kelas —</option>`;
    if (!selected && classes[0]) selected = classes[0].id;
    sel.value = selected || "none";
  }

  const listK = dataList({
    data: [],
    table: el.querySelector("#t-kelas"),
    search: el.querySelector("#q-kelas"),
    keys: ["rombel", "name", "wali_name", "wali2_name", "kelompok"],
    sort: { key: "rombel" },
    getters: { rombel: (r) => r.rombel_sort },
    render(rows) {
      tbK.innerHTML = rows.length
        ? rows
            .map(
              (c) => `<tr>
          <td data-label="Rombel"><span class="badge p" style="font-size:13px">${esc(c.rombel)}</span></td>
          <td class="main-cell"><div class="cell-title">${c.tingkat} ${esc(c.name)}</div>${c.kelompok ? `<div class="cell-sub">${esc(c.kelompok)}</div>` : ""}</td>
          <td data-label="Fase">Fase ${c.fase}</td>
          <td data-label="Wali Kelas">${c.wali_name ? esc(c.wali_name) : `<span class="badge warn">Belum ada</span>`}${
            c.wali2_name ? `<div class="cell-sub">Pendamping: ${esc(c.wali2_name)}</div>` : ""
          }</td>
          <td data-label="Siswa"><b>${c.student_count}</b> siswa</td>
          <td class="actions">
            <button class="btn sm soft" data-students="${c.id}"><i class="bi bi-people"></i> Siswa</button>
            <button class="btn icon sm ghost" data-edit="${c.id}" title="Ubah"><i class="bi bi-pencil"></i></button>
            <button class="btn icon sm ghost" data-del="${c.id}" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button>
          </td></tr>`
            )
            .join("")
        : `<tr><td colspan="6">${emptyState("bi-building-add", "Belum ada kelas", "Klik “Tambah Kelas” untuk memulai.")}</td></tr>`;
    },
  });

  const listS = dataList({
    data: [],
    table: el.querySelector("#t-siswa"),
    search: el.querySelector("#q-siswa"),
    sortSelect: el.querySelector("#sort-siswa"),
    keys: ["nis", "name"],
    sort: { key: "name" },
    render(rows) {
      tbS.innerHTML = rows.length
        ? rows
            .map(
              (s, i) => `<tr>
          <td data-label="No" class="muted">${i + 1}</td>
          <td data-label="NIS"><code>${esc(s.nis)}</code></td>
          <td class="main-cell"><div class="cell-title">${esc(s.name)}</div>${selected === "none" ? "" : ""}</td>
          <td data-label="L/P">${s.gender ? `<span class="badge ${s.gender === "L" ? "info" : "role-ortu"}">${s.gender}</span>` : "-"}</td>
          <td data-label="Akun ortu">${
            s.account_id
              ? `<span class="badge ok"><i class="bi bi-check-circle"></i> ${esc(s.username)}</span>`
              : `<button class="btn sm ghost" data-acc="${s.id}"><i class="bi bi-person-plus"></i> Buat akun</button>`
          }</td>
          <td class="actions">
            <button class="btn icon sm ghost" data-sedit="${s.id}" title="Ubah"><i class="bi bi-pencil"></i></button>
            <button class="btn icon sm ghost" data-sdel="${s.id}" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button>
          </td></tr>`
            )
            .join("")
        : `<tr><td colspan="6">${emptyState("bi-person-x", "Belum ada siswa", "Tambahkan siswa satu per satu atau impor dari Excel.")}</td></tr>`;
    },
  });

  async function loadStudents() {
    if (!selected) {
      students = [];
      return listS.refresh([]);
    }
    tbS.innerHTML = `<tr><td colspan="6"><div class="skel" style="margin:14px 0"></div><div class="skel" style="width:70%;margin-bottom:14px"></div></td></tr>`;
    students = await get(`/students?class_id=${selected}`);
    listS.refresh(students);
  }

  // ——— Form kelas ———
  async function formKelas(c = {}) {
    const walis = teachers.filter((t) => t.role === "wali");
    const waliOpts = (sel) =>
      walis
        .map(
          (w) =>
            `<option value="${w.id}" ${sel === w.id ? "selected" : ""}>${esc(w.name)}${
              w.homeroom_id && w.homeroom_id !== c.id ? ` (saat ini ${esc(w.homeroom_rombel)}${w.homeroom_as === "pendamping" ? " · pendamping" : ""})` : ""
            }</option>`
        )
        .join("");
    await openModal({
      title: c.id ? "Ubah Kelas" : "Tambah Kelas",
      icon: "bi-building",
      body: `
        <div class="grid c2">
          <label class="field"><span>Tingkat <em>*</em></span><select class="select" name="tingkat">${[1, 2, 3, 4, 5, 6]
            .map((n) => `<option ${c.tingkat == n ? "selected" : ""}>${n}</option>`)
            .join("")}</select></label>
          <label class="field"><span>Kode Rombel <em>*</em></span><input class="input" name="rombel" value="${esc(c.rombel || "")}" placeholder="1A" maxlength="10">
          <small class="hint">Dipakai untuk urutan & impor siswa.</small></label>
        </div>
        <label class="field"><span>Nama Kelas <em>*</em></span><input class="input" name="name" value="${esc(c.name || "")}" placeholder="Abu Bakar Ash-Shiddiq"></label>
        <label class="field"><span>Kelompok / Label Cetak</span><input class="input" name="kelompok" value="${esc(c.kelompok || "")}" placeholder="Kelas Shigor">
          <small class="hint">Muncul di kop CALAKAN (contoh: KELAS SHIGOR). Kosongkan untuk “FASE A/B/C”.</small></label>
        <label class="field"><span>Wali Kelas <span data-w2-label hidden>Utama</span></span><select class="select" name="wali_id"><option value="">— Pilih wali kelas —</option>
          ${waliOpts(c.wali_id)}</select>
          <small class="hint">Daftar berisi guru berperan “Wali Kelas”. Tambahkan di menu Data Guru.</small></label>
        <label class="field" data-w2 hidden><span>Wali Kelas Pendamping</span><select class="select" name="wali2_id"><option value="">— Tanpa pendamping —</option>
          ${waliOpts(c.wali2_id)}</select>
          <small class="hint">Khusus kelas 1 dan 2 (Fase A). Pendamping memiliki hak yang sama dengan wali utama.</small></label>`,
      onOpen: (m, f) => {
        const sync = () => {
          const fa = Number(f.tingkat.value) <= 2;
          m.querySelector("[data-w2]").hidden = !fa;
          m.querySelector("[data-w2-label]").hidden = !fa;
          if (!fa) f.wali2_id.value = "";
        };
        f.tingkat.onchange = sync;
        sync();
      },
      onOk: async (m, f) => {
        const d = formData(f);
        if (c.id) await put(`/classes/${c.id}`, d);
        else {
          const r = await post("/classes", d);
          selected = r.id;
        }
        toast(c.id ? "Kelas diperbarui" : "Kelas ditambahkan");
        await loadClasses();
        await loadStudents();
      },
    });
  }

  // ——— Form siswa ———
  async function formSiswa(s = {}) {
    await openModal({
      title: s.id ? "Ubah Data Siswa" : "Tambah Siswa",
      icon: "bi-person-vcard",
      body: `
        <div class="grid c2">
          <label class="field"><span>NIS <em>*</em></span><input class="input" name="nis" value="${esc(s.nis || "")}" inputmode="numeric" placeholder="2026001"></label>
          <label class="field"><span>Jenis Kelamin</span><select class="select" name="gender"><option value="">-</option>
            <option value="L" ${s.gender === "L" ? "selected" : ""}>Laki-laki</option><option value="P" ${s.gender === "P" ? "selected" : ""}>Perempuan</option></select></label>
        </div>
        <label class="field"><span>Nama Lengkap Siswa <em>*</em></span><input class="input" name="name" value="${esc(s.name || "")}"></label>
        <label class="field"><span>Kelas</span><select class="select" name="class_id"><option value="">— Tanpa kelas —</option>
          ${classes.map((c) => `<option value="${c.id}" ${(s.class_id ?? (selected !== "none" ? selected : null)) == c.id ? "selected" : ""}>${esc(c.rombel)} · ${esc(c.name)}</option>`).join("")}</select></label>
        ${
          s.id
            ? `<small class="hint">Username akun orang tua otomatis mengikuti NIS.</small>`
            : `<label class="check"><input type="checkbox" name="create_account" checked> Buatkan akun orang tua sekaligus</label>
               <small class="hint" style="display:block;margin-top:6px">Username = NIS, password awal = NIS (orang tua wajib menggantinya saat pertama masuk).</small>`
        }`,
      onOk: async (m, f) => {
        const d = formData(f);
        if (s.id) await put(`/students/${s.id}`, d);
        else await post("/students", d);
        toast(s.id ? "Data siswa diperbarui" : "Siswa ditambahkan");
        await loadClasses();
        await loadStudents();
      },
    });
  }

  // ——— Impor ———
  async function impor() {
    await openModal({
      title: "Impor Siswa dari Excel",
      icon: "bi-file-earmark-excel",
      okText: "Impor",
      body: `
        <div class="callout"><i class="bi bi-info-circle"></i><div><b>Format kolom:</b> NIS · Nama Siswa · L/P · Rombel
          <p>Gunakan tombol <b>Template</b> untuk mengunduh contoh. NIS yang sudah ada akan diperbarui.</p></div></div>
        <label class="field mt"><span>File Excel (.xlsx)</span><input class="input" type="file" name="file" accept=".xlsx" style="padding:8px"></label>
        <label class="check"><input type="checkbox" name="create_accounts" checked> Buatkan akun orang tua (username & password = NIS)</label>`,
      onOk: async (m, f) => {
        const file = f.file.files[0];
        if (!file) throw new Error("Pilih file Excel terlebih dahulu.");
        const fd = new FormData();
        fd.append("file", file);
        fd.append("create_accounts", f.create_accounts.checked ? "1" : "0");
        const r = await api("/students/import", { method: "POST", form: fd });
        await loadClasses();
        await loadStudents();
        alertOk(
          "Impor selesai",
          "",
          `<b>${r.added}</b> siswa baru, <b>${r.updated}</b> diperbarui, <b>${r.accounts}</b> akun orang tua dibuat.${
            r.errors.length ? `<ul>${r.errors.slice(0, 10).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""
          }`
        );
      },
    });
  }

  // ——— Event ———
  el.querySelector("#add-kelas").onclick = () => formKelas();
  el.querySelector("#add-siswa").onclick = () => formSiswa();
  el.querySelector("#imp").onclick = impor;
  el.querySelector("#tpl").onclick = (e) => withBtn(e.currentTarget, () => download("/students/template", "template-impor-siswa.xlsx").catch(alertError));
  el.querySelector("#sel-kelas").onchange = (e) => {
    selected = e.target.value === "none" ? "none" : Number(e.target.value);
    loadStudents();
  };

  tbK.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.students) {
      selected = Number(b.dataset.students);
      el.querySelector("#sel-kelas").value = selected;
      await loadStudents();
      el.querySelector("#card-siswa").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (b.dataset.edit) formKelas(classes.find((c) => c.id == b.dataset.edit));
    else if (b.dataset.del) {
      const c = classes.find((x) => x.id == b.dataset.del);
      if (
        await confirm({
          title: `Hapus kelas ${c.rombel}?`,
          html: `Jadwal pelajaran, penugasan guru, dan seluruh CALAKAN kelas <b>${esc(c.name)}</b> ikut terhapus.`,
          ok: "Ya, hapus",
          danger: true,
        })
      ) {
        try {
          await del(`/classes/${c.id}`);
          toast("Kelas dihapus");
          if (selected === c.id) selected = null;
          await loadClasses();
          await loadStudents();
        } catch (err) {
          alertError(err);
        }
      }
    }
  });

  tbS.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.sedit) formSiswa(students.find((s) => s.id == b.dataset.sedit));
    else if (b.dataset.sdel) {
      const s = students.find((x) => x.id == b.dataset.sdel);
      if (await confirm({ title: "Hapus siswa?", html: `<b>${esc(s.name)}</b> (${esc(s.nis)}) beserta akun orang tuanya akan dihapus.`, ok: "Ya, hapus", danger: true })) {
        try {
          await del(`/students/${s.id}`);
          toast("Siswa dihapus");
          await loadClasses();
          await loadStudents();
        } catch (err) {
          alertError(err);
        }
      }
    } else if (b.dataset.acc) {
      const s = students.find((x) => x.id == b.dataset.acc);
      await withBtn(b, async () => {
        try {
          const r = await post("/users/generate-parents", { student_id: s.id });
          if (!r.created) throw new Error(`Username ${s.nis} sudah dipakai akun lain.`);
          toast("Akun orang tua dibuat (username & password = NIS)");
          await loadStudents();
        } catch (err) {
          alertError(err);
        }
      });
    }
  });

  await loadClasses();
  await loadStudents();
}
