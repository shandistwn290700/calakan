import { get, put, post } from "../api.js";
import { esc, waliText, showActiveTab, nl2br, toast, alertError, confirm, withBtn, emptyState, weekPicker, mondayOf, addDays, openModal, rentang, waktu } from "../ui.js";
import { statusBadge, progressBar } from "../components/calview.js";
import { state } from "../app.js";

export default async function isi({ el, me, query, setLeaveGuard }) {
  const days = Number(me.settings.school_days || 5);
  let classes = await get("/calakan/classes");
  if (me.role !== "admin") classes = classes.filter((c) => c.teaches || c.is_homeroom);
  if (!classes.length) {
    el.innerHTML = `<div class="card">${emptyState("bi-journal-x", "Belum ada kelas untuk diisi", "Admin belum menetapkan mata pelajaran & kelas yang Anda ampu.")}</div>`;
    return;
  }
  let classId = Number(query.class_id) || (classes.find((c) => c.is_homeroom) || classes[0]).id;
  let week = mondayOf(query.week);
  let onlyMine = me.role !== "admin";
  let data = null;
  const dirty = new Map(); // key -> row values

  el.innerHTML = `
    <div class="card mb">
      <div class="card-b" style="padding:14px 16px">
        <div class="tabs" id="tabs"></div>
        <div class="row" style="margin-top:12px">
          <div id="week"></div>
          <div class="spacer"></div>
          ${me.role !== "admin" ? `<label class="check small"><input type="checkbox" id="only" ${onlyMine ? "checked" : ""}> Hanya mapel saya</label>` : ""}
          <button class="btn ghost sm" id="copy"><i class="bi bi-copy"></i> Salin isian</button>
        </div>
      </div>
    </div>
    <div id="summary"></div>
    <div id="body"></div>
    <div class="savebar">
      <span class="small" id="dirty-info"></span><div class="spacer"></div>
      <button class="btn" id="save" disabled><i class="bi bi-save"></i> Simpan Rencana</button>
    </div>`;

  const body = el.querySelector("#body");
  const updateDirty = () => {
    const n = dirty.size;
    state.dirty = n > 0;
    el.querySelector("#save").disabled = !n;
    el.querySelector("#dirty-info").innerHTML = n
      ? `<span style="color:var(--warn);font-weight:600"><i class="bi bi-exclamation-circle"></i> ${n} baris belum disimpan</span>`
      : `<span class="muted"><i class="bi bi-check2-circle"></i> Semua perubahan tersimpan</span>`;
  };
  setLeaveGuard(async () => !dirty.size || (await confirm({ title: "Rencana belum disimpan", text: "Tinggalkan halaman tanpa menyimpan?", ok: "Tinggalkan", danger: true })));

  const guardSwitch = async () =>
    !dirty.size || (await confirm({ title: "Rencana belum disimpan", text: "Perubahan akan hilang. Lanjutkan?", ok: "Lanjutkan", danger: true }));

  function renderTabs() {
    el.querySelector("#tabs").innerHTML = classes
      .map(
        (c) => `<button class="tab ${c.id === classId ? "active" : ""}" data-c="${c.id}">${c.is_homeroom ? `<i class="bi bi-house-door"></i> ` : ""}${esc(c.rombel)}
        <span class="small" style="font-weight:500">${esc(c.name)}</span></button>`
      )
      .join("");
    showActiveTab(el.querySelector("#tabs"));
  }

  const field = (r, f, label, ph) =>
    `<label><span>${label}</span><textarea class="input" rows="2" data-f="${f}" placeholder="${ph}">${esc(r[f])}</textarea></label>`;

  function render() {
    const w = data.week;
    const p = data.progress;
    el.querySelector("#summary").innerHTML = `
      <div class="card mb"><div class="card-b" style="padding:14px 18px">
        <div class="row">
          <div style="min-width:0;flex:1"><div class="cal-title"><small>${esc(data.class.kelompok || "Fase " + data.class.fase)}</small>
            <h2 style="font-size:17px">Kelas ${esc(data.class.label)}</h2><p class="small">Pekan ${esc(w.label)} · Wali: ${esc(waliText(data.class))}</p></div></div>
          <div style="min-width:220px"><div class="small muted" style="margin-bottom:4px">${me.role === "admin" ? "Keterisian kelas" : "Isian saya"}</div>
            ${me.role === "admin" ? progressBar(p.filled, p.total) : progressBar(p.mine_filled, p.mine)}</div>
          <div>${statusBadge(w)}</div>
          ${data.can_publish ? `<a class="btn sm soft" href="#/calakan?class_id=${data.class.id}&week=${week}"><i class="bi bi-send"></i> Periksa & Terbitkan</a>` : ""}
        </div>
        ${
          w.status === "published"
            ? `<div class="callout mt" style="padding:10px 14px"><i class="bi bi-info-circle"></i><div><p style="margin:0">CALAKAN pekan ini <b>sudah terbit</b>. Perubahan yang Anda simpan langsung terlihat oleh orang tua; wali kelas dapat mengirim notifikasi pembaruan.</p></div></div>`
            : ""
        }
      </div></div>`;

    let html = "";
    let shown = 0;
    for (const d of data.days) {
      const rows = d.rows.filter((r) => !onlyMine || r.can_edit);
      if (!rows.length) continue;
      shown += rows.length;
      html += `<section class="fill-day"><h3><i class="bi bi-calendar-event"></i> ${d.name} <small>${esc(d.date_label)}</small></h3>
        ${rows
          .map((r) => {
            const v = dirty.get(r.key) || r;
            if (!r.can_edit)
              return `<div class="fill-row readonly"><div class="fr-head"><b>${esc(r.subject)}</b><span class="badge">${esc(r.teacher || "Belum ada pengampu")}</span>
                ${r.materi || r.kegiatan ? `<span class="badge ok"><i class="bi bi-check2"></i> Terisi</span>` : `<span class="badge warn">Belum diisi</span>`}</div>
                <div class="ro-grid"><div><span>Materi</span>${r.materi ? nl2br(r.materi) : "–"}</div><div><span>Kegiatan</span>${r.kegiatan ? nl2br(r.kegiatan) : "–"}</div>
                <div><span>Tugas</span>${r.tugas ? nl2br(r.tugas) : "–"}</div><div><span>Keterangan</span>${r.keterangan ? nl2br(r.keterangan) : "–"}</div></div></div>`;
            return `<div class="fill-row editable ${dirty.has(r.key) ? "dirty" : ""}" data-key="${r.key}">
              <div class="fr-head"><b>${esc(r.subject)}</b>${r.jam ? `<span class="badge"><i class="bi bi-clock"></i> ${esc(r.jam)}</span>` : ""}
                ${r.materi || r.kegiatan ? `<span class="badge ok"><i class="bi bi-check2"></i> Terisi</span>` : `<span class="badge warn">Belum diisi</span>`}
                ${r.updated_at ? `<span class="small muted" style="margin-left:auto">Diubah ${esc(waktu(r.updated_at))}${r.updated_by_name ? " oleh " + esc(r.updated_by_name) : ""}</span>` : ""}</div>
              <div class="fr-grid">
                ${field(v, "materi", "Materi Pembelajaran", "Contoh: Pelajaran 3 Bersikap Santun")}
                ${field(v, "kegiatan", "Rencana Kegiatan", "Contoh: Menjelaskan sikap dan ucapan santun")}
                ${field(v, "tugas", "Tugas", "Contoh: Mengerjakan latihan di buku paket")}
                ${field(v, "keterangan", "Keterangan", "Opsional")}
              </div></div>`;
          })
          .join("")}</section>`;
    }
    body.innerHTML =
      html ||
      `<div class="card">${emptyState(
        "bi-calendar-x",
        "Tidak ada baris untuk diisi",
        onlyMine ? "Anda tidak memiliki jadwal mapel di kelas ini, atau jadwal belum disusun admin." : "Jadwal kelas ini belum disusun admin."
      )}</div>`;
    body.querySelectorAll("textarea").forEach(autoGrow);
    updateDirty();
  }

  function autoGrow(t) {
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight + 2, 320) + "px";
  }

  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.tagName !== "TEXTAREA") return;
    autoGrow(t);
    const box = t.closest(".fill-row");
    const key = box.dataset.key;
    const orig = data.days.flatMap((d) => d.rows).find((r) => r.key === key);
    const cur = {};
    box.querySelectorAll("textarea").forEach((x) => (cur[x.dataset.f] = x.value));
    const changed = ["materi", "kegiatan", "tugas", "keterangan"].some((f) => (cur[f] || "").trim() !== (orig[f] || ""));
    if (changed) dirty.set(key, { ...cur, schedule_id: orig.schedule_id, item_id: orig.item_id });
    else dirty.delete(key);
    box.classList.toggle("dirty", changed);
    updateDirty();
  });

  async function load() {
    body.innerHTML = `<div class="card skel-card"><div class="skel" style="width:30%"></div><div class="skel"></div><div class="skel" style="width:85%"></div></div>`;
    data = await get(`/calakan/week?class_id=${classId}&week=${week}`);
    dirty.clear();
    renderTabs();
    render();
    history.replaceState(null, "", `#/isi?class_id=${classId}&week=${week}`);
  }

  async function save(btn) {
    if (!dirty.size) return;
    await withBtn(btn, async () => {
      try {
        const rows = [...dirty.values()];
        const r = await put("/calakan/week", { class_id: classId, week, rows });
        toast(`${r.saved} rencana tersimpan`);
        await load();
      } catch (err) {
        alertError(err, "Gagal menyimpan");
      }
    });
  }

  el.querySelector("#save").onclick = (e) => save(e.currentTarget);
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && document.body.contains(el)) {
      e.preventDefault();
      save(el.querySelector("#save"));
    }
    if (!document.body.contains(el)) document.removeEventListener("keydown", onKey);
  };
  document.addEventListener("keydown", onKey);

  el.querySelector("#tabs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-c]");
    if (!b || Number(b.dataset.c) === classId) return;
    if (!(await guardSwitch())) return;
    classId = Number(b.dataset.c);
    load();
  });
  el.querySelector("#only")?.addEventListener("change", (e) => {
    onlyMine = e.target.checked;
    render();
  });
  const onWeek = async (w) => {
    if (!(await guardSwitch())) return weekPicker(el.querySelector("#week"), week, onWeek, days);
    week = w;
    load();
  };
  weekPicker(el.querySelector("#week"), week, onWeek, days);

  el.querySelector("#copy").onclick = async () => {
    if (dirty.size) return alertError(new Error("Simpan perubahan terlebih dahulu sebelum menyalin."));
    const cur = classes.find((c) => c.id === classId);
    const prev = addDays(week, -7);
    const res = await openModal({
      title: "Salin Isian Rencana",
      icon: "bi-copy",
      okText: "Salin",
      body: `
        <p class="muted" style="margin-top:0">Isian disalin hanya ke <b>baris kosong</b> pada mapel yang Anda ampu di kelas <b>${esc(cur.rombel)}</b>, pekan ${esc(rentang(week, days))}. Pencocokan berdasarkan hari & mapel.</p>
        <label class="field"><span>Sumber</span>
          <select class="select" name="mode">
            <option value="prev">Kelas ini, pekan lalu (${esc(rentang(prev, days))})</option>
            ${classes
              .filter((c) => c.id !== classId)
              .map((c) => `<option value="c${c.id}">Kelas ${esc(c.rombel)} · ${esc(c.name)} (pekan ini)</option>`)
              .join("")}
          </select></label>
        <small class="hint">Tips: kelas paralel (misal 1A & 1B) biasanya memiliki rencana serupa.</small>`,
      onOk: async (m, f) => {
        const mode = f.mode.value;
        const payload = mode === "prev" ? { class_id: classId, week, from_class_id: classId, from_week: prev } : { class_id: classId, week, from_class_id: Number(mode.slice(1)), from_week: week };
        return post("/calakan/copy", payload);
      },
    });
    if (res) {
      if (res.saved) toast(`${res.saved} baris berhasil disalin`);
      else toast("Tidak ada baris yang dapat disalin", "info");
      load();
    }
  };

  await load();
}
