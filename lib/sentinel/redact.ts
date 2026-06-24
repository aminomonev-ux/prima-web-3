// lib/sentinel/redact.ts — R4/G27: redaksi PII sebelum teks user DI-PERSIST
// (fail-log localStorage) atau — fase data-aware (v3) — dikirim ke endpoint/LLM.
// Deterministik, lokal, nol-network. Bukan deteksi sempurna; tujuannya mencegah
// rahasia salah-ketik (password/NIK/telepon/email) ngendap di penyimpanan.
//
// Urutan pola penting: NIK 16-digit didahulukan agar tidak ketangkap pola
// nomor 10–15 digit. Angka anggaran besar umumnya sudah ditangani kalkulator
// sebelum mencapai fail-log, jadi false-positive di sini berdampak rendah.

const PATTERNS: [RegExp, string][] = [
  [/\b\d{16}\b/g, '▮NIK▮'],                               // NIK 16 digit
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, '▮EMAIL▮'],           // email
  [/\b\d{10,15}\b/g, '▮NO▮'],                             // telepon/rekening panjang
  [/\b(password|pass|sandi|pin|kata\s?sandi)\b\s*[:=]?\s*\S+/gi, '$1 ▮'], // kredensial + nilainya
]

/** Ganti PII yang terdeteksi dengan penanda ▮ — idempoten, aman dipanggil ganda. */
export function redactPii(text: string): string {
  return PATTERNS.reduce((s, [re, rep]) => s.replace(re, rep), text)
}
