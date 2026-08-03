// lib/blud/lock.ts — nama entity & pembentuk key khas BLUD.
//
// Mekanismenya sendiri sudah pindah ke `lib/data/locks.ts` supaya berkas umum
// (mis. `lib/data/menu-access.ts`) tidak perlu mengimpor berkas milik satu modul.
// Yang tersisa di sini murni yang memang BLUD: nama entity dan bentuk key-nya.
//
// Re-export di bawah dipertahankan supaya 12 pemanggil lama (`from './lock'`,
// `from '@/lib/blud/lock'`) tidak perlu disentuh — perpindahan ini nol perubahan
// perilaku, dan diff yang kecil itu justru intinya.
//
// Pattern usage (di dalam withTransaction):
//   await assertBludVersion(tx, 'dpa_blud', bludVersiKey(tahun, versiTanggal), expected)
//   ... DELETE + bulkInsert ...
//   await bumpBludVersion(tx, 'dpa_blud', keyId, userId)
//
// Reference pattern: AUDIT_LESSONS_LEARNED.md L51.

export {
  BludVersionConflictError,
  getBludVersion,
  assertBludVersion,
  bumpBludVersion,
  acquireBludLock,
  dropBludVersion,
} from '@/lib/data/locks'

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
