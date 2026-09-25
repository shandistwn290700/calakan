// Jam aplikasi. Di pengujian, waktu bisa dimajukan (CALAKAN_TEST_CLOCK=1) untuk mencoba jadwal Kamis/Jumat/Sabtu.
// Tidak pernah aktif di production (NODE_ENV=production di Dockerfile).
let offset = 0;

export const testClockEnabled = () => Bun.env.CALAKAN_TEST_CLOCK === "1" && Bun.env.NODE_ENV !== "production";

export function now() {
  return new Date(Date.now() + offset);
}

export function setTestNow(iso: string | null) {
  if (!testClockEnabled()) throw new Error("Jam uji tidak aktif.");
  offset = iso ? new Date(iso).getTime() - Date.now() : 0;
}
