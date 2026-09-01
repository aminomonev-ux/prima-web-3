// lib/blud/urai-geser.ts — uraian pergeseran: bagian yang masuk vs yang keluar.
// Konsep: docs/CONCEPT-blud-uraian-geser.md §3, §4
//
// `bertambah_berkurang` cuma SATU angka bertanda, jadi rekening yang ditambah
// DAN dikurangi di dokumen yang sama kehilangan separuh ceritanya: ATK yang
// menerima 45jt lalu melepas 12jt terbaca "+33jt", seolah cuma kebagian.
//
// Aturan seluruh berkas ini satu kalimat:
//
//   kosong  = "belum diuraikan, hitung dari selisih"
//   terisi  = "sudah diuraikan tangan, jangan diutak-atik, cukup diperiksa"
//
// SATU tempat, dipakai layar, Excel, Cetak, dan panel Beranda. Empat salinan
// rumus yang sama adalah cara L78 lahir.
import type { PergeseranBarisInput } from '@/types'

/** Toleransi banding DECIMAL(18,2) — sepadan EPS_PRATINJAU di pratinjau-serapan. */
export const EPS_URAIAN = 0.005

export interface UraianGeser {
  bertambah: number
  berkurang: number
}

export const URAIAN_NOL: UraianGeser = { bertambah: 0, berkurang: 0 }

/** Baris yang cukup untuk diuraikan — sengaja struktural, bukan `PergeseranBarisInput`
 *  utuh, supaya bisa dipakai jalur cetak yang barisnya berasal dari SELECT. */
export interface BarisUrai {
  row_id: string
  parent_id: string | null
  jumlah?: number | null
  pergeseran?: number | null
  bertambah?: number | null
  berkurang?: number | null
}

const n = (v: number | null | undefined) => Number(v ?? 0)

/** Sudah diuraikan tangan? Cukup salah satu terisi — pasangannya dibaca 0. */
export function sudahDiurai(r: Pick<BarisUrai, 'bertambah' | 'berkurang'>): boolean {
  return r.bertambah != null || r.berkurang != null
}

/** Turunan dari selisih: naik masuk Bertambah, turun masuk Berkurang. */
export function uraianTurunan(selisih: number): UraianGeser {
  return selisih >= 0
    ? { bertambah: selisih, berkurang: 0 }
    : { bertambah: 0, berkurang: -selisih }
}

/**
 * Uraian efektif tiap baris, sudah termasuk rollup ke induk.
 *
 * Induk TIDAK diturunkan dari selisihnya sendiri melainkan dijumlah dari
 * anak-anaknya, dan bedanya nyata: induk yang anaknya +50 dan −10 berbunyi
 * "50 / 10" kalau dijumlah, tapi "40 / —" kalau diturunkan dari selisih
 * sendiri (+40). Yang pertama yang benar, dan yang menghasilkan baris total
 * "463jt / 463jt" — bukti bahwa geserannya berpasangan.
 *
 * Konsekuensinya kolom ini IKUT DIGULUNG (L85): tiap layar yang menampilkan
 * daftar rekening wajib menyaring baris daun, kalau tidak 45jt milik ATK muncul
 * lagi di induknya, kakeknya, dan seterusnya.
 *
 * Dihitung sekali untuk seluruh pohon, bukan per baris: memanggilnya per baris
 * membuat rollup-nya O(n²) pada 558 baris.
 */
export function uraiGeser(rows: readonly BarisUrai[]): Map<string, UraianGeser> {
  const anak = new Map<string, BarisUrai[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const daftar = anak.get(r.parent_id) ?? []
    daftar.push(r)
    anak.set(r.parent_id, daftar)
  }

  const hasil = new Map<string, UraianGeser>()

  // Pagar kedalaman: rantai induk melingkar ditolak saat SIMPAN
  // (`validateTreeIntegrity`), tapi ini jalan di jalur BACA juga — data lama yang
  // terlanjur melingkar tidak boleh menggantung layar.
  const jalan = (r: BarisUrai, dalam: number): UraianGeser => {
    const sudah = hasil.get(r.row_id)
    if (sudah) return sudah

    const kids = anak.get(r.row_id) ?? []
    let u: UraianGeser
    if (kids.length && dalam < 64) {
      let bertambah = 0
      let berkurang = 0
      for (const k of kids) {
        const uk = jalan(k, dalam + 1)
        bertambah += uk.bertambah
        berkurang += uk.berkurang
      }
      u = { bertambah, berkurang }
    } else if (sudahDiurai(r)) {
      u = { bertambah: n(r.bertambah), berkurang: n(r.berkurang) }
    } else {
      u = uraianTurunan(n(r.pergeseran) - n(r.jumlah))
    }

    hasil.set(r.row_id, u)
    return u
  }

  for (const r of rows) jalan(r, 0)
  return hasil
}

