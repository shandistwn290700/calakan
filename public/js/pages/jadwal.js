import { get, put, post } from "../api.js";
import { esc, HARI, toast, alertError, confirm, withBtn, emptyState, openModal } from "../ui.js";
import { state } from "../app.js";

export default async function jadwal({ el, me, query, setLeaveGuard }) {
  const [classes, subjects] = await Promise.all([get("/classes"), get("/subjects")]);
  const days = Number(me.settings.school_days || 5);
  let classId = Number(query.class_id) || classes[0]?.id;
  let rows = [];
  let dirty = false;
  let asgMap = new Map(); // subject_id -> teacher

  if (!classes.length) {
    el.innerHTML = `<div class="card">${emptyState("bi-building-add", "Belum ada kelas", `Tambahkan kelas di menu <a href="#/kelas">Data Kelas</a> terlebih dahulu.`)}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="card mb">
      <div class="card-h">
        <h3><i class="bi bi-calendar3" style="color:var(--p)"></i> Jadwal Pelajaran Mingguan</h3>
        <button class="btn ghost sm" id="copy"><i class="bi bi-copy"></i> Salin dari kelas lain</button>
      </div>
      <div class="card-b" style="padding-top:14px;padding-bottom:14px"><div class="tabs" id="tabs"></div></div>
    </div>
    <div class="callout mb"><i class="bi bi-lightbulb"></i><div><b>Jadwal = baris isian CALAKAN.</b>
      <p>Setiap mata pelajaran di jadwal akan muncul sebagai baris yang diisi guru pengampunya. Jam bersifat opsional.</p></div></div>
    <div class="sched-grid" id="grid" style="--days:${days}"></div>
    <div class="savebar">
      <span class="muted small" id="status"><i class="bi bi-check2-circle"></i> Tersimpan</span><div class="spacer"></div>
      <button class="btn ghost" id="reset"><i class="bi bi-arrow-counterclockwise"></i> Batalkan</button>
      <button class="btn" id="save"><i class="bi bi-save"></i> Simpan Jadwal</button>
    </div>`;

  const grid = el.querySelector("#grid");
  const setDirty = (v) => {
    dirty = v;
    state.dirty = v;
    el.querySelector("#status").innerHTML = v
      ? `<span style="color:var(--warn)"><i class="bi bi-exclamation-circle"></i> Ada perubahan belum disimpan</span>`
      : `<i class="bi bi-check2-circle"></i> Tersimpan`;
  };
  setLeaveGuard(async () => !dirty || (await confirm({ title: "Perubahan belum disimpan", text: "Tinggalkan halaman tanpa menyimpan?", ok: "Tinggalkan", danger: true })));

  function tabs() {
    el.querySelector("#tabs").innerHTML = classes
      .map((c) => `<button class="tab ${c.id === classId ? "active" : ""}" data-c="${c.id}">${esc(c.rombel)} <span class="small" style="font-weight:500">${esc(c.name)}</span></button>`)
      .join("");
  }

  const subjOptions = (sel) =>
    `<option value="">— Pilih mapel —</option>` + subjects.map((s) => `<option value="${s.id}" ${sel == s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");

  function render() {
    let html = "";
    for (let h = 1; h <= days; h++) {
      const list = rows.filter((r) => r.hari === h);
      html += `<div class="sched-col"><header>${HARI[h]}<span>${list.length} mapel</span></header>
        <div class="sched-list" data-day="${h}">
          ${list
            .map((r, i) => {
              const t = asgMap.get(Number(r.subject_id));
              return `<div class="sched-item" data-k="${r._k}">
                <div class="top"><span class="no">${i + 1}</span><select class="select sm" data-f="subject_id">${subjOptions(r.subject_id)}</select></div>
                <div class="bottom">
                  <input class="input sm" type="time" data-f="jam_mulai" value="${r.jam_mulai || ""}" title="Jam mulai">
                  <input class="input sm" type="time" data-f="jam_selesai" value="${r.jam_selesai || ""}" title="Jam selesai">
                </div>
                <div class="bottom">
                  <span class="tt ${t ? "" : "none"}">${t ? `<i class="bi bi-person"></i> ${esc(t)}` : r.subject_id ? `<i class="bi bi-exclamation-circle"></i> Belum ada pengampu` : ""}</span>
                  <button class="btn icon sm ghost" data-a="up" title="Naik"><i class="bi bi-arrow-up"></i></button>
                  <button class="btn icon sm ghost" data-a="down" title="Turun"><i class="bi bi-arrow-down"></i></button>
                  <button class="btn icon sm ghost" data-a="rm" title="Hapus"><i class="bi bi-trash3" style="color:var(--danger)"></i></button>
                </div></div>`;
            })
            .join("")}
        </div>
        <button class="btn sm soft sched-add" data-add="${h}"><i class="bi bi-plus-lg"></i> Tambah mapel</button></div>`;
    }
    grid.innerHTML = html;
  }

  let seq = 0;
  async function load() {
    const [data, subjDetail] = await Promise.all([get(`/schedules?class_id=${classId}`), get("/subjects")]);
    asgMap = new Map();
    for (const s of subjDetail) {
      const t = s.teachers.find((t) => t.classes.includes(classes.find((c) => c.id === classId)?.rombel));
      if (t) asgMap.set(s.id, t.name);
    }
    rows = data.map((r) => ({ ...r, _k: ++seq }));
    tabs();
    render();
    setDirty(false);
  }

  const find = (k) => rows.find((r) => r._k == k);
  grid.addEventListener("change", (e) => {
    const item = e.target.closest(".sched-item");
    if (!item) return;
    const r = find(item.dataset.k);
    r[e.target.dataset.f] = e.target.value;
    setDirty(true);
    if (e.target.dataset.f === "subject_id") render();
  });
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.add) {
      const h = Number(b.dataset.add);
      rows.push({ _k: ++seq, hari: h, subject_id: "", jam_mulai: "", jam_selesai: "" });
      setDirty(true);
      render();
      grid.querySelector(`[data-day="${h}"] .sched-item:last-child select`)?.focus();
      return;
    }
    const item = b.closest(".sched-item");
    if (!item) return;
    const r = find(item.dataset.k);
    const same = rows.filter((x) => x.hari === r.hari);
    const idx = same.indexOf(r);
    if (b.dataset.a === "rm") rows = rows.filter((x) => x !== r);
    if (b.dataset.a === "up" && idx > 0) swap(r, same[idx - 1]);
    if (b.dataset.a === "down" && idx < same.length - 1) swap(r, same[idx + 1]);
    setDirty(true);
    render();
  });
  function swap(a, b) {
    const i = rows.indexOf(a), j = rows.indexOf(b);
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  el.querySelector("#tabs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-c]");
    if (!b) return;
    if (dirty && !(await confirm({ title: "Perubahan belum disimpan", text: "Pindah kelas tanpa menyimpan?", ok: "Pindah", danger: true }))) return;
    classId = Number(b.dataset.c);
    history.replaceState(null, "", `#/jadwal?class_id=${classId}`);
    await load();
  });

  el.querySelector("#save").onclick = (e) =>
    withBtn(e.currentTarget, async () => {
      if (rows.some((r) => !r.subject_id)) return alertError(new Error("Masih ada baris jadwal yang belum dipilih mapelnya."));
      const payload = [];
      for (let h = 1; h <= 6; h++) rows.filter((r) => r.hari === h).forEach((r, i) => payload.push({ ...r, urutan: i + 1 }));
      try {
        await put(`/schedules/${classId}`, { rows: payload });
        toast("Jadwal disimpan");
        await load();
      } catch (err) {
        alertError(err);
      }
    });
  el.querySelector("#reset").onclick = async () => {
    if (!dirty || (await confirm({ title: "Batalkan perubahan?", ok: "Ya, batalkan", danger: true }))) load();
  };
  el.querySelector("#copy").onclick = async () => {
    const others = classes.filter((c) => c.id !== classId);
    const cur = classes.find((c) => c.id === classId);
    const r = await openModal({
      title: "Salin Jadwal",
      icon: "bi-copy",
      okText: "Salin",
      body: `<label class="field"><span>Salin jadwal dari kelas</span><select class="select" name="from">${others
        .map((c) => `<option value="${c.id}">${esc(c.rombel)} · ${esc(c.name)}</option>`)
        .join("")}</select></label>
        <div class="callout warn"><i class="bi bi-exclamation-triangle"></i><div><p>Jadwal kelas <b>${esc(cur.rombel)}</b> saat ini akan <b>diganti seluruhnya</b>.</p></div></div>`,
      onOk: async (m, f) => {
        await post("/schedules/copy", { from_class_id: Number(f.from.value), to_class_id: classId });
        return true;
      },
    });
    if (r) {
      toast("Jadwal berhasil disalin");
      load();
    }
  };

  await load();
}
