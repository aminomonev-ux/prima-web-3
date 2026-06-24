// lib/blud/master-akun-data.ts
// Data layer untuk modul Master Akun BLUD.
// Pattern: bulkInsert + withTransaction supaya replace-all atomic
// (anti-pattern PERF-C1 + BUG-C2 dari AUDIT_LESSONS_LEARNED.md).
// Audit BLUD v1.2 (B-NEW-1): safety threshold + force flag untuk replace-all.

import { sql, withTransaction, bulkInsert, escapeLike } from '@/lib/data/db'
import { assertBludVersion, bumpBludVersion, getBludVersion, BLUD_SINGLETON_KEY } from './lock'
import type { MasterAkunInput } from './master-akun-schemas'

export interface MasterAkun extends MasterAkunInput {
  id:     number
  urutan: number
}

/** Custom error untuk safety threshold violation (catched di route handler → 409). */
export class MasterAkunSafetyError extends Error {
  constructor(public existing: number, public incoming: number, public dropPct: number) {
    super(
      `Safety guard: hanya ${incoming} baris baru vs ${existing} existing ` +
      `(drop ${dropPct.toFixed(1)}%). Pakai force=true kalau memang sengaja.`,
    )
    this.name = 'MasterAkunSafetyError'
  }
}

export async function getMasterAkun(search?: string): Promise<MasterAkun[]> {
  // L25: escape % dan _ supaya diperlakukan literal, bukan wildcard
  const term = search && search.trim() ? '%' + escapeLike(search.trim()) + '%' : null
  const rows = term
    ? await sql`
        SELECT id, kode, uraian, urutan
        FROM master_akun
        WHERE kode LIKE ${term} OR uraian LIKE ${term}
        ORDER BY urutan ASC, id ASC
        LIMIT 5000
      `
    : await sql`
        SELECT id, kode, uraian, urutan
        FROM master_akun
        ORDER BY urutan ASC, id ASC
        LIMIT 5000
      `
  return (rows as Record<string, unknown>[]).map(r => ({
    id:     Number(r.id),
    kode:   String(r.kode ?? ''),
    uraian: String(r.uraian ?? ''),
    urutan: Number(r.urutan ?? 0),
  }))
}

const MASTER_AKUN_COLUMNS = ['kode', 'uraian', 'urutan']

/** Threshold drop default: kalau new rows < 50% existing, abort kecuali force=true. */
const SAFE_DROP_THRESHOLD = 0.5

/**
 * Replace seluruh isi master_akun secara atomic.
 * Pattern audit Tahap 11: DELETE + bulkInsert dalam 1 transaction.
 * Audit BLUD v1.2 (B-NEW-1): tambah safety threshold + force flag.
 *
 * @param rows  baris baru yang akan menggantikan seluruh master_akun
 * @param force Kalau true, lewati safety threshold (user eksplisit confirm)
 * @returns     `{ existing, replaced }` untuk dipakai di audit log
 * @throws      MasterAkunSafetyError kalau rows < 50% existing dan force=false
 */
/** L51: get current version utk client baseline master akun. */
export async function getMasterAkunVersion(): Promise<number> {
  return getBludVersion('master_akun', BLUD_SINGLETON_KEY)
}

export async function saveMasterAkun(
  rows: MasterAkunInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length
  let existing = 0

  // ── Atomic replace-all + optimistic lock ────────────────────────────────
  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'master_akun', BLUD_SINGLETON_KEY, expectedVersion)
    // Threshold di dalam tx (audit DPA 2026-06-11 B-3) — skip pertama kali (existing 0)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM master_akun` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new MasterAkunSafetyError(existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await tx`DELETE FROM master_akun`
    if (rows.length) {
      const values = rows.map((r, i) => [r.kode, r.uraian, i])
      await bulkInsert('master_akun', MASTER_AKUN_COLUMNS, values, conn)
    }
    await bumpBludVersion(tx, 'master_akun', BLUD_SINGLETON_KEY, userId)
  })

  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}
