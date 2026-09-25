import { get } from "../api.js";
import { esc, waliText, rentang, HARI, ymd, emptyState } from "../ui.js";
import { statusBadge, progressBar } from "../components/calview.js";
import { pushCard } from "../components/pushcard.js";

const PATTERN = `<svg class="pattern" viewBox="0 0 200 200"><g fill="none" stroke="#fff" stroke-width="3">
  <path d="M100 10 L120 80 L190 100 L120 120 L100 190 L80 120 L10 100 L80 80 Z"/><circle cx="100" cy="100" r="60"/>
  <rect x="58" y="58" width="84" height="84" transform="rotate(45 100 100)"/><rect x="58" y="58" width="84" height="84"/></g></svg>`;

function salam() {
  const h = new Date().getHours();
  if (h < 11) return "Semoga pagi ini penuh berkah";
  if (h < 15) return "Semoga siang ini penuh semangat";
  if (h < 18) return "Semoga sore ini menyenangkan";
  return "Semoga malam ini tenang";
}

const hero = (me, extra = "") => `
  <section class="hero">
    ${PATTERN}
    <div class="arabic">أَهْلًا وَسَهْلًا</div>
    <h2>Ahlan wa Sahlan, ${esc(me.name)}!</h2>
    <p>${salam()}. ${extra}</p>
  </section>`;

export default async function dashboard(ctx) {
  const { el, me } = ctx;
  if (me.role === "ortu") return ortu(ctx);
  if (me.role === "admin") return admin(ctx);
  return teacher(ctx);
}

