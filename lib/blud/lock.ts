// lib/blud/lock.ts — Optimistic version lock helper untuk BLUD entities.
// Cegah R1 lost update saat concurrent edit (multi-user / multi-tab).
//
// Pattern usage (di dalam withTransaction):
//   await assertVersionAndBump(tx, 'dpa_blud', versiTanggal, expectedVersion, userId)
//   ... DELETE + bulkInsert ...
//
// Reference pattern: AUDIT_LESSONS_LEARNED.md (akan jadi L51).

import { sql } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'

/**
 * Singleton key untuk entity global (master_akun, kode_besar, penanggung_jawab).
 * Per-versi entity pakai versi_tanggal sebagai key_id.
 */
export const BLUD_SINGLETON_KEY = 'singleton'

export class BludVersionConflictError extends Error {
  constructor(public entity: string, public keyId: string, public expected: number, public actual: number) {
    super(`Data ${entity} (${keyId}) sudah diubah pengguna lain. Memuat versi terbaru.`)
    this.name = 'BludVersionConflictError'
  }
}

/**
 * Read-only: ambil version saat ini utk entity+key. Dipakai API route GET supaya
 * client tahu baseline version yg mereka load. 0 = belum pernah di-save.
 */
export async function getBludVersion(entity: string, keyId: string): Promise<number> {
  const rows = await sql`
    SELECT version FROM blud_locks WHERE entity = ${entity} AND key_id = ${keyId} LIMIT 1
  ` as { version?: unknown }[]
  return Number(rows[0]?.version ?? 0)
}

/**
 * Locked check + bump: di dalam withTransaction, SELECT FOR UPDATE row lock,
 * verify expected version, lalu return next version utk caller. Caller WAJIB
 * pakai bumpBludVersion(tx, ...) setelah DELETE+INSERT selesai.
 *
 * Sengaja split (assert vs bump) supaya kalau DELETE+INSERT throw, version
 * tidak ke-bump (atomic rollback by withTransaction).
 */
export async function assertBludVersion(
  tx: TxSql, entity: string, keyId: string, expectedVersion: number,
): Promise<void> {
  const rows = await tx`
    SELECT version FROM blud_locks
    WHERE entity = ${entity} AND key_id = ${keyId}
    FOR UPDATE
  ` as { version?: unknown }[]
  const currentVersion = Number(rows[0]?.version ?? 0)
  if (currentVersion !== expectedVersion) {
    throw new BludVersionConflictError(entity, keyId, expectedVersion, currentVersion)
  }
}

/**
 * Bump version setelah save sukses. INSERT row pertama kali atau UPDATE+1.
 */
export async function bumpBludVersion(
  tx: TxSql, entity: string, keyId: string, userId: number,
): Promise<void> {
  await tx`
    INSERT INTO blud_locks (entity, key_id, version, updated_by)
    VALUES (${entity}, ${keyId}, 1, ${userId})
    ON DUPLICATE KEY UPDATE version = version + 1, updated_by = ${userId}
  `
}

/**
 * Drop lock saat versi entitas dihapus (cleanup, cegah orphan lock row).
 * Dipakai di delete*Versi() functions.
 */
export async function dropBludVersion(
  tx: TxSql, entity: string, keyId: string,
): Promise<void> {
  await tx`DELETE FROM blud_locks WHERE entity = ${entity} AND key_id = ${keyId}`
}
