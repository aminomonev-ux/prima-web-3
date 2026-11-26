// lib/shared/impor-tabel.ts — mengenali baris "hiasan" dokumen tabel saat mengimpor Excel.
// Konsep: docs/konsep/sistem/CONCEPT-format-unduhan-seragam.md §4.
//
// Unduhan PRIMA bergaya resmi (lib/shared/tabel-dokumen.ts) membawa kop di atas kepala tabel,
// baris nomor kolom (1)(2)…, baris JUMLAH, catatan, dan tanda tangan. Pembaca impor WAJIB
// melewatinya — dan tetap menerima berkas POLOS (kepala di baris 1) maupun templat kantor
// lain. Aturan di sini sengaja ketat supaya tidak ada baris data yang ikut terbuang.
//
// MURNI & aman-klien.

export type JenisHiasan = 'judul' | 'nomor' | 'jumlah' | 'penutup'

const teks = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'object' && !(v instanceof Date)) {
    const o = v as Record<string, unknown>
    if ('result' in o) return teks(o.result)
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map(t => t.text ?? '').join('')
    if ('text' in o) return teks(o.text)
    return ''
  }
  return String(v).replace(/\s+/g, ' ').trim()
}

const NOMOR = /^\(?\s*(\d{1,2})\s*\)?$/
const ANGKA = /^[-+(]?\s*(rp\.?\s*)?[\d.,]+\s*%?\)?$/i
// Sengaja sempit: "Jumlah pasien dilayani" (indikator) BUKAN baris jumlah.
const JUMLAH = /^(jumlah|total|grand total|sub ?total|subjumlah)(\s+(belanja|anggaran|pendapatan|keseluruhan|seluruhnya|semua))?\s*:?$/i
const PENUTUP = [
  /^semarang\s*,/i,
  /^nip\.?(\s|$)/i,
  /^(mengetahui|yang membuat|menyetujui|dibuat oleh)\s*[,:]?$/i,
  /^catatan\s*:/i,
  /^\*\s+\S/,
]

/**
 * Jenis baris hiasan, atau `null` untuk baris data/kepala/kosong.
 * - `nomor`  : SEMUA sel berisi nomor berurutan 1,2,3… (≥ 3) — "(1) (2) (3)" atau "1 2 3";
 *              dua sel cukup bila berkurung "(1) (2)".
 * - `judul`  : ≥ 2 sel berisi teks yang SAMA persis (sel gabung kop/catatan/tanda tangan:
 *              exceljs memulangkan nilai sel induk di tiap sel anak gabungan).
 * - `jumlah` : sel teks pertama "JUMLAH"/"TOTAL"…, sisanya hanya angka.
 * - `penutup`: catatan atau tanda tangan ("Semarang, …", "NIP. …", "Mengetahui,").
 */
export function jenisBarisHiasan(sel: readonly unknown[]): JenisHiasan | null {
  const isi = sel.map(teks).filter(t => t !== '')
  if (isi.length === 0) return null

  const nomor = isi.map(t => NOMOR.exec(t))
  // Dua kolom saja (mis. Kode | Uraian) cukup bila bentuknya berkurung "(1) (2)" — bentuk
  // polos "1 2" di tabel dua kolom terlalu mirip baris data.
  const berurut = nomor.every((m, i) => m && Number(m[1]) === i + 1)
  if (berurut && (isi.length >= 3 || (isi.length === 2 && isi.every(t => /^\(.*\)$/.test(t))))) return 'nomor'

  if (isi.length >= 2 && isi.every(t => t === isi[0]) && /\p{L}/u.test(isi[0])) {
    return PENUTUP.some(p => p.test(isi[0])) ? 'penutup' : 'judul'
  }

  const teksSaja = isi.filter(t => !ANGKA.test(t))
  if (teksSaja.length === 1 && JUMLAH.test(teksSaja[0])) return 'jumlah'

  if (teksSaja.length <= 2 && teksSaja.length > 0 && PENUTUP.some(p => p.test(teksSaja[0])) && isi.length === teksSaja.length) {
    return 'penutup'
  }
  return null
}

export const adalahBarisHiasan = (sel: readonly unknown[]): boolean => jenisBarisHiasan(sel) !== null

/** Kop/judul gabung — dilewati saat mencari baris kepala tabel. */
export const adalahBarisJudul = (sel: readonly unknown[]): boolean => jenisBarisHiasan(sel) === 'judul'

/**
 * Indeks baris kepala tabel (0-based) di `batas` baris teratas: baris pertama yang
 * `cocok`, melewati baris kop. `-1` kalau tidak ada.
 */
export function cariBarisKepala(grid: readonly (readonly unknown[])[], cocok: (baris: string[]) => boolean, batas = 25): number {
  for (let r = 0; r < Math.min(batas, grid.length); r++) {
    const b = grid[r] ?? []
    if (adalahBarisJudul(b)) continue
    if (cocok(b.map(teks))) return r
  }
  return -1
}

/**
 * Baris data sebuah lembar: sesudah baris kepala (bila ada di 25 baris teratas), tanpa
 * baris hiasan. Tanpa kepala = seluruh lembar (berkas polos tanpa judul kolom).
 * `cocok` harus KETAT — baris data yang kebetulan cocok akan membuang baris di atasnya.
 */
export function barisDataImpor<T extends readonly unknown[]>(grid: readonly T[], cocok: (baris: string[]) => boolean): T[] {
  const k = cariBarisKepala(grid, cocok)
  return grid.slice(k + 1).filter(b => !adalahBarisHiasan(b))
}

/** Kepala dua kolom Kode | Uraian (Master Akun, Kode Besar BLUD). */
export const kepalaKodeUraian = (b: string[]): boolean =>
  b.some(t => /^kode( rekening| akun| besar)?$/i.test(t)) && b.some(t => /^(uraian|nama)( akun| rekening)?$/i.test(t))

