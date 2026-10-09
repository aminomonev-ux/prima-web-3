// lib/blud/perubahan-dasar.ts — bahan modal "Jadikan DPA Perubahan" (konsep §5).
//
// Sumbernya ditanyakan ke `sumberPaguTahun`, BUKAN dihitung di layar: "angka yang
// sedang jadi pagu" itu aturan §8, dan aturan itu hanya boleh hidup di satu tempat.
// Pemetaannya juga di sini (server) supaya satu mapper — `pergeseranKeDpaInput` —
// yang dipakai, dan jejak usulan bisa diambil dari DPA acuan tanpa layar DPA perlu
// izin membaca menu Pergeseran.
//
// Kolom Sebelum ikut diisi di sini HANYA untuk pratinjau layar. Server tetap
// mengisinya sendiri saat Simpan (§6) — kiriman klien diabaikan.

import { getPaguSumber } from './pagu'
import { getDpaByDate, getPergeseranByDate, getDpaLatestDate } from './data'
import { dpaKeInput, pergeseranKeDpaInput, type JejakUsulan } from './row-map'
import { hitungDeltaPergeseranRoot } from './recalc'
import { totalAkarDpa } from './salin-versi'
import type { DpaBarisInput } from '@/types'

export interface DasarPerubahan {
  sumber_dasar: 'PERGESERAN' | 'DPA'
  versi_dasar: string
  rows: DpaBarisInput[]
  jumlah_baris: number
  total: number
  /** Pergeseran disimpan sebagai draft tak berimbang — selisihnya (0 = berimbang). */
  selisih_draft: number
  /** Acuan pergeseran dasar (null kalau dasarnya DPA). */
  acuan: string | null
  /** DPA yang disimpan SESUDAH acuan pergeseran itu dan belum disinkronkan — tidak ikut terbawa. */
  dpa_direvisi: string | null
}

export async function getDasarPerubahan(tahun: number): Promise<DasarPerubahan | null> {
  const s = await getPaguSumber(tahun)
  if (s.sumber === 'KOSONG' || !s.versi) return null

  if (s.sumber === 'DPA') {
    const dpa = await getDpaByDate(tahun, s.versi)
    const rows = dpa.map(d => ({
      ...dpaKeInput(d),
      vol_sebelum: d.vol, satuan_sebelum: d.satuan, harga_sebelum: d.harga, jumlah_sebelum: d.jumlah,
    }))
    return {
      sumber_dasar: 'DPA', versi_dasar: s.versi, rows, jumlah_baris: rows.length,
      total: totalAkarDpa(rows), selisih_draft: 0, acuan: null, dpa_direvisi: null,
    }
  }

  const pg = await getPergeseranByDate(tahun, s.versi)
  const acuan = pg[0]?.dpa_versi_tanggal ?? null
  const jejak = new Map<string, JejakUsulan>()
  if (acuan) for (const d of await getDpaByDate(tahun, acuan)) jejak.set(d.row_id, d)
  const rows = pg.map((p, i) => ({
    ...pergeseranKeDpaInput(p, i, jejak),
    ...(p.anggaran_key
      ? { vol_sebelum: p.vol_p, satuan_sebelum: p.satuan, harga_sebelum: p.harga_p, jumlah_sebelum: p.pergeseran }
      : {}),
  }))
  const dpaTerakhir = await getDpaLatestDate(tahun)
  return {
    sumber_dasar: 'PERGESERAN', versi_dasar: s.versi, rows, jumlah_baris: rows.length,
    total: totalAkarDpa(rows),
    selisih_draft: hitungDeltaPergeseranRoot(pg),
    acuan,
    dpa_direvisi: acuan && dpaTerakhir && dpaTerakhir > acuan ? dpaTerakhir : null,
  }
}
