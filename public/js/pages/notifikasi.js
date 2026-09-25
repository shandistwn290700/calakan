import { get, post } from "../api.js";
import { esc, emptyState, waktu, toast } from "../ui.js";
import { setUnread } from "../app.js";
import { pushCard } from "../components/pushcard.js";

export default async function notifikasi({ el }) {
  el.innerHTML = `<div id="push-slot" class="mb"></div>
    <div class="card"><div class="card-h"><h3><i class="bi bi-bell" style="color:var(--p)"></i> Notifikasi</h3>
      <button class="btn sm ghost" id="all"><i class="bi bi-check2-all"></i> Tandai semua dibaca</button></div>
      <div id="list"></div></div>`;
  pushCard(el.querySelector("#push-slot"), { full: true });

  async function load() {
    const rows = await get("/notifications");
    setUnread(rows.filter((r) => !r.is_read).length);
    el.querySelector("#list").innerHTML = rows.length
      ? rows
          .map(
            (n) => `<div class="notif ${n.is_read ? "" : "unread"}" data-id="${n.id}" data-url="${esc(n.url || "")}">
          <div class="ic"><i class="bi ${n.is_read ? "bi-bell" : "bi-bell-fill"}"></i></div>
          <div style="flex:1;min-width:0"><b>${esc(n.title)}</b><p>${esc(n.body || "")}</p><time>${esc(waktu(n.created_at))}</time></div>
          ${n.is_read ? "" : `<span class="badge p">Baru</span>`}</div>`
          )
          .join("")
      : emptyState("bi-bell-slash", "Belum ada notifikasi", "Pemberitahuan CALAKAN yang terbit akan muncul di sini.");
  }

  el.querySelector("#list").addEventListener("click", async (e) => {
    const n = e.target.closest(".notif");
    if (!n) return;
    await post("/notifications/read", { id: Number(n.dataset.id) }, { quiet: true }).catch(() => {});
    const url = n.dataset.url;
    if (url) location.href = url;
    else load();
  });
  el.querySelector("#all").onclick = async () => {
    await post("/notifications/read", {});
    toast("Semua notifikasi ditandai dibaca");
    load();
  };
  await load();
}