/** Total dokumen — baris AKAR saja, sepadan `hitungDeltaPergeseranRoot`. */
export function totalUraian(rows: readonly BarisUrai[]): UraianGeser {
  const peta = uraiGeser(rows)
  const ids = new Set(rows.map(r => r.row_id))
  let bertambah = 0
  let berkurang = 0
  for (const r of rows) {
    if (r.parent_id && ids.has(r.parent_id)) continue
    const u = peta.get(r.row_id) ?? URAIAN_NOL
    bertambah += u.bertambah
    berkurang += u.berkurang
  }
  return { bertambah, berkurang }
}

export interface UraianTidakCocok {
  row_id: string
  kode_rekening: string
  uraian: string
  bertambah: number
  berkurang: number
  selisih: number
}

/**
 * Baris yang uraian tangannya tidak cocok dengan selisihnya.
 *
 * Hanya baris DAUN yang diuraikan tangan yang diperiksa — induk angkanya
 * dijumlah dari anak, jadi tidak pernah punya uraian sendiri untuk dicocokkan.
 *
 * Sifat "total Bertambah = total Berkurang" TIDAK diperiksa terpisah: ia
 * mengikuti sendiri dari invarian per-baris ini ditambah pagar
 * PERGESERAN_TIDAK_BERIMBANG yang sudah ada.
 */
export function periksaUraian(
  rows: readonly (BarisUrai & { kode_rekening?: string; uraian?: string })[],
): UraianTidakCocok[] {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)

  const salah: UraianTidakCocok[] = []
  for (const r of rows) {
    if (punyaAnak.has(r.row_id) || !sudahDiurai(r)) continue
    const bertambah = n(r.bertambah)
    const berkurang = n(r.berkurang)
    const selisih = n(r.pergeseran) - n(r.jumlah)
    if (Math.abs(bertambah - berkurang - selisih) <= EPS_URAIAN) continue
    salah.push({
      row_id: r.row_id,
      kode_rekening: r.kode_rekening ?? '',
      uraian: r.uraian ?? '',
      bertambah, berkurang, selisih,
    })
  }
  return salah
}

/** Pesan penolakan yang MENYEBUT rekeningnya — "tidak cocok" tanpa nama tidak bisa ditindaklanjuti. */
export function pesanUraianTidakCocok(salah: readonly UraianTidakCocok[]): string {
  const rp = (v: number) => `Rp ${Math.round(v).toLocaleString('id-ID')}`
  const contoh = salah.slice(0, 3).map(s =>
    `${s.kode_rekening || s.uraian || s.row_id}: bertambah ${rp(s.bertambah)} `
    + `− berkurang ${rp(s.berkurang)} = ${rp(s.bertambah - s.berkurang)}, `
    + `tapi selisihnya ${rp(s.selisih)}`)
  const sisa = salah.length > 3 ? ` (dan ${salah.length - 3} baris lain)` : ''
  return `Uraian bertambah/berkurang tidak cocok dengan selisihnya — ${contoh.join('; ')}${sisa}. `
    + `Bertambah dikurangi Berkurang harus sama dengan Pergeseran dikurangi Jumlah.`
}

/** Uraian dilepas — dipakai tiap jalur yang MENGGANTI baris (Tutup, Inject, Generate). */
export function tanpaUraian<T extends { bertambah?: number | null; berkurang?: number | null }>(r: T): T {
  return { ...r, bertambah: null, berkurang: null }
}

/** Baris daun? Uraian tangan hanya boleh di sini — induk selalu dijumlah dari anak. */
export function petaDaun(rows: readonly Pick<BarisUrai, 'row_id' | 'parent_id'>[]): Set<string> {
  const punyaAnak = new Set<string>()
  for (const r of rows) if (r.parent_id) punyaAnak.add(r.parent_id)
  const daun = new Set<string>()
  for (const r of rows) if (!punyaAnak.has(r.row_id)) daun.add(r.row_id)
  return daun
}

export type { PergeseranBarisInput }
