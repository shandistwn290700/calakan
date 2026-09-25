import { post } from "../api.js";
import { pushState, enablePush, disablePush } from "../push.js";
import { toast, alertError, withBtn } from "../ui.js";

/** Kartu ajakan mengaktifkan push notification. full=true menampilkan status walau sudah aktif */
export function pushCard(slot, { full = false } = {}) {
  const render = () => {
    const st = pushState();
    let html = "";
    if (st === "ios-install") {
      html = `<div class="callout"><i class="bi bi-phone"></i><div><b>Aktifkan notifikasi di iPhone/iPad</b>
        <p>Buka aplikasi ini di <b>Safari</b>, ketuk tombol <b>Bagikan</b> <i class="bi bi-box-arrow-up"></i>, pilih <b>“Tambah ke Layar Utama”</b>,
        lalu buka dari ikon di layar utama dan aktifkan notifikasi. (Butuh iOS 16.4 atau lebih baru.)</p></div></div>`;
    } else if (st === "unsupported") {
      html = full
        ? `<div class="callout warn"><i class="bi bi-exclamation-triangle"></i><div><b>Push notification tidak tersedia</b>
        <p>${
          window.isSecureContext
            ? "Browser ini belum mendukung push notification. Gunakan Chrome, Edge, Firefox, atau Safari versi terbaru."
            : "Push notification hanya berjalan melalui alamat <b>https://</b> atau <b>localhost</b>. Minta admin memasang HTTPS."
        } Notifikasi tetap tersimpan di menu Notifikasi.</p></div></div>`
        : "";
    } else if (st === "denied") {
      html = `<div class="callout warn"><i class="bi bi-bell-slash"></i><div><b>Notifikasi diblokir</b>
        <p>Izinkan notifikasi untuk situs ini melalui pengaturan browser (ikon gembok di bilah alamat), lalu muat ulang halaman.</p></div></div>`;
    } else if (st === "default") {
      html = `<div class="callout"><i class="bi bi-bell"></i><div style="flex:1"><b>Dapatkan kabar CALAKAN terbaru</b>
        <p>Aktifkan notifikasi agar Anda langsung tahu saat rencana pembelajaran pekan ini terbit, meski aplikasi sedang tidak dibuka.</p>
        <button class="btn sm mt" data-enable style="margin-top:10px"><i class="bi bi-bell"></i> Aktifkan Notifikasi</button></div></div>`;
    } else if (st === "granted" && full) {
      html = `<div class="callout"><i class="bi bi-bell-fill"></i><div style="flex:1"><b>Notifikasi aktif di perangkat ini</b>
        <p>Anda akan menerima pemberitahuan meski aplikasi tertutup.</p>
        <div class="row" style="margin-top:10px"><button class="btn sm" data-test><i class="bi bi-send"></i> Kirim tes</button>
        <button class="btn sm ghost" data-off><i class="bi bi-bell-slash"></i> Matikan</button></div></div></div>`;
    }
    slot.innerHTML = html;
    slot.querySelector("[data-enable]")?.addEventListener("click", (e) =>
      withBtn(e.currentTarget, async () => {
        try {
          await enablePush();
          toast("Notifikasi berhasil diaktifkan");
          render();
        } catch (err) {
          alertError(err, "Notifikasi belum aktif");
          render();
        }
      })
    );
    slot.querySelector("[data-test]")?.addEventListener("click", (e) =>
      withBtn(e.currentTarget, async () => {
        try {
          await enablePush();
          const r = await post("/push/test", {});
          toast(r.sent ? "Notifikasi tes dikirim" : "Tes tersimpan, namun push gagal terkirim", r.sent ? "success" : "warning");
        } catch (err) {
          alertError(err);
        }
      })
    );
    slot.querySelector("[data-off]")?.addEventListener("click", (e) =>
      withBtn(e.currentTarget, async () => {
        await disablePush().catch(() => {});
        toast("Notifikasi dimatikan untuk perangkat ini", "info");
        slot.innerHTML = `<div class="callout"><i class="bi bi-bell-slash"></i><div><b>Notifikasi dimatikan</b><p>Muat ulang halaman untuk mengaktifkannya kembali.</p></div></div>`;
      })
    );
  };
  render();
}
