// lib/shared/target-renaksi.ts — target Renaksi → teks yang dibaca orang
//
// Dipakai DUA modul yang sama-sama menarik indikator dari tabel `rencana_aksi`:
// IKI (`/api/iki/import-renaksi`) dan Perjanjian Kinerja
// (`/api/perjanjian-kinerja/sasaran/import-renaksi`). Sebelumnya masing-masing
// memegang salinannya sendiri, dan kedua salinan itu SUDAH berbeda pendapat:
// pemanggil di IKI membungkus nilainya `Number(...)`, pemanggil di PK tidak.
//
// Selama `target_tahunan` masih INT itu tidak terlihat. `migration-043-ra-decimal.sql`
// mengubahnya jadi DECIMAL(14,2), dan mysql2 memulangkan DECIMAL sebagai STRING demi
// menjaga presisi — sejak itu Master Sasaran PK menampilkan "765.00 Orang" sementara
// IKI tetap benar. Persis bentuk L78: dua salinan satu aturan pasti menyimpang, dan
// yang menyimpang selalu yang tidak sedang dilihat orang.
//
// Karena itu pengubahan tipenya jadi tugas FUNGSI INI, bukan tugas pemanggilnya.
// Tipe di kedua route terlanjur ditulis `target_tahunan: number` padahal saat jalan ia
// string, jadi kompilator TIDAK akan pernah mengingatkan pemanggil berikutnya yang
// lupa — pemaksaan yang bergantung pada ingatan sudah terbukti gagal sekali di sini.

import { tulisDesimal } from './desimal'

/**
 * "Persen" → "37%" · satuan lain → "765 Orang".
 *
 * Angkanya lewat `tulisDesimal`, helper yang sama dengan yang dipakai modul Renaksi
 * untuk menampilkan angkanya sendiri — jadi 86,72 tetap terbaca "86,72%" (format
 * id-ID) dan 1000 jadi "1.000", bukan "86.72" dan "1000" ala JavaScript.
 *
 * Nilai yang tidak terbaca sebagai angka memulangkan string kosong, bukan "NaN Orang"
 * atau "null Orang": kolom target di Master Sasaran memang boleh kosong.
 */
export function fmtTarget(n: number | string | null | undefined, satuan: string): string {
  const angka = tulisDesimal(typeof n === 'string' ? Number(n) : n)
  if (angka === '') return ''
  const sat = (satuan ?? '').trim()
  if (/^persen$/i.test(sat) || sat === '%') return `${angka}%`
  return `${angka} ${sat}`.trim()
}
