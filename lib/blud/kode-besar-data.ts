// lib/blud/kode-besar-data.ts
// Data layer untuk modul Kode Besar BLUD.
// Pattern: bulkInsert + withTransaction (replace-all atomic).
// Migration 026: + kolom level + parent_kode (untuk fitur Buat Form DPA via Kode Besar).

import { sql, withTransaction, bulkInsert, escapeLike } from '@/lib/data/db'
import { assertBludVersion, bumpBludVersion, getBludVersion, BLUD_SINGLETON_KEY } from './lock'
import type { KodeBesarInput, KodeBesarLevel } from './kode-besar-schemas'

export interface KodeBesar {
  id:          number
  kode:        string
  uraian:      string
  level:       KodeBesarLevel
  parent_kode: string | null
  urutan:      number
}

/** Custom error untuk safety threshold violation (catched di route handler → 409). */
export class KodeBesarSafetyError extends Error {
  constructor(public existing: number, public incoming: number, public dropPct: number) {
    super(
      `Safety guard: hanya ${incoming} baris baru vs ${existing} existing ` +
      `(drop ${dropPct.toFixed(1)}%). Pakai force=true kalau memang sengaja.`,
    )
    this.name = 'KodeBesarSafetyError'
  }
}

export async function getKodeBesar(search?: string): Promise<KodeBesar[]> {
  // L25: escape % dan _ supaya diperlakukan literal, bukan wildcard
  const term = search && search.trim() ? '%' + escapeLike(search.trim()) + '%' : null
  const rows = term
    ? await sql`
        SELECT id, kode, uraian, level, parent_kode, urutan
        FROM kode_besar
        WHERE kode LIKE ${term} OR uraian LIKE ${term}
        ORDER BY urutan ASC, id ASC
        LIMIT 1000
      `
    : await sql`
        SELECT id, kode, uraian, level, parent_kode, urutan
        FROM kode_besar
        ORDER BY urutan ASC, id ASC
        LIMIT 1000
      `
  return (rows as Record<string, unknown>[]).map(r => ({
    id:          Number(r.id),
    kode:        String(r.kode ?? ''),
    uraian:      String(r.uraian ?? ''),
    level:       (r.level ?? 'L2') as KodeBesarLevel,
    parent_kode: r.parent_kode ? String(r.parent_kode) : null,
    urutan:      Number(r.urutan ?? 0),
  }))
}

const KODE_BESAR_COLUMNS = ['kode', 'uraian', 'level', 'parent_kode', 'urutan']

/** Threshold drop default: kalau new rows < 50% existing, abort kecuali force=true. */
const SAFE_DROP_THRESHOLD = 0.5

/**
 * Replace seluruh isi kode_besar secara atomic.
 * Mirror pattern saveMasterAkun (Tahap 11 + BLUD v1.2 safety threshold).
 *
 * Normalisasi data sebelum simpan:
 * - L1: parent_kode di-force ke NULL (root, tidak punya parent)
 * - L2: parent_kode opsional (auto-detect di consumer)
 * - L2.1: parent_kode di-trim, dibiarkan NULL kalau kosong (consumer warning)
 */
/** L51: get current version utk client baseline kode besar. */
export async function getKodeBesarVersion(): Promise<number> {
  return getBludVersion('kode_besar', BLUD_SINGLETON_KEY)
}

export async function saveKodeBesar(
  rows: KodeBesarInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length
  let existing = 0

  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'kode_besar', BLUD_SINGLETON_KEY, expectedVersion)
    // Threshold di dalam tx (audit DPA 2026-06-11 B-3)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM kode_besar` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new KodeBesarSafetyError(existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await tx`DELETE FROM kode_besar`
    if (rows.length) {
      const values = rows.map((r, i) => {
        const parentKode = r.level === 'L1' ? null : (r.parent_kode?.trim() || null)
        return [r.kode, r.uraian, r.level, parentKode, i]
      })
      await bulkInsert('kode_besar', KODE_BESAR_COLUMNS, values, conn)
    }
    await bumpBludVersion(tx, 'kode_besar', BLUD_SINGLETON_KEY, userId)
  })

  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}
