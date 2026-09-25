import { get, post, put, del } from "../api.js";
import { esc, openModal, formData, confirm, toast, alertError, dataList, emptyState, initials } from "../ui.js";

export default async function mapel({ el }) {
  let subjects = [];
  el.innerHTML = `
    <div class="card">
      <div class="card-h">
        <h3><i class="bi bi-journal-bookmark" style="color:var(--p)"></i> Mata Pelajaran & Pengampu</h3>
        <div class="search"><i class="bi bi-search"></i><input class="input" id="q" placeholder="Cari mapel atau nama guru…"></div>
        <select class="select sm" id="sort" style="width:auto">
          <option value="urutan:1">Urutan bawaan</option><option value="name:1">Nama A–Z</option><option value="name:-1">Nama Z–A</option>
          <option value="tcount:-1">Guru terbanyak</option><option value="tcount:1">Guru tersedikit</option>
        </select>
        <button class="btn" id="add"><i class="bi bi-plus-lg"></i> Tambah Mapel</button>
      </div>
      <div class="card-b"><p class="muted small" style="margin:0 0 14px"><i class="bi bi-info-circle"></i> Guru yang mengampu mata pelajaran yang sama dikelompokkan dalam satu kartu. Penugasan guru diatur di menu <a href="#/guru">Data Guru</a>.</p>
        <div class="grid c3" id="list"></div></div>
    </div>`;
  const listEl = el.querySelector("#list");

  const list = dataList({
    data: [],
    search: el.querySelector("#q"),
    sortSelect: el.querySelector("#sort"),
    keys: ["name", "kode", (r) => r.teachers.map((t) => t.name).join(" ")],
    sort: { key: "urutan" },
    getters: { tcount: (r) => r.teachers.length },
    render(rows) {
      listEl.innerHTML = rows.length
        ? rows
            .map(
              (s) => `<div class="card subj-card">
          <header><div class="ic">${esc((s.kode || s.name).slice(0, 4))}</div><b>${esc(s.name)}</b>
            <button class="btn icon sm ghost" data-edit="${s.id}" title="Ubah"><i class="bi bi-pencil"></i></button>
            <button class="btn icon sm ghost" data-del="${s.id}" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button></header>
          <div class="row small muted" style="margin-top:8px;gap:12px"><span><i class="bi bi-person"></i> ${s.teachers.length} guru</span><span><i class="bi bi-calendar3"></i> ${s.schedule_count} jam/pekan (semua kelas)</span></div>
          ${
            s.teachers.length
              ? `<ul>${s.teachers
                  .map(
                    (t) => `<li><span class="avatar">${esc(initials(t.name))}</span><span>${esc(t.name)}${t.role === "wali" ? ` <span class="badge role-wali" style="font-size:10.5px">Wali</span>` : ""}</span>
                <span class="cls">${t.classes.map((c) => `<span class="badge">${esc(c)}</span>`).join("")}</span></li>`
                  )
                  .join("")}</ul>`
              : `<div class="muted small" style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><i class="bi bi-exclamation-circle" style="color:var(--warn)"></i> Belum ada pengampu</div>`
          }
        </div>`
            )
            .join("")
        : `<div style="grid-column:1/-1">${emptyState("bi-journal-x", "Mata pelajaran tidak ditemukan")}</div>`;
    },
  });

  async function load() {
    subjects = await get("/subjects");
    list.refresh(subjects);
  }

  async function form(s = {}) {
    await openModal({
      title: s.id ? "Ubah Mata Pelajaran" : "Tambah Mata Pelajaran",
      icon: "bi-journal-bookmark",
      body: `
        <label class="field"><span>Nama Mata Pelajaran <em>*</em></span><input class="input" name="name" value="${esc(s.name || "")}" placeholder="contoh: Tahfiz"></label>
        <div class="grid c2">
          <label class="field"><span>Kode Singkat</span><input class="input" name="kode" value="${esc(s.kode || "")}" maxlength="20" placeholder="THF"></label>
          <label class="field"><span>Urutan Tampil</span><input class="input" name="urutan" type="number" min="0" value="${s.urutan ?? ""}" placeholder="otomatis"></label>
        </div>`,
      onOk: async (m, f) => {
        const d = formData(f);
        if (s.id) await put(`/subjects/${s.id}`, d);
        else await post("/subjects", d);
        toast(s.id ? "Mapel diperbarui" : "Mapel ditambahkan");
        await load();
      },
    });
  }

  el.querySelector("#add").onclick = () => form();
  listEl.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const s = subjects.find((x) => x.id == (b.dataset.edit || b.dataset.del));
    if (b.dataset.edit) form(s);
    if (b.dataset.del && (await confirm({ title: `Hapus “${s.name}”?`, text: "Penugasan guru untuk mapel ini ikut terhapus.", ok: "Ya, hapus", danger: true }))) {
      try {
        await del(`/subjects/${s.id}`);
        toast("Mapel dihapus");
        await load();
      } catch (err) {
        alertError(err);
      }
    }
  });
  await load();
}
