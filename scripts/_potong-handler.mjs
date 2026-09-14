// scripts/_potong-handler.mjs — satu blok per handler route Next (Fase F Tahap 14d).
// Dipakai gate G (`test-killswitch-modul.mjs`) dan `cek-urutan-penjaga.mjs`: dua penjaga
// yang memotong handler dengan cara berbeda akan berbeda pendapat soal handler mana yang ada.

export const RE_HANDLER = /export\s+async\s+function\s+(GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\s*\(/g;

// Bentuk ekspor lain membuat handler tak terlihat pemotong di atas, lalu lolos tanpa
// diperiksa. Pemakai wajib menggagalkannya, bukan melewatinya.
export const RE_EKSPOR_LAIN = /export\s+(?:const|let|var)\s+(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\bas\s+(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b|export\s+function\s+(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)\b/;

/** Dari `export async function X(` sampai export handler berikutnya. */
export function potongHandler(isi) {
  const titik = [...isi.matchAll(RE_HANDLER)].map((m) => ({ nama: m[1], mulai: m.index }));
  return titik.map((t, i) => ({
    nama: t.nama,
    badan: isi.slice(t.mulai, i + 1 < titik.length ? titik[i + 1].mulai : isi.length),
  }));
}
