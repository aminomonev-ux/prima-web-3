// lib/bba/aset.ts — aturan buku aset yang MURNI: dipakai data layer, layar, dan uji.
// Konsep: docs/CONCEPT-bba-buku-aset.md §5, §7.1.
import type { Golongan, Kondisi } from './kib'
import type { AsetBaca, NilaiKib } from './kib-baca'
import { statusCek } from './kondisi'

export interface AsetRingan {
  id: number
  golongan: Golongan
  kode_barang: string | null
  register: string | null
  kunci_impor: string | null
  kode_objek: string | null
  tahun_perolehan: number | null
  nama_resmi: string
  nama: string | null
  lokasi_id: number | null
  harga: number
  asal_usul: string | null
  keterangan: string | null
  kondisi: Kondisi | null
  kondisi_sumber: 'IMPOR' | 'CEK' | null
  kib: Record<string, NilaiKib>
  status: 'AKTIF' | 'DIHAPUS'
  /** Diisi pembaca DB (Tahap C); objek uji & hasil impor boleh tanpa. */
  kondisi_tgl?: string | null
  version?: number
  barang_id?: number | null
}

/** Perencana mencari "Bangsal", bukan "Bangunan gudang tertutup permanen" (§4 temuan 3). */
export function namaTampil(a: Pick<AsetRingan, 'nama' | 'nama_resmi'>): string {
  return a.nama?.trim() || a.nama_resmi
}

/** Kondisi hasil impor bukan hasil pemeriksaan (§5.3). */
export function belumDicek(a: Pick<AsetRingan, 'kondisi' | 'kondisi_sumber'>): boolean {
  return a.kondisi_sumber !== 'CEK'
}

// ─── Tampilan berkelompok (§5.1) ─────────────────────────────────────────────

export interface KelompokAset {
  kunci: string
  golongan: Golongan
  nama: string
  nama_resmi: string
  tahun: number | null
  lokasi_id: number | null
  ids: number[]
  register: string[]
  harga: number
  kondisi: { B: number; RR: number; RB: number; kosong: number }
  belumDicek: number
  /** Sudah dicek di PRIMA tapi lebih lama dari jarak opname (pengaturan). */
  lewat: number
}

/**
 * Sejenis-setahun-seruangan: nama tampil + kode objek + tahun + ruangan. Data tetap per register.
 * `batas` = `batasCek(hari ini, jarak opname)`; tanpa itu `lewat` selalu 0.
 */
export function kelompokkan(rows: readonly AsetRingan[], batas = ''): KelompokAset[] {
  const peta = new Map<string, KelompokAset>()
  for (const a of rows) {
    const nama = namaTampil(a)
    const kunci = [a.golongan, nama.toLowerCase(), a.kode_objek ?? '', a.tahun_perolehan ?? '', a.lokasi_id ?? ''].join('|')
    let k = peta.get(kunci)
    if (!k) {
      k = { kunci, golongan: a.golongan, nama, nama_resmi: a.nama_resmi, tahun: a.tahun_perolehan, lokasi_id: a.lokasi_id,
        ids: [], register: [], harga: 0, kondisi: { B: 0, RR: 0, RB: 0, kosong: 0 }, belumDicek: 0, lewat: 0 }
      peta.set(kunci, k)
    }
    k.ids.push(a.id)
    if (a.register) k.register.push(a.register)
    k.harga += a.harga
    if (a.kondisi) k.kondisi[a.kondisi]++
    else k.kondisi.kosong++
    const st = statusCek(a, batas)
    if (st === 'BELUM') k.belumDicek++
    else if (st === 'LEWAT') k.lewat++
  }
  return [...peta.values()]
}

/** "000011–000014" untuk register berurutan, selebihnya dipisah koma (dipendekkan). */
export function rentangRegister(regs: readonly string[]): string {
  if (regs.length === 0) return '—'
  const urut = [...regs].sort()
  const angka = urut.map(r => (/^\d+$/.test(r) ? Number(r) : NaN))
  const runtut = angka.every((n, i) => Number.isFinite(n) && (i === 0 || n === angka[i - 1] + 1))
  if (urut.length === 1) return urut[0]
  if (runtut) return `${urut[0]}–${urut[urut.length - 1]}`
  return urut.length <= 4 ? urut.join(', ') : `${urut.slice(0, 3).join(', ')}, … (${urut.length})`
}

