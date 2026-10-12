// lib/kinerja/tutup-bulan-data.ts — baca/tulis `kinerja_bulan_tutup`.
//
// Aturannya (urutan, kalimat) di `tutup-bulan.ts`; di sini cuma DB + gembok.
// Konsep: docs/CONCEPT-kinerja-simpan-realisasi.md §5

import { withTransaction } from '@/lib/data/db'
import type { Penanya } from '@/lib/data/db'
import { acquireBludLock } from '@/lib/data/locks'
import { waktuSekarangWIB } from '@/lib/shared/waktu-wib'
import type { SumberSSK } from '@/lib/data/kinerja'
import {
  REALISASI_LOCK_ENTITY, realisasiLockKey, alasanTolakTutup, alasanTolakBuka,
  type BulanTertutup,
} from './tutup-bulan'

/** Tutup/Buka ditolak aturan urutan — diterjemahkan jadi 409 di route. */
export class KinerjaAturanTutupError extends Error {
  constructor(alasan: string) {
    super(alasan)
    this.name = 'KinerjaAturanTutupError'
  }
}

/**
 * Dari dalam transaksi WAJIB dioper `tx` (L69-b): pagar Simpan membaca daftar ini di
 * bawah gembok realisasi, dan pembacaan lewat koneksi lain tidak ikut terlindungi.
 */
export async function daftarBulanTertutup(q: Penanya, tahun: string, sumber: SumberSSK): Promise<BulanTertutup[]> {
  const rows = await q`
    SELECT t.bulan, COALESCE(u.nama_lengkap, u.username) AS oleh,
           DATE_FORMAT(t.ditutup_pada, '%Y-%m-%d %H:%i:%s') AS pada
    FROM kinerja_bulan_tutup t
    LEFT JOIN users u ON u.id = t.ditutup_oleh
    WHERE t.tahun = ${tahun} AND t.sumber = ${sumber}
    ORDER BY t.bulan
  ` as { bulan: unknown; oleh: unknown; pada: unknown }[]
  return rows.map(r => ({
    bulan:        Number(r.bulan),
    ditutup_oleh: r.oleh ? String(r.oleh) : null,
    ditutup_pada: String(r.pada ?? ''),
  }))
}

export async function bulanTertutupSet(q: Penanya, tahun: string, sumber: SumberSSK): Promise<Set<number>> {
  const rows = await q`
    SELECT bulan FROM kinerja_bulan_tutup WHERE tahun = ${tahun} AND sumber = ${sumber}
  ` as { bulan: unknown }[]
  return new Set(rows.map(r => Number(r.bulan)))
}

/** Tidak menunggu gembok — cukup untuk pertanyaan "boleh di-Reset?" yang juga dijaga gembok. */
export async function adaBulanTertutup(q: Penanya, tahun: string, sumber: SumberSSK): Promise<boolean> {
  const rows = await q`
    SELECT 1 FROM kinerja_bulan_tutup WHERE tahun = ${tahun} AND sumber = ${sumber} LIMIT 1
  ` as unknown[]
  return rows.length > 0
}

export async function tutupBulanRealisasi(
  tahun: string, sumber: SumberSSK, bulan: number, userId: number,
): Promise<BulanTertutup[]> {
  return withTransaction(async ({ tx }) => {
    // Gembok yang SAMA dengan Simpan Realisasi, sebagai perintah pertama (L84).
    await acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber))
    const ada = await daftarBulanTertutup(tx, tahun, sumber)
    const alasan = alasanTolakTutup(ada.map(x => x.bulan), bulan)
    if (alasan) throw new KinerjaAturanTutupError(alasan)
    await tx`
      INSERT INTO kinerja_bulan_tutup (tahun, sumber, bulan, ditutup_oleh, ditutup_pada)
      VALUES (${tahun}, ${sumber}, ${bulan}, ${userId}, ${waktuSekarangWIB()})
    `
    return daftarBulanTertutup(tx, tahun, sumber)
  })
}

export async function bukaBulanRealisasi(
  tahun: string, sumber: SumberSSK, bulan: number,
): Promise<BulanTertutup[]> {
  return withTransaction(async ({ tx }) => {
    await acquireBludLock(tx, REALISASI_LOCK_ENTITY, realisasiLockKey(tahun, sumber))
    const ada = await daftarBulanTertutup(tx, tahun, sumber)
    const alasan = alasanTolakBuka(ada.map(x => x.bulan), bulan)
    if (alasan) throw new KinerjaAturanTutupError(alasan)
    await tx`
      DELETE FROM kinerja_bulan_tutup WHERE tahun = ${tahun} AND sumber = ${sumber} AND bulan = ${bulan}
    `
    return daftarBulanTertutup(tx, tahun, sumber)
  })
}