async function admin({ el, me }) {
  const [d, ov] = await Promise.all([get("/dashboard"), get(`/calakan/overview`)]);
  const s = d.stats;
  const tiles = [
    ["bi-building", s.kelas, "Kelas / Rombel", "#/kelas"],
    ["bi-mortarboard", s.siswa, "Siswa", "#/kelas"],
    ["bi-person-badge", s.wali + s.guru, `Guru (${s.wali} wali kelas)`, "#/guru"],
    ["bi-people", s.ortu, "Akun Orang Tua", "#/akun"],
  ];
  el.innerHTML = `
    ${hero(me, `Selamat datang di panel admin ${esc(me.settings.app_name)} ${esc(me.settings.school_name)}.`)}
    <div class="grid c4 mt">
      ${tiles
        .map(
          ([ic, n, label, href]) =>
            `<a class="card stat" href="${href}" style="color:inherit"><div class="ic"><i class="bi ${ic}"></i></div><div><b>${n}</b><span>${label}</span></div></a>`
        )
        .join("")}
    </div>
    <div class="card mt">
      <div class="card-h"><h3><i class="bi bi-journal-richtext" style="color:var(--p)"></i> CALAKAN pekan ini · ${esc(ov.label)}</h3>
        <span class="badge p">${s.terbit}/${s.kelas} terbit</span>
        <a class="btn sm soft" href="#/calakan">Lihat semua <i class="bi bi-arrow-right"></i></a></div>
      <div class="card-b p0">
        ${
          ov.classes.length
            ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Kelas</th><th>Wali Kelas</th><th>Keterisian</th><th>Status</th></tr></thead><tbody>
          ${ov.classes
            .map(
              (c) => `<tr>
              <td class="main-cell"><div class="cell-title">${esc(c.class.rombel)} · ${esc(c.class.name)}</div></td>
              <td data-label="Wali">${esc(waliText(c.class, "—"))}</td>
              <td data-label="Keterisian" style="min-width:160px">${progressBar(c.progress.filled, c.progress.total)}</td>
              <td data-label="Status">${statusBadge(c)}</td></tr>`
            )
            .join("")}</tbody></table></div>`
            : emptyState("bi-building-add", "Belum ada kelas", `Tambahkan kelas di menu <a href="#/kelas">Data Kelas</a>.`)
        }
      </div>
    </div>
    <div class="grid c3 mt">
      ${[
        ["bi-1-circle", "Lengkapi data", "Tambahkan kelas, siswa, mata pelajaran, dan guru beserta mapel yang diampu.", "#/kelas"],
        ["bi-2-circle", "Susun jadwal", "Atur jadwal pelajaran tiap kelas. Jadwal menjadi baris isian CALAKAN.", "#/jadwal"],
        ["bi-3-circle", "Buat akun", "Buat akun orang tua (username & password awal = NIS) secara massal.", "#/akun"],
      ]
        .map(
          ([ic, t, p, h]) => `<a class="card card-b" href="${h}" style="color:inherit"><div class="row" style="margin-bottom:6px"><i class="bi ${ic}" style="font-size:22px;color:var(--p)"></i><b>${t}</b></div><span class="muted small">${p}</span></a>`
        )
        .join("")}
    </div>`;
}

async function teacher({ el, me }) {
  // Yang diisi selalu CALAKAN pekan depan (Kamis 10.00 – Jumat 13.00 WIB)
  const win = await get("/calakan/window", { quiet: true });
  const ov = await get(`/calakan/overview?week=${win.target_week}`);
  const mine = ov.classes.filter((c) => c.progress.mine > 0 || c.is_homeroom);
  const totalMine = mine.reduce((a, c) => a + c.progress.mine, 0);
  const filledMine = mine.reduce((a, c) => a + c.progress.mine_filled, 0);
  const home = ov.classes.find((c) => c.is_homeroom);
  el.innerHTML = `
    ${hero(me, `Untuk pekan depan (${esc(ov.label)}) Anda telah mengisi <b>${filledMine} dari ${totalMine}</b> rencana pembelajaran.`)}
    ${
      win.open
        ? `<div class="callout mt"><i class="bi bi-unlock"></i><div><b>Pengisian CALAKAN sedang dibuka</b><p>Isi rencana pekan ${esc(win.target_label)} paling lambat <b>${esc(win.close_label)}</b>.</p></div></div>`
        : `<div class="callout mt"><i class="bi bi-clock"></i><div><b>Pengisian CALAKAN berikutnya</b><p>Dibuka <b>${esc(win.open_label)}</b> sampai ${esc(win.close_label)} untuk pekan ${esc(win.target_label)}. Di luar waktu itu, perubahan hanya oleh Waka Kurikulum/Admin.</p></div></div>`
    }
    ${
      home
        ? `<div class="card mt"><div class="card-h"><h3><i class="bi bi-house-door" style="color:var(--p)"></i> Kelas Saya · ${esc(home.class.label)}</h3>${statusBadge(home)}</div>
      <div class="card-b"><div class="row"><div style="flex:1;min-width:200px"><div class="small muted" style="margin-bottom:6px">Keterisian seluruh mapel</div>${progressBar(
        home.progress.filled,
        home.progress.total
      )}</div>
      <a class="btn" href="#/calakan?week=${win.target_week}"><i class="bi bi-eye"></i> Periksa CALAKAN</a></div></div></div>`
        : ""
    }
    <div class="card mt">
      <div class="card-h"><h3><i class="bi bi-pencil-square" style="color:var(--p)"></i> Rencana yang perlu Anda isi</h3></div>
      <div class="card-b p0">
      ${
        mine.length
          ? `<div class="table-wrap"><table class="t responsive"><thead><tr><th>Kelas</th><th>Isian Saya</th><th>Status</th><th></th></tr></thead><tbody>
        ${mine
          .map(
            (c) => `<tr><td class="main-cell"><div class="cell-title">${esc(c.class.label)}</div><div class="cell-sub">Rombel ${esc(c.class.rombel)}${c.is_homeroom ? " · Kelas perwalian" : ""}</div></td>
            <td data-label="Isian saya" style="min-width:170px">${progressBar(c.progress.mine_filled, c.progress.mine)}</td>
            <td data-label="Status">${statusBadge(c)}</td>
            <td class="actions"><a class="btn sm" href="#/isi?class_id=${c.class.id}&week=${win.target_week}"><i class="bi bi-pencil"></i> Isi</a></td></tr>`
          )
          .join("")}</tbody></table></div>`
          : emptyState("bi-journal-x", "Belum ada mata pelajaran yang Anda ampu", "Hubungi admin untuk menetapkan mapel & kelas Anda.")
      }
      </div>
    </div>`;
}

async function ortu({ el, me }) {
  const st = me.student || {};
  let week = null;
  let last = null;
  try {
    week = await get(`/calakan/week?class_id=${st.class_id}`);
    // Pekan ini belum terbit → tawarkan CALAKAN terakhir yang sudah terbit
    if (!week.published) last = (await get("/calakan/history", { quiet: true }))[0] || null;
  } catch {}
  const today = ymd(new Date());
  const day = week?.days?.find((d) => d.date === today);
  el.innerHTML = `
    ${hero(me, `Ananda <b>${esc(st.name || me.name)}</b> · Kelas ${esc(st.tingkat ?? "")} ${esc(st.class_name || "-")}${
      st.wali_name || st.wali2_name ? ` · Wali kelas: ${esc(waliText(st))}` : ""
    }`)}
    <div id="push-slot" class="mt"></div>
    <div class="card mt">
      <div class="card-h"><h3><i class="bi bi-sun" style="color:var(--p)"></i> ${
        day ? `Hari ini · ${HARI[new Date().getDay()]}` : "Pekan ini"
      }</h3><a class="btn sm soft" href="#/calakan">CALAKAN lengkap <i class="bi bi-arrow-right"></i></a></div>
      <div class="card-b p0">${
        !week || !st.class_id
          ? emptyState("bi-building-x", "Kelas belum ditentukan", "Hubungi admin sekolah.")
          : !week.published
          ? emptyState("bi-hourglass-split", "CALAKAN pekan ini belum terbit", "Anda akan mendapat notifikasi ketika wali kelas menerbitkannya.") +
            (last
              ? `<div style="text-align:center;padding:0 16px 22px"><a class="btn soft" href="#/calakan?week=${esc(last.week_start)}"><i class="bi bi-journal-richtext"></i> Lihat CALAKAN terakhir · ${esc(last.label)}</a></div>`
              : "")
          : day
          ? day.rows.length
            ? day.rows
                .map(
                  (r) => `<div class="lesson"><h4><span class="dot"></span>${esc(r.subject)}</h4>
                  ${r.materi ? `<dl><dt>Materi</dt><dd>${esc(r.materi)}</dd>${r.kegiatan ? `<dt>Kegiatan</dt><dd>${esc(r.kegiatan)}</dd>` : ""}</dl>` : ""}
                  ${r.tugas ? `<div class="tugas"><i class="bi bi-house-check"></i> <b>Tugas:</b> ${esc(r.tugas)}</div>` : ""}</div>`
                )
                .join("")
            : emptyState("bi-emoji-smile", "Tidak ada jadwal hari ini")
          : `<div class="card-b">CALAKAN pekan <b>${esc(week.week.label)}</b> sudah terbit. <a href="#/calakan">Lihat sekarang →</a></div>`
      }</div>
    </div>`;
  pushCard(el.querySelector("#push-slot"));
}
