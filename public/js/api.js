// Pembungkus fetch: loader otomatis + penanganan galat
let active = 0;
const bar = () => document.getElementById("progress");

export function loading(on) {
  const el = bar();
  if (!el) return;
  if (on) {
    active++;
    el.classList.remove("done");
    // paksa reflow agar animasi mulai ulang
    void el.offsetWidth;
    el.classList.add("on");
  } else {
    active = Math.max(0, active - 1);
    if (!active) {
      el.classList.add("done");
      setTimeout(() => active || el.classList.remove("on", "done"), 600);
    }
  }
}

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = "GET", body, form, quiet = false, raw = false } = {}) {
  const opts = { method, headers: {}, credentials: "same-origin" };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  if (!quiet) loading(true);
  try {
    let res;
    try {
      res = await fetch("/api" + path, opts);
    } catch {
      throw new ApiError(0, "Tidak dapat terhubung ke server. Periksa koneksi Anda.");
    }
    if (raw && res.ok) return res;
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = (data && data.error) || `Terjadi kesalahan (${res.status}).`;
      if (res.status === 401 && onUnauthorized && !path.startsWith("/auth/login")) onUnauthorized();
      // Server meminta password diganti terlebih dahulu → muat ulang agar layar ganti password tampil
      if (res.status === 403 && data?.code === "must_change_password") location.reload();
      throw new ApiError(res.status, msg, data);
    }
    return data;
  } finally {
    if (!quiet) loading(false);
  }
}

export const get = (p, o) => api(p, o);
export const post = (p, body, o = {}) => api(p, { ...o, method: "POST", body });
export const put = (p, body, o = {}) => api(p, { ...o, method: "PUT", body });
export const del = (p, o = {}) => api(p, { ...o, method: "DELETE" });

/** Unduh file dari API (Excel/JSON). opts: { method, body } untuk unduhan lewat POST */
export async function download(path, fallbackName, opts = {}) {
  const res = await api(path, { ...opts, raw: true });
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const m = /filename="?([^"]+)"?/.exec(cd);
  saveBlob(blob, m ? m[1] : fallbackName);
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
