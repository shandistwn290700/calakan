import { get, post, download } from "../api.js";
import { esc, waliText, toast, alertError, alertOk, confirm, withBtn, emptyState, weekPicker, mondayOf, swalLoading, waktu } from "../ui.js";
import { weekView, bindWeekView, statusBadge, progressBar } from "../components/calview.js";
import { exportPdf } from "../print.js";
import { pushCard } from "../components/pushcard.js";

export default async function calakan(ctx) {
  const { me, query } = ctx;
  if (me.role === "admin" && !query.class_id) return overview(ctx);
  return detail(ctx);
}

// ——————————— Rekap semua kelas (admin) ———————————
async function overview({ el, me, query }) {
  const days = Number(me.settings.school_days || 5);
  let week = mondayOf(query.week);
  el.innerHTML = `
    <div class="card">
      <div class="card-h">
        <div id="week"></div><div class="spacer"></div>
        <button class="btn ghost sm" id="xls-all"><i class="bi bi-file-earmark-excel" style="color:#16a34a"></i> Excel semua kelas</button>
        <button class="btn sm" id="pdf-all"><i class="bi bi-file-earmark-pdf"></i> PDF semua kelas</button>
      </div>
      <div class="card-b p0" id="list"></div>
    </div>`;
  const list = el.querySelector("#list");

  async function load() {
    list.innerHTML = `<div class="card-b"><div class="skel"></div><div class="skel mt" style="width:80%"></div></div>`;
    const ov = await get(`/calakan/overview?week=${week}`);
    history.replaceState(null, "", `#/calakan?week=${week}`);
    const pub = ov.classes.filter((c) => c.status === "published").length;
    list.innerHTML = ov.classes.length
      ? `<div style="padding:12px 20px" class="small muted"><b style="color:var(--text)">${pub}</b> dari <b style="color:var(--text)">${ov.classes.length}</b> kelas sudah terbit pekan ini.</div>
      <div class="table-wrap"><table class="t responsive"><thead><tr><th>Kelas</th><th>Wali Kelas</th><th>Keterisian</th><th>Status</th><th></th></tr></thead><tbody>
      ${ov.classes
        .map(
          (c) => `<tr>
          <td class="main-cell"><div class="cell-title"><span class="badge p">${esc(c.class.rombel)}</span> ${esc(c.class.name)}</div></td>
          <td data-label="Wali">${esc(waliText(c.class, "—"))}</td>
          <td data-label="Keterisian" style="min-width:170px">${progressBar(c.progress.filled, c.progress.total)}</td>
          <td data-label="Status">${statusBadge(c)}</td>
          <td class="actions">
            <a class="btn sm soft" href="#/calakan?class_id=${c.class.id}&week=${week}"><i class="bi bi-eye"></i> Lihat</a>
            <button class="btn icon sm ghost" data-pdf="${c.class.id}" title="PDF"><i class="bi bi-file-earmark-pdf" style="color:#dc2626"></i></button>
            <button class="btn icon sm ghost" data-xls="${c.class.id}" title="Excel"><i class="bi bi-file-earmark-excel" style="color:#16a34a"></i></button>
          </td></tr>`
        )
        .join("")}</tbody></table></div>`
      : emptyState("bi-building-add", "Belum ada kelas");
  }

  async function pdf(classParam, btn) {
    await withBtn(btn, async () => {
      const close = swalLoading("Menyiapkan PDF…");
      try {
        const weeks = await get(`/calakan/bulk?week=${week}&class_id=${classParam}`);
        await exportPdf(weeks, me.settings, weeks.length === 1 ? `CALAKAN-${weeks[0].class.rombel}-${week}.pdf` : `CALAKAN-Semua-Kelas-${week}.pdf`);
        close();
        toast("PDF berhasil dibuat");
      } catch (e) {
        close();
        alertError(e);
      }
    });
  }
  async function xls(classParam, btn) {
    await withBtn(btn, () => download(`/calakan/export.xlsx?week=${week}&class_id=${classParam}`, `CALAKAN-${week}.xlsx`).then(() => toast("Excel berhasil diunduh")).catch(alertError));
  }

  el.querySelector("#pdf-all").onclick = (e) => pdf("all", e.currentTarget);
  el.querySelector("#xls-all").onclick = (e) => xls("all", e.currentTarget);
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b?.dataset.pdf) pdf(b.dataset.pdf, b);
    if (b?.dataset.xls) xls(b.dataset.xls, b);
  });
  weekPicker(el.querySelector("#week"), week, (w) => {
    week = w;
    load();
  }, days);
  await load();
}