// ─── Impor ulang (§7.1 butir 3) ──────────────────────────────────────────────

const LABEL_POKOK: Record<string, string> = {
  nama_resmi: 'nama resmi', kode_objek: 'kode objek', tahun_perolehan: 'tahun perolehan', harga: 'harga',
  asal_usul: 'asal usul', keterangan: 'keterangan', kondisi: 'kondisi', golongan: 'golongan', status: 'status',
}

const samaNilai = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005)

/**
 * Yang diperbarui impor ulang = kolom KIB. Tambahan PRIMA (nama sehari-hari, ruangan, barang)
 * tidak pernah disentuh; kondisi hanya diperbarui selama belum dicek di PRIMA (CEK menang).
 * Aset yang sudah DIHAPUS di PRIMA tapi masih ada di berkas: dikembalikan aktif TIDAK —
 * cukup dilaporkan (statusnya keputusan RT, bukan berkas).
 */
export function bandingAset(lama: AsetRingan, baru: AsetBaca): { kolom: string[]; ubah: Partial<AsetRingan> } {
  const ubah: Partial<AsetRingan> = {}
  const kolom: string[] = []
  const pokok = ['nama_resmi', 'kode_objek', 'tahun_perolehan', 'harga', 'asal_usul', 'keterangan'] as const
  for (const k of pokok) {
    if (!samaNilai(lama[k], baru[k])) { (ubah as Record<string, unknown>)[k] = baru[k]; kolom.push(LABEL_POKOK[k]) }
  }
  if (lama.kondisi_sumber !== 'CEK' && !samaNilai(lama.kondisi, baru.kondisi)) { ubah.kondisi = baru.kondisi; kolom.push(LABEL_POKOK.kondisi) }
  const kunciKib = new Set([...Object.keys(lama.kib ?? {}), ...Object.keys(baru.kib)])
  const kibBerubah = [...kunciKib].filter(k => !samaNilai(lama.kib?.[k], baru.kib[k]))
  if (kibBerubah.length) { ubah.kib = { ...baru.kib }; kolom.push(...kibBerubah) }
  return { kolom, ubah }
}

export interface RencanaImpor {
  baru: AsetBaca[]
  berubah: { lama: AsetRingan; baru: AsetBaca; kolom: string[]; ubah: Partial<AsetRingan> }[]
  sama: number
  /** Aset DIHAPUS di PRIMA yang masih ada di berkas — dilaporkan, tidak dihidupkan lagi. */
  dihapusDiPrima: AsetBaca[]
  /** Register di PRIMA (golongan yang ada di berkas) yang tidak ada di berkas — dilaporkan, TIDAK dihapus. */
  tidakDiBerkas: AsetRingan[]
}

export function rencanakanImpor(lama: readonly AsetRingan[], baca: readonly AsetBaca[]): RencanaImpor {
  const perKunci = new Map(lama.filter(a => a.kunci_impor).map(a => [a.kunci_impor!, a]))
  const hasil: RencanaImpor = { baru: [], berubah: [], sama: 0, dihapusDiPrima: [], tidakDiBerkas: [] }
  const dipakai = new Set<string>()
  for (const b of baca) {
    const l = perKunci.get(b.kunci)
    if (!l) { hasil.baru.push(b); continue }
    dipakai.add(b.kunci)
    if (l.status === 'DIHAPUS') { hasil.dihapusDiPrima.push(b); continue }
    const { kolom, ubah } = bandingAset(l, b)
    if (kolom.length) hasil.berubah.push({ lama: l, baru: b, kolom, ubah })
    else hasil.sama++
  }
  const golBerkas = new Set(baca.map(b => b.golongan))
  hasil.tidakDiBerkas = lama.filter(a => a.status === 'AKTIF' && a.kunci_impor && golBerkas.has(a.golongan) && !dipakai.has(a.kunci_impor))
  return hasil
}

/** Nama sehari-hari awal: dari Keterangan ("Gedung Bangsal I"), tidak lebih dari 255 huruf. */
export function namaDariKeterangan(keterangan: string | null): string | null {
  const t = keterangan?.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, 255) : null
}
