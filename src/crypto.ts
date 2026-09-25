// Enkripsi file backup: kunci diturunkan dari kata sandi (PBKDF2-SHA256), data dienkripsi AES-256-GCM
const ITERATIONS = 310_000;
const MIN_ITER = 100_000;
const MAX_ITER = 2_000_000; // batas atas agar file backup palsu tidak bisa membebani server

const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");
const unb64 = (s: string) => new Uint8Array(Buffer.from(String(s || ""), "base64"));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export type Sealed = { kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string }; cipher: { name: "AES-256-GCM"; iv: string }; data: string };

export async function sealJson(value: unknown, passphrase: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return {
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: "AES-256-GCM", iv: b64(iv) },
    data: b64(new Uint8Array(ct)),
  };
}

/** Mengembalikan null bila kata sandi salah atau file telah diubah */
export async function openJson(sealed: any, passphrase: string): Promise<any | null> {
  const it = Number(sealed?.kdf?.iterations);
  if (sealed?.kdf?.name !== "PBKDF2" || sealed?.cipher?.name !== "AES-256-GCM" || !Number.isInteger(it) || it < MIN_ITER || it > MAX_ITER) return null;
  const salt = unb64(sealed.kdf.salt);
  const iv = unb64(sealed.cipher.iv);
  if (salt.length !== 16 || iv.length !== 12) return null;
  try {
    const key = await deriveKey(passphrase, salt, it);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, unb64(sealed.data));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
