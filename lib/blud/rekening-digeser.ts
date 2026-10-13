// lib/blud/rekening-digeser.ts — rincian panel "Rekening yang Digeser" di Beranda BLUD.
//
// Panel menampilkan 4 rekening teratas per versi lalu "+N rekening lainnya"; modalnya
// membuka SEMUA rekening versi itu, dipisah Bertambah / Berkurang, dan tiap rekening
// bisa dibuka di layar Pergeseran pada versi itu (`?versi=` + `?fokus=` yang sudah ada).
//
// MURNI, tanpa impor — dipakai server (`beranda-panel.ts`), layar Beranda, modalnya, dan
// layar Pergeseran. Konsep: docs/CONCEPT-blud-beranda-panel-bergerak.md §11

export interface RekeningGeser {
  /** Jangkar baris — dipakai `?fokus=` layar Pergeseran. Kosong = tidak bisa dituju. */
  anggaran_key: string | null
  kode_rekening: string
  uraian: string
  /** `bertambah_berkurang` daun apa adanya — bertanda, jadi tanda itu yang diwarnai. */
  nominal: number
}

export interface VersiPergeseran {
  versi_tanggal: string
  jumlah_baris: number
  /** "Pergeseran ke-1 · ditutup 28 Feb 2026" / "basis dari 31 Jan 2026". */
  catatan?: string
  /** Yang muat di panel (terbesar dulu). */
  rekening: RekeningGeser[]
  /** Sisa yang tidak muat di panel — 0 kalau semuanya masuk. */
  lainnya: number
  /** SEMUA rekening yang digeser di versi ini — isi modal rinciannya. */
  semua: RekeningGeser[]
}

export interface RincianDigeser {
  bertambah: RekeningGeser[]
  berkurang: RekeningGeser[]
  totalBertambah: number
  /** Positif — besarnya, bukan nilai bertanda. */
  totalBerkurang: number
}

/**
 * Dipisah menurut tanda; urutan masuk dipertahankan (server sudah mengurutkan terbesar
 * dulu). Totalnya selisih BERSIH per rekening daun — bukan kolom Bertambah/Berkurang
 * uraian di tabel Pergeseran, yang bisa memecah satu rekening jadi +45 / −12.
 */
export function pisahDigeser(rekening: readonly RekeningGeser[]): RincianDigeser {
  const bertambah = rekening.filter(r => r.nominal > 0)
  const berkurang = rekening.filter(r => r.nominal < 0)
  return {
    bertambah,
    berkurang,
    totalBertambah: bertambah.reduce((s, r) => s + r.nominal, 0),
    totalBerkurang: berkurang.reduce((s, r) => s - r.nominal, 0),
  }
}

/** Cari di kode atau uraian, tanpa peduli huruf besar. Kosong = semua. */
export function cocokCari(r: RekeningGeser, cari: string): boolean {
  const q = cari.trim().toLowerCase()
  return !q || r.kode_rekening.toLowerCase().includes(q) || r.uraian.toLowerCase().includes(q)
}

/**
 * Tautan ke layar Pergeseran pada versi itu; dengan `anggaran_key` barisnya ikut
 * disorot. `tahun` WAJIB ikut — layar Pergeseran membuka tahun berjalan kalau tidak.
 */
export function tautanPergeseran(a: { tahun: number; versi: string; anggaran_key?: string | null }): string {
  const qs = new URLSearchParams({ tahun: String(a.tahun), versi: a.versi })
  if (a.anggaran_key) qs.set('fokus', a.anggaran_key)
  return `/blud/pergeseran?${qs.toString()}`
}

/** `?tahun=` dari tautan — empat angka saja, selain itu diabaikan (bukan dilempar). */
export function tahunDariTautan(param: string | null): number | null {
  return param && /^\d{4}$/.test(param) ? Number(param) : null
}

/** `?versi=` dari tautan — hanya kalau versinya memang ada di tahun itu. */
export function versiDariTautan(param: string | null, history: readonly { versi_tanggal: string }[]): string | null {
  return param && history.some(h => h.versi_tanggal === param) ? param : null
}
