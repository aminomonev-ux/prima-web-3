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
//
// PK mencetak target dan satuan di DUA kolom (format PK 2026), IKI di satu kolom.
// Keduanya berdiri di atas pasangan yang sama: `angkaTarget` + `satuanTarget`.

import { tulisDesimal } from './desimal'

/** Lebar kolom `pk_sasaran.satuan_*` & `pk_dokumen_lampiran.satuan`. */
export const PANJANG_SATUAN = 50

/** Angka saja, format id-ID ("86,72", "1.000"). Yang tidak terbaca sebagai angka → "". */
export function angkaTarget(n: number | string | null | undefined): string {
  return tulisDesimal(typeof n === 'string' ? Number(n) : n)
}

/** "Persen" ditulis "%"; satuan lain apa adanya. */
export function satuanTarget(satuan: string | null | undefined): string {
  const sat = (satuan ?? '').trim()
  return /^persen$/i.test(sat) ? '%' : sat
}

/** Target + satuan dalam SATU teks: "37%", "765 Orang". Kebalikan `pisahTargetSatuan`. */
export function gabungTargetSatuan(target: string | null | undefined, satuan: string | null | undefined): string {
  const t = (target ?? '').trim()
  const sat = satuanTarget(satuan)
  if (!t) return ''
  return sat === '%' ? `${t}%` : `${t} ${sat}`.trim()
}

/**
 * "Persen" → "37%" · satuan lain → "765 Orang".
 *
 * Nilai yang tidak terbaca sebagai angka memulangkan string kosong, bukan "NaN Orang"
 * atau "null Orang": kolom target di Master Sasaran memang boleh kosong.
 */
export function fmtTarget(n: number | string | null | undefined, satuan: string): string {
  return gabungTargetSatuan(angkaTarget(n), satuan)
}

/**
 * Teks lama "765 Orang" → { target: "765", satuan: "Orang" }. Dipisah SESUDAH angka di depan,
 * bukan di spasi terakhir ("3 Laporan Bulanan" satuannya dua kata). `null` = tidak bisa
 * dipisah dengan yakin: tanpa angka di depan ("Baik"), rentang ("1-2 Kali"), tanpa satuan
 * ("100"), atau satuannya melebihi kolom. Aturan yang sama ditulis dalam SQL di
 * `docs/migrations/migration-pk-satuan.sql` — mengubah satu wajib mengubah keduanya.
 */
export function pisahTargetSatuan(teks: string | null | undefined): { target: string; satuan: string } | null {
  const m = /^\s*([0-9]+(?:[.,][0-9]+)*)\s*([\p{L}%].*)$/u.exec(teks ?? '')
  if (!m) return null
  const satuan = satuanTarget(m[2])
  if (satuan.length > PANJANG_SATUAN) return null
  return { target: m[1], satuan }
}
