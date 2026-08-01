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

/**
 * Key lock per-versi ber-dimensi tahun: `${tahun}:${versi}`.
 * WHY: tanpa tahun, DPA 2 tahun berbeda yang disimpan pada tanggal kalender sama
 * akan berbagi lock → lost-update lintas-tahun (CONCEPT-blud-tahun-anggaran §1).
 */
export function bludVersiKey(tahun: number, versiTanggal: string): string {
  return `${tahun}:${versiTanggal}`
}

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

/** Entity lock pagar pagu realisasi — satu baris per (tahun, anggaran_key). */
export const BLUD_PAGU_ENTITY = 'realisasi_pagu'
/** Entity lock penomoran kuitansi — satu baris per (tahun, bulan). */
export const BLUD_KWT_ENTITY = 'realisasi_kwt'

/**
 * Entity lock perpindahan status periode — satu baris per TAHUN, bukan per bulan.
 *
 * N1: aturan tutup/buka/saldo-awal semuanya bicara tentang bulan LAIN ("tidak ada
 * bulan sesudahnya yang tertutup", "semua bulan sebelumnya sudah tutup", "belum ada
 * bulan mana pun yang tertutup"). Mengunci baris bulannya sendiri tidak menjaga
 * aturan yang jangkauannya setahun: A membuka Mei dan B menutup Juni memegang baris
 * berbeda, keduanya lolos, dan hasilnya Juni TUTUP di atas Mei BUKA.
 *
 * Sengaja TIDAK dipakai `createTx`/`updateTx`/`deleteTx`: mencatat transaksi harian
 * cukup dijaga kunci baris `blud_periode` bulan itu, dan menyeretnya ke kunci
 * setahun akan membuat seluruh entri satu tahun antre di belakang satu sama lain.
 */
export const BLUD_PERIODE_ENTITY = 'realisasi_periode'

export const bludPaguKey = (tahun: number, anggaranKey: string) => `${tahun}:${anggaranKey}`
export const bludKwtKey = (tahun: number, bulan: number) => `${tahun}:${bulan}`
export const bludPeriodeKey = (tahun: number) => String(tahun)

/**
 * Pastikan baris lock ADA lalu kunci eksklusif.
 *
 * WHY bukan assertBludVersion: `SELECT ... FOR UPDATE` pada baris yang BELUM ADA
 * tidak mengunci apa pun — dua transaksi sama-sama lolos lalu sama-sama menulis.
 * Pagar pagu realisasi (CONCEPT-blud-realisasi §5.2) sering menyentuh rekening yang
 * belum punya baris lock, jadi INSERT IGNORE dulu baru FOR UPDATE.
 *
 * Kuncinya per-key, bukan per-aplikasi: mencatat belanja telepon & listrik tidak
 * saling menunggu. Pemanggil WAJIB mengunci dalam urutan key MENAIK (§5.3) —
 * dengan urutan seragam, lingkaran tunggu (deadlock 1213) mustahil terbentuk.
 */
export async function acquireBludLock(tx: TxSql, entity: string, keyId: string): Promise<void> {
  await tx`INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (${entity}, ${keyId}, 0)`
  await tx`SELECT version FROM blud_locks WHERE entity = ${entity} AND key_id = ${keyId} FOR UPDATE`
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
