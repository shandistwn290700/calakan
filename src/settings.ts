import { q, exec } from "./db";

let cache: Record<string, string> | null = null;

export async function getSettings(): Promise<Record<string, string>> {
  if (cache) return cache;
  const rows = await q<{ k: string; v: string }>(`SELECT k, v FROM settings`);
  cache = Object.fromEntries(rows.map((r) => [r.k, r.v ?? ""]));
  return cache;
}

export async function setSetting(k: string, v: string) {
  await exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)`, [k, v]);
  cache = null;
}

export function clearSettingsCache() {
  cache = null;
}

/** Pengaturan yang aman ditampilkan ke publik (halaman login, manifest) */
export async function publicSettings() {
  const s = await getSettings();
  return {
    app_name: s.app_name || "CALAKAN",
    app_subtitle: s.app_subtitle || "",
    school_name: s.school_name || "",
    primary_color: s.primary_color || "#0f766e",
    school_days: Number(s.school_days || 5),
    kepala_sekolah: s.kepala_sekolah || "",
    kota: s.kota || "",
    footer_text: s.footer_text || "",
    has_logo: !!s.logo,
    has_favicon: !!s.favicon,
    version: s.asset_version || "1",
  };
}
