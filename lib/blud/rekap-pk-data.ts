// lib/blud/rekap-pk-data.ts
// Data layer untuk snapshot Rekap Penanggung Jawab BLUD (table rekap_pk).
//
// Pattern: replace-latest snapshot per versi_dpa.
// L4 (anti-pattern): DELETE + bulkInsert dibungkus withTransaction supaya atomic.
// PERF-C1: pakai bulkInsert (bukan INSERT loop).

import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import { bumpBludVersion } from './lock'
import { getDpaLatestDate } from './data'

export interface RekapPKItem {
  /** Nama PJ atau label total (e.g. "TOTAL BELANJA BLUD"). */
  label:   string
  /** Total nominal per PJ. */
  nominal: number
}

export interface RekapPKSnapshot {
  versi_dpa: string
  rows:      RekapPKItem[]
  saved_at:  string  // ISO date
  saved_by:  number | null
}

/**
 * Simpan snapshot rekap PJ. Replace-all per versi_dpa.
 *
 * @param versi    Versi DPA yang di-rekap. Kalau null → pakai latest.
 * @param items    Array {label, nominal}. Diharapkan sudah filter kosong di caller.
 * @param userId   ID user yang menyimpan (untuk saved_by + audit).
 * @returns versi_dpa yang akhirnya dipakai (resolved kalau caller pass null).
 */
export async function saveRekapPK(
  versi: string | null,
  items: RekapPKItem[],
  userId: number,
): Promise<{ versi_dpa: string; affected: number }> {
  // Resolve versi — kalau null, ambil latest DPA
  const versiDpa = versi ?? await getDpaLatestDate()
  if (!versiDpa) throw new Error('Tidak ada versi DPA — tidak bisa simpan rekap PK')

  // Filter row dengan label kosong (defensive — Zod sudah validate min 1 char)
  const cleanRows = items.filter(it => it.label && it.label.trim() !== '')
  if (cleanRows.length === 0) throw new Error('Tidak ada row valid untuk disimpan')

  let affected = 0
  await withTransaction(async ({ tx, conn }) => {
    // 1. Hapus snapshot lama untuk versi yang sama
    await tx`DELETE FROM rekap_pk WHERE versi_dpa = ${versiDpa}`

    // 2. bulkInsert snapshot baru (PERF-C1)
    // Audit BLUD v1.2 (B-NEW-4): cast `as unknown as` dihapus — bulkInsert sekarang
    // terima `readonly string[]` sehingga readonly tuple langsung kompatibel.
    const cols = ['versi_dpa', 'label', 'nominal', 'saved_by'] as const
    const values = cleanRows.map(it => [versiDpa, it.label.trim(), Number(it.nominal) || 0, userId])
    const result = await bulkInsert('rekap_pk', cols, values, conn)
    affected = result.affectedRows

    // W-1: snapshot sengaja last-write-wins (tanpa assert konflik), tapi version
    // tetap di-bump supaya lock row ada — deleteDpaVersi drop lock 'rekap_pk' ini.
    await bumpBludVersion(tx, 'rekap_pk', versiDpa, userId)
  })

  return { versi_dpa: versiDpa, affected }
}

/**
 * Ambil snapshot terakhir untuk versi tertentu.
 * Returns null kalau belum pernah disimpan.
 */
export async function getRekapPK(versiDpa: string): Promise<RekapPKSnapshot | null> {
  const rows = await sql`
    SELECT label, nominal, saved_at, saved_by
    FROM rekap_pk
    WHERE versi_dpa = ${versiDpa}
    ORDER BY id ASC
  ` as Array<{ label: string; nominal: string | number; saved_at: string | Date; saved_by: number | null }>

  if (rows.length === 0) return null

  return {
    versi_dpa: versiDpa,
    rows: rows.map(r => ({ label: r.label, nominal: Number(r.nominal) || 0 })),
    saved_at: typeof rows[0].saved_at === 'string' ? rows[0].saved_at : rows[0].saved_at.toISOString(),
    saved_by: rows[0].saved_by,
  }
}
