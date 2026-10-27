// lib/bba/kondisi.ts — kondisi per register (docs/CONCEPT-bba-buku-aset.md §5.3, §7.2). MURNI:
// dipakai data layer, layar, Excel, dan uji. Menggantikan hitungan baik/RR/RB per barang × lokasi
// Tahap 3 (`bba_eksisting`, dipensiunkan di Tahap C).
import type { Golongan, Kondisi as KodeKondisi } from './kib'

export type Kondisi = { baik: number; rusak_ringan: number; rusak_berat: number; total: number }

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
/** '2026-04-12' → '12 Apr 2026'. */
export function fmtTanggal(t: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t ?? '')
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : ''
}

/** Tanah tidak punya kondisi (KIB A tanpa kolomnya, §5.2). */
export const punyaKondisi = (g: Golongan) => g !== 'A'

/** Ruangan hanya untuk barang yang bisa dipindah: peralatan (B) & aset tetap lainnya (E). */
export const bolehBerRuang = (g: Golongan) => g === 'B' || g === 'E'

/** Tanggal paling lama yang masih dianggap "terkini": hari ini dikurangi jarak opname (pengaturan). */
export function batasCek(hariIni: string, opnameBulan: number): string {
  const [y, m, d] = hariIni.split('-').map(Number)
  const total = y * 12 + (m - 1) - opnameBulan
  const y2 = Math.floor(total / 12), m2 = (total % 12) + 1
  const akhirBulan = new Date(Date.UTC(y2, m2, 0)).getUTCDate()
  return `${y2}-${String(m2).padStart(2, '0')}-${String(Math.min(d, akhirBulan)).padStart(2, '0')}`
}

export type StatusCek = 'BELUM' | 'LEWAT' | 'TERKINI'
type BahanCek = { golongan: Golongan; kondisi_sumber: 'IMPOR' | 'CEK' | null; kondisi_tgl?: string | null }

/** null = tanah. BELUM = belum pernah dicek di PRIMA (termasuk kondisi dari impor, §5.3). */
export function statusCek(a: BahanCek, batas: string): StatusCek | null {
  if (!punyaKondisi(a.golongan)) return null
  if (a.kondisi_sumber !== 'CEK') return 'BELUM'
  return a.kondisi_tgl && a.kondisi_tgl < batas ? 'LEWAT' : 'TERKINI'
}

export const perluDicek = (a: BahanCek, batas: string) => { const s = statusCek(a, batas); return s === 'BELUM' || s === 'LEWAT' }

type BahanCatat = BahanCek & { status: 'AKTIF' | 'DIHAPUS'; nama: string }

/**
 * Pemeriksaan bertanggal lebih lama dari pemeriksaan yang sudah tercatat ditolak: kondisinya akan
 * menimpa hasil yang lebih baru. Laporan rusak hari ini sesudah opname pagi tetap boleh (tanggal sama).
 */
export function alasanTolakCek(a: BahanCatat, tgl: string): string | null {
  if (!punyaKondisi(a.golongan)) return `${a.nama}: tanah tidak punya kondisi.`
  if (a.status !== 'AKTIF') return `${a.nama} sudah dihapus dari buku aset.`
  if (a.kondisi_sumber === 'CEK' && a.kondisi_tgl && tgl < a.kondisi_tgl) {
    return `${a.nama} sudah dicek ${fmtTanggal(a.kondisi_tgl)} — lebih baru dari ${fmtTanggal(tgl)}. Pakai tanggal ${fmtTanggal(a.kondisi_tgl)} atau sesudahnya.`
  }
  return null
}

/** Kondisi kolom "Kondisi" lembar hasil sensus tahun T: hanya pemeriksaan di PRIMA tahun itu. */
export function kondisiSensus(a: { kondisi: KodeKondisi | null; kondisi_sumber: 'IMPOR' | 'CEK' | null; kondisi_tgl?: string | null }, tahun: number): KodeKondisi | null {
  return a.kondisi && a.kondisi_sumber === 'CEK' && a.kondisi_tgl?.startsWith(`${tahun}-`) ? a.kondisi : null
}

// ─── Ringkasan "dimiliki" per barang (Per Barang, kartu barang, §8) ─────────

export interface Dimiliki {
  jumlah: number
  kondisi: Kondisi
  /** Register tanpa kondisi sama sekali (bukan tanah). */
  kosong: number
  ruangan: number
  /** Belum dicek di PRIMA atau lewat jarak opname. */
  perluDicek: number
  /** Pemeriksaan TERBARU di antara registernya — "dicek terakhir 12 Agu 2026". */
  cekTerakhir: string | null
}

type BahanDimiliki = BahanCek & { kondisi: KodeKondisi | null; lokasi_id: number | null }

export function ringkasDimiliki(rows: readonly BahanDimiliki[], batas: string): Dimiliki {
  const d: Dimiliki = { jumlah: rows.length, kondisi: { baik: 0, rusak_ringan: 0, rusak_berat: 0, total: 0 }, kosong: 0, ruangan: 0, perluDicek: 0, cekTerakhir: null }
  const ruang = new Set<number>()
  for (const a of rows) {
    if (a.lokasi_id) ruang.add(a.lokasi_id)
    if (a.kondisi === 'B') d.kondisi.baik++
    else if (a.kondisi === 'RR') d.kondisi.rusak_ringan++
    else if (a.kondisi === 'RB') d.kondisi.rusak_berat++
    else if (punyaKondisi(a.golongan)) d.kosong++
    if (perluDicek(a, batas)) d.perluDicek++
    if (a.kondisi_sumber === 'CEK' && a.kondisi_tgl && (!d.cekTerakhir || a.kondisi_tgl > d.cekTerakhir)) d.cekTerakhir = a.kondisi_tgl
  }
  d.kondisi.total = d.kondisi.baik + d.kondisi.rusak_ringan + d.kondisi.rusak_berat
  d.ruangan = ruang.size
  return d
}

export function ringkasDimilikiPerBarang<T extends BahanDimiliki & { barang_id?: number | null }>(rows: readonly T[], batas: string): Map<number, Dimiliki> {
  const per = new Map<number, T[]>()
  for (const a of rows) if (a.barang_id) per.set(a.barang_id, [...(per.get(a.barang_id) ?? []), a])
  return new Map([...per].map(([id, xs]) => [id, ringkasDimiliki(xs, batas)]))
}
