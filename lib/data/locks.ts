// lib/data/locks.ts — mekanisme kunci optimistik + kunci eksklusif, dipakai lintas modul.
//
// Isinya pindahan dari `lib/blud/lock.ts` tanpa satu pun perubahan perilaku. Alasannya
// arah ketergantungan: `lib/data/menu-access.ts` itu berkas umum (BLUD hari ini, PK dan
// Usulan menyusul), sedangkan `lib/blud/lock.ts` milik satu modul. Berkas umum mengimpor
// berkas modul adalah panah yang menghadap ke arah salah — kelihatannya sepele sampai
// nanti ada kunci untuk modul Usulan yang diambil lewat berkas bernama "blud".
//
// Yang TIDAK ikut pindah: nama tabelnya. `blud_locks` sudah dipakai enam modul, dan
// migration rename menyentuh semua pemanggil demi kerapian nama saja — tidak sepadan.
// Jadi tabelnya memang sedikit meleset namanya, dan komentar ini yang menutupinya.
//
// Nama fungsinya juga sengaja dipertahankan (`acquireBludLock`, dst.) supaya
// perpindahan ini nol-risiko: 12 pemanggil lama tidak perlu disentuh sama sekali.
// `lib/blud/lock.ts` mengekspor ulang dari sini, jadi `from './lock'` tetap hidup.
//
// Pattern usage (di dalam withTransaction):
//   await assertBludVersion(tx, 'dpa_blud', keyId, expectedVersion)
//   ... DELETE + bulkInsert ...
//   await bumpBludVersion(tx, 'dpa_blud', keyId, userId)
//
// Reference: L48 (CAS per-baris), L51 (optimistic lock generic), L69-a (INSERT IGNORE).

import { sql } from '@/lib/data/db'
import type { TxSql } from '@/lib/data/db'

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
 * Pastikan baris lock ADA lalu kunci eksklusif.
 *
 * WHY bukan assertBludVersion: `SELECT ... FOR UPDATE` pada baris yang BELUM ADA
 * tidak mengunci apa pun — dua transaksi sama-sama lolos lalu sama-sama menulis.
 * Pagar pagu realisasi (CONCEPT-blud-realisasi §5.2) sering menyentuh rekening yang
 * belum punya baris lock, jadi INSERT IGNORE dulu baru FOR UPDATE. Diuji T10a/T10b
 * di `scripts/concurrency-test.js`: tanpa INSERT IGNORE hasilnya bukan penolakan
 * anggun melainkan deadlock 1213.
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
