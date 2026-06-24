import { sql, withTransaction, bulkInsert } from '@/lib/data/db'
import { assertBludVersion, bumpBludVersion, getBludVersion, BLUD_SINGLETON_KEY } from './lock'
import type { PenanggungJawabInput } from './penanggung-jawab-schemas'

export interface PenanggungJawab {
  id:     number
  label:  string
  urutan: number
}

export class PenanggungJawabSafetyError extends Error {
  constructor(public existing: number, public incoming: number, public dropPct: number) {
    super(`Safety guard: hanya ${incoming} baris baru vs ${existing} existing (drop ${dropPct.toFixed(1)}%). Pakai force=true kalau memang sengaja.`)
    this.name = 'PenanggungJawabSafetyError'
  }
}

export async function getPenanggungJawab(): Promise<PenanggungJawab[]> {
  const rows = await sql`SELECT id, label, urutan FROM penanggung_jawab ORDER BY urutan ASC, id ASC LIMIT 500`
  return (rows as Record<string, unknown>[]).map(r => ({
    id:     Number(r.id),
    label:  String(r.label ?? ''),
    urutan: Number(r.urutan ?? 0),
  }))
}

const COLS = ['label', 'urutan']
const SAFE_DROP_THRESHOLD = 0.5

/** L51: get current version utk client baseline penanggung jawab. */
export async function getPenanggungJawabVersion(): Promise<number> {
  return getBludVersion('penanggung_jawab', BLUD_SINGLETON_KEY)
}

export async function savePenanggungJawab(
  rows: PenanggungJawabInput[],
  userId: number,
  expectedVersion: number,
  force = false,
): Promise<{ existing: number; replaced: number; newVersion: number }> {
  const incoming = rows.length
  let existing = 0

  await withTransaction(async ({ tx, conn }) => {
    await assertBludVersion(tx, 'penanggung_jawab', BLUD_SINGLETON_KEY, expectedVersion)
    // Threshold di dalam tx (audit DPA 2026-06-11 B-3)
    const cntRows = await tx`SELECT COUNT(*) AS cnt FROM penanggung_jawab` as { cnt: unknown }[]
    existing = Number(cntRows[0]?.cnt ?? 0)
    if (!force && existing > 0 && incoming < existing * SAFE_DROP_THRESHOLD) {
      throw new PenanggungJawabSafetyError(existing, incoming, ((existing - incoming) / existing) * 100)
    }
    await tx`DELETE FROM penanggung_jawab`
    if (rows.length) {
      const values = rows.map((r, i) => [r.label, i])
      await bulkInsert('penanggung_jawab', COLS, values, conn)
    }
    await bumpBludVersion(tx, 'penanggung_jawab', BLUD_SINGLETON_KEY, userId)
  })

  return { existing, replaced: incoming, newVersion: expectedVersion + 1 }
}
