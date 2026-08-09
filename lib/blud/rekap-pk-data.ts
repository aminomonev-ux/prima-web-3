// lib/blud/rekap-pk-data.ts
// Data layer untuk snapshot Rekap Penanggung Jawab BLUD (table rekap_pk).
//
// Pattern: replace-latest snapshot per versi_dpa.
// L4 (anti-pattern): DELETE + bulkInsert dibungkus withTransaction supaya atomic.
// PERF-C1: pakai bulkInsert (bukan INSERT loop).

import { withTransaction, bulkInsert } from '@/lib/data/db'
import { bumpBludVersion, bludVersiKey } from './lock'
import { getDpaLatestDate } from './data'

export interface RekapPKItem {
  /** Nama PJ atau label total (e.g. "TOTAL BELANJA BLUD"). */
  label:   string
  /** Total nominal per PJ. */
  nominal: number
}

/**
 * Simpan snapshot rekap PJ. Replace-all per (tahun_anggaran, versi_dpa).
 *
 * @param tahun    Tahun anggaran DPA yang di-rekap.
 * @param versi    Versi DPA yang di-rekap. Kalau null → pakai latest dalam tahun.
 * @param items    Array {label, nominal}. Diharapkan sudah filter kosong di caller.
 * @param userId   ID user yang menyimpan (untuk saved_by + audit).
 * @returns versi_dpa yang akhirnya dipakai (resolved kalau caller pass null).
 */
export async function saveRekapPK(
  tahun: number,
  versi: string | null,
  items: RekapPKItem[],
  userId: number,
): Promise<{ versi_dpa: string; affected: number }> {
  // Resolve versi — kalau null, ambil latest DPA dalam tahun
  const versiDpa = versi ?? await getDpaLatestDate(tahun)
  if (!versiDpa) throw new Error('Tidak ada versi DPA — tidak bisa simpan rekap PK')

  // Filter row dengan label kosong (defensive — Zod sudah validate min 1 char)
  const cleanRows = items.filter(it => it.label && it.label.trim() !== '')
  if (cleanRows.length === 0) throw new Error('Tidak ada row valid untuk disimpan')

  let affected = 0
  await withTransaction(async ({ tx, conn }) => {
    // 1. Hapus snapshot lama untuk (tahun, versi) yang sama
    await tx`DELETE FROM rekap_pk WHERE tahun_anggaran = ${tahun} AND versi_dpa = ${versiDpa}`

    // 2. bulkInsert snapshot baru (PERF-C1)
    // Audit BLUD v1.2 (B-NEW-4): cast `as unknown as` dihapus — bulkInsert sekarang
    // terima `readonly string[]` sehingga readonly tuple langsung kompatibel.
    const cols = ['tahun_anggaran', 'versi_dpa', 'label', 'nominal', 'saved_by'] as const
    const values = cleanRows.map(it => [tahun, versiDpa, it.label.trim(), Number(it.nominal) || 0, userId])
    const result = await bulkInsert('rekap_pk', cols, values, conn)
    affected = result.affectedRows

    // W-1: snapshot sengaja last-write-wins (tanpa assert konflik), tapi version
    // tetap di-bump supaya lock row ada — deleteDpaVersi drop lock 'rekap_pk' ini.
    await bumpBludVersion(tx, 'rekap_pk', bludVersiKey(tahun, versiDpa), userId)
  })

  return { versi_dpa: versiDpa, affected }
}
