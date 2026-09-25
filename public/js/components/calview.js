import { esc, nl2br, ymd, waktu } from "../ui.js";

const cell = (v) => (v ? nl2br(v) : `<span class="empty-cell">–</span>`);

/** Tabel CALAKAN (desktop) + kartu per hari (ponsel) */
export function weekView(data, { showTeacher = true } = {}) {
  const today = ymd(new Date());
  const rowsHtml = data.days
    .map((d) => {
      const rows = d.rows.length ? d.rows : [{ subject: "", materi: "", kegiatan: "", tugas: "", keterangan: "", _empty: true }];
      return rows
        .map(
          (r, i) => `<tr class="${i === rows.length - 1 ? "day-end" : ""}">
          ${i === 0 ? `<td class="day" rowspan="${rows.length}">${d.name}<small>${esc(d.date_label.replace(/ \d{4}$/, ""))}</small></td>` : ""}
          <td class="subj">${r._empty ? `<span class="empty-cell">Tidak ada jadwal</span>` : esc(r.subject)}${
            showTeacher && r.teacher ? `<small>${esc(r.teacher)}</small>` : ""
          }${r.jam ? `<small><i class="bi bi-clock"></i> ${esc(r.jam)}</small>` : ""}</td>
          <td>${cell(r.materi)}</td><td>${cell(r.kegiatan)}</td><td>${cell(r.tugas)}</td><td>${cell(r.keterangan)}</td></tr>`
        )
        .join("");
    })
    .join("");

  const cards = data.days
    .map((d) => {
      const isToday = d.date === today;
      const lessons = d.rows.length
        ? d.rows
            .map(
              (r) => `<div class="lesson">
              <h4><span class="dot"></span>${esc(r.subject)}${r.jam ? ` <span class="badge">${esc(r.jam)}</span>` : ""}</h4>
              ${showTeacher && r.teacher ? `<div class="muted small" style="margin-left:16px">${esc(r.teacher)}</div>` : ""}
              ${
                r.materi || r.kegiatan || r.keterangan
                  ? `<dl>${r.materi ? `<dt>Materi</dt><dd>${nl2br(r.materi)}</dd>` : ""}${r.kegiatan ? `<dt>Kegiatan</dt><dd>${nl2br(r.kegiatan)}</dd>` : ""}${
                      r.keterangan ? `<dt>Ket.</dt><dd>${nl2br(r.keterangan)}</dd>` : ""
                    }</dl>`
                  : `<div class="muted small" style="margin:4px 0 0 16px">Belum ada rencana.</div>`
              }
              ${r.tugas ? `<div class="tugas"><i class="bi bi-house-check"></i> <b>Tugas:</b> ${nl2br(r.tugas)}</div>` : ""}
            </div>`
            )
            .join("")
        : `<div class="lesson muted small">Tidak ada jadwal.</div>`;
      return `<section class="day-card ${isToday ? "today" : ""}">
        <header><b>${d.name}</b><span>${esc(d.date_label)}${isToday ? " · Hari ini" : ""}</span><i class="bi bi-chevron-down chev"></i></header>
        <div class="lessons">${lessons}</div></section>`;
    })
    .join("");

  return `
    <div class="cal-table-wrap table-wrap">
      <table class="cal">
        <thead><tr><th>Hari</th><th>Mata Pelajaran</th><th>Materi Pembelajaran</th><th>Rencana Kegiatan</th><th>Tugas</th><th>Keterangan</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="day-cards">${cards}</div>`;
}

export function bindWeekView(root) {
  root.querySelectorAll(".day-card > header").forEach((h) => (h.onclick = () => h.parentElement.classList.toggle("collapsed")));
}

export function statusBadge(w) {
  if (w.status === "published")
    return w.has_changes
      ? `<span class="badge warn"><i class="bi bi-exclamation-circle"></i> Ada perubahan belum diterbitkan</span>`
      : `<span class="badge ok"><i class="bi bi-check-circle"></i> Terbit ${w.published_at ? "· " + esc(waktu(w.published_at)) : ""}</span>`;
  return `<span class="badge"><i class="bi bi-pencil"></i> Draf</span>`;
}

export function progressBar(filled, total) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="bar ${pct === 100 ? "ok" : ""}" style="flex:1;min-width:70px"><span style="width:${pct}%"></span></div>
    <span class="small muted nowrap">${filled}/${total}</span></div>`;
}