// ——————————— Detail satu kelas (admin/wali/ortu) ———————————
async function detail({ el, me, query, setTitle }) {
  const days = Number(me.settings.school_days || 5);
  let week = mondayOf(query.week);
  let classId = Number(query.class_id) || null;
  if (me.role === "ortu") classId = me.student?.class_id;
  if (me.role === "wali" && !classId) classId = me.homeroom?.id;
  if (!classId) {
    el.innerHTML = `<div class="card">${emptyState(
      "bi-building-x",
      me.role === "wali" ? "Anda belum ditetapkan sebagai wali kelas" : "Kelas belum ditentukan",
      "Hubungi admin sekolah."
    )}</div>`;
    return;
  }
  const canExport = me.role === "admin" || me.role === "wali";

  el.innerHTML = `
    ${me.role === "admin" ? `<a href="#/calakan?week=${week}" class="btn ghost sm mb" id="back"><i class="bi bi-arrow-left"></i> Semua kelas</a>` : ""}
    ${me.role === "ortu" ? `<div id="push-slot" class="mb"></div>` : ""}
    <div class="card">
      <div class="card-h">
        <div id="week"></div>
        ${me.role === "ortu" ? `<select class="select sm" id="hist" style="width:auto;max-width:240px"><option value="">Riwayat pekan terbit…</option></select>` : ""}
        <div class="spacer"></div>
        <div class="btn-group" id="actions"></div>
      </div>
      <div class="card-b" id="view"></div>
    </div>`;
  const view = el.querySelector("#view");
  let data = null;

  async function load() {
    view.innerHTML = `<div class="skel" style="width:40%"></div><div class="skel mt"></div><div class="skel mt" style="width:75%"></div>`;
    data = await get(`/calakan/week?class_id=${classId}&week=${week}`);
    history.replaceState(null, "", `#/calakan?${me.role === "admin" ? `class_id=${classId}&` : ""}week=${week}`);
    if (me.role === "admin") el.querySelector("#back").href = `#/calakan?week=${week}`;
    setTitle(me.role === "ortu" ? "CALAKAN Ananda" : `CALAKAN ${data.class.rombel}`);
    renderActions();
    const w = data.week;
    const head = `
      <div class="cal-head mb">
        <div class="cal-title" style="flex:1;min-width:220px"><small>${esc(data.class.kelompok || "Fase " + data.class.fase)} · ${esc(me.settings.school_name)}</small>
          <h2>Kelas ${esc(data.class.label)}</h2>
          <p>Pekan ${esc(w.label)} · Wali kelas: ${esc(waliText(data.class))}</p></div>
        <div style="text-align:right">${statusBadge(w)}
          ${w.published_by_name && w.status === "published" ? `<div class="small muted" style="margin-top:4px">oleh ${esc(w.published_by_name)}</div>` : ""}
          ${me.role !== "ortu" ? `<div style="margin-top:8px;min-width:200px">${progressBar(data.progress.filled, data.progress.total)}</div>` : ""}</div>
      </div>`;
    if (me.role === "ortu" && !data.published) {
      view.innerHTML =
        head +
        emptyState("bi-hourglass-split", "CALAKAN pekan ini belum terbit", "Wali kelas sedang menyiapkan rencana pembelajaran. Anda akan menerima notifikasi setelah terbit.");
      return;
    }
    view.innerHTML = head + weekView(data, { showTeacher: me.role !== "ortu" });
    bindWeekView(view);
  }

  function renderActions() {
    const a = el.querySelector("#actions");
    const w = data.week;
    let html = "";
    if (canExport) {
      html += `<button class="btn ghost sm" data-a="xls"><i class="bi bi-file-earmark-excel" style="color:#16a34a"></i> Excel</button>
               <button class="btn ghost sm" data-a="pdf"><i class="bi bi-file-earmark-pdf" style="color:#dc2626"></i> PDF</button>`;
    }
    if (data.can_publish) {
      html += `<a class="btn ghost sm" href="#/isi?class_id=${classId}&week=${week}"><i class="bi bi-pencil-square"></i> Isi</a>`;
      if (w.status === "published") {
        if (w.has_changes) html += `<button class="btn sm warn" data-a="publish"><i class="bi bi-send"></i> Kirim Pembaruan</button>`;
        html += `<button class="btn ghost sm" data-a="unpublish" title="Tarik kembali menjadi draf"><i class="bi bi-arrow-counterclockwise"></i> Tarik</button>`;
      } else html += `<button class="btn sm" data-a="publish"><i class="bi bi-send"></i> Terbitkan</button>`;
    }
    a.innerHTML = html;
  }

  el.querySelector("#actions").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-a]");
    if (!b) return;
    const act = b.dataset.a;
    if (act === "pdf")
      return withBtn(b, async () => {
        try {
          await exportPdf([data], me.settings, `CALAKAN-${data.class.rombel}-${week}.pdf`);
          toast("PDF berhasil dibuat");
        } catch (err) {
          alertError(err);
        }
      });
    if (act === "xls")
      return withBtn(b, () => download(`/calakan/export.xlsx?week=${week}&class_id=${classId}`, "calakan.xlsx").then(() => toast("Excel berhasil diunduh")).catch(alertError));
    if (act === "publish") return publish();
    if (act === "unpublish") {
      if (!(await confirm({ title: "Tarik CALAKAN menjadi draf?", text: "Orang tua tidak dapat melihat CALAKAN pekan ini sampai diterbitkan kembali.", ok: "Ya, tarik" }))) return;
      try {
        await post("/calakan/unpublish", { class_id: classId, week });
        toast("CALAKAN dikembalikan menjadi draf", "info");
        load();
      } catch (err) {
        alertError(err);
      }
    }
  });

  async function publish() {
    const p = data.progress;
    const empty = p.total - p.filled;
    const again = data.week.status === "published";
    const r = await window.Swal.fire({
      icon: empty ? "warning" : "question",
      title: again ? "Kirim pembaruan ke orang tua?" : "Terbitkan CALAKAN?",
      html: `Kelas <b>${esc(data.class.label)}</b>, pekan <b>${esc(data.week.label)}</b>.<br>
        ${empty ? `<div style="margin-top:8px;color:#b45309"><b>${empty} dari ${p.total}</b> baris masih kosong.</div>` : `<div style="margin-top:8px;color:#15803d">Semua baris sudah terisi.</div>`}
        <div style="margin-top:10px">Seluruh orang tua di kelas ini akan menerima notifikasi.</div>`,
      input: "text",
      inputPlaceholder: "Pesan tambahan untuk orang tua (opsional)",
      showCancelButton: true,
      confirmButtonText: again ? "Kirim pembaruan" : "Terbitkan",
      cancelButtonText: "Batal",
      reverseButtons: true,
      showLoaderOnConfirm: true,
      preConfirm: async (msg) => {
        try {
          return await post("/calakan/publish", { class_id: classId, week, message: msg }, { quiet: true });
        } catch (err) {
          window.Swal.showValidationMessage(err.message);
        }
      },
      allowOutsideClick: () => !window.Swal.isLoading(),
    });
    if (r.isConfirmed && r.value) {
      await alertOk(again ? "Pembaruan terkirim" : "CALAKAN diterbitkan", "", `Notifikasi dikirim ke <b>${r.value.notified}</b> orang tua${r.value.pushed ? ` (<b>${r.value.pushed}</b> perangkat menerima push)` : ""}.`);
      load();
    }
  }

  weekPicker(el.querySelector("#week"), week, (w) => {
    week = w;
    load();
  }, days);

  if (me.role === "ortu") {
    pushCard(el.querySelector("#push-slot"));
    get("/calakan/history", { quiet: true })
      .then((h) => {
        const sel = el.querySelector("#hist");
        sel.insertAdjacentHTML("beforeend", h.map((x) => `<option value="${x.week_start}">${esc(x.label)}</option>`).join(""));
        if (!h.length) sel.hidden = true;
        sel.onchange = () => {
          if (!sel.value) return;
          week = sel.value;
          weekPicker(el.querySelector("#week"), week, (w) => {
            week = w;
            load();
          }, days);
          load();
          sel.value = "";
        };
      })
      .catch(() => {});
  }
  await load();
}
