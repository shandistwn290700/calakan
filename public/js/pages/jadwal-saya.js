import { get } from "../api.js";
import { esc, HARI, emptyState } from "../ui.js";

export default async function jadwalSaya({ el, me }) {
  const days = Number(me.settings.school_days || 5);
  const mine = await get("/schedules/mine");
  let homeroom = null;
  if (me.role === "wali" && me.homeroom) homeroom = await get(`/schedules?class_id=${me.homeroom.id}`);
  const todayIdx = new Date().getDay();

  const col = (h, list, fmt) => `
    <div class="sched-col" style="${h === todayIdx ? "border-color:var(--p);box-shadow:0 0 0 3px var(--p-100)" : ""}">
      <header>${HARI[h]}${h === todayIdx ? ` <span class="badge p" style="margin-left:8px">Hari ini</span>` : ""}<span>${list.length}</span></header>
      <div class="sched-list">${list.length ? list.map(fmt).join("") : `<div class="muted small" style="padding:8px">Tidak ada jadwal</div>`}</div></div>`;

  el.innerHTML = `
    <div class="card mb"><div class="card-h"><h3><i class="bi bi-person-video3" style="color:var(--p)"></i> Jadwal Mengajar Saya</h3>
      <span class="badge p">${mine.length} jam pelajaran / pekan</span></div></div>
    ${
      mine.length
        ? `<div class="sched-grid" style="--days:${days}">${Array.from({ length: days }, (_, i) => i + 1)
            .map((h) =>
              col(h, mine.filter((r) => r.hari === h), (r) => `<div class="sched-item"><div class="top"><span class="no">${r.urutan}</span><b style="flex:1">${esc(r.subject)}</b></div>
                <div class="bottom"><span class="tt"><i class="bi bi-building"></i> ${esc(r.rombel)} · ${esc(r.class_name)}${r.jam_mulai ? ` · ${esc(r.jam_mulai)}${r.jam_selesai ? "–" + esc(r.jam_selesai) : ""}` : ""}</span></div></div>`)
            )
            .join("")}</div>`
        : `<div class="card">${emptyState("bi-calendar-x", "Belum ada jadwal mengajar", "Jadwal muncul setelah admin menetapkan mapel Anda dan menyusun jadwal pelajaran.")}</div>`
    }
    ${
      homeroom
        ? `<div class="card mt mb"><div class="card-h"><h3><i class="bi bi-house-door" style="color:var(--p)"></i> Jadwal Kelas Perwalian · ${esc(me.homeroom.tingkat)} ${esc(me.homeroom.name)}</h3></div></div>
      <div class="sched-grid" style="--days:${days}">${Array.from({ length: days }, (_, i) => i + 1)
        .map((h) =>
          col(h, homeroom.filter((r) => r.hari === h), (r) => `<div class="sched-item"><div class="top"><span class="no">${r.urutan}</span><b style="flex:1">${esc(r.subject)}</b></div>
            <div class="bottom"><span class="tt ${r.teacher ? "" : "none"}"><i class="bi bi-person"></i> ${esc(r.teacher || "Belum ada pengampu")}</span></div></div>`)
        )
        .join("")}</div>`
        : ""
    }`;
}
