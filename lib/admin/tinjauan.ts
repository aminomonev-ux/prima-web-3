// lib/admin/tinjauan.ts — pembacaan & penulisan Tinjauan Akses Berkala (P3).
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §12 P3 (Tahap 8).
//
// CLAUDE.md (AUTHZ-02/V5) sudah menuntut akses direview berkala. Tidak ada alatnya,
// tidak ada catatannya, dan karena itu tidak pernah terjadi.
//
// BENTUKNYA yang menentukan apakah tinjauan itu selesai. Tinjauan yang menuntut membuka
// 40 halaman satu per satu tidak akan pernah selesai; yang membuatnya selesai adalah SATU
// layar yang dibaca dari atas ke bawah, dengan aksinya di baris yang sama, dan penyaring
// yang membuat kunjungan kedua hanya menampilkan yang belum.
//
// Bentuk barisnya + pengekspornya tinggal di `tinjauan-baris.ts` — berkas DAUN tanpa satu
// pun impor server. Berkas INI yang membaca DB, jadi ia tidak boleh jadi tempat tinggal
// apa pun yang dibutuhkan komponen `'use client'`.

import { sql, sqlInt, withTransaction } from '@/lib/data/db'
import { BULAN_TINJAUAN, susunBaris, type BarisTinjauan, type BarisMentah } from '@/lib/admin/tinjauan-baris'

export {
  BULAN_TINJAUAN, MODUL_TINJAUAN, susunBaris, tinjauanKeAoa,
  type BarisTinjauan, type SumberAkses, type BarisMentah,
} from '@/lib/admin/tinjauan-baris'

/**
 * Semua akun yang belum diarsipkan. SUPER_ADMIN ikut ditampilkan — ia tidak bisa diatur
 * dari layar mana pun, tapi "berapa pemegang kunci induk dan kapan terakhir diperiksa"
 * justru pertanyaan yang paling sering ditanyakan auditor.
 *
 * "Kedaluwarsa" dihitung SQL, bukan dibandingkan dengan jam peramban: dua layar yang
 * membandingkannya sendiri akan berbeda pendapat pada hari salah satunya salah zona
 * waktu, dan penyaring yang meleset satu hari membuat baris yang harus ditinjau
 * menghilang tanpa gejala.
 */
export async function daftarTinjauan(): Promise<BarisTinjauan[]> {
  const rows = await sql`
    SELECT u.id, u.username, u.nama_lengkap, u.role, u.status, u.last_login, u.app_access,
           u.access_reviewed_at, p.username AS peninjau,
           (u.access_reviewed_at IS NULL
            OR u.access_reviewed_at < NOW() - INTERVAL ${sqlInt(BULAN_TINJAUAN)} MONTH) AS kedaluwarsa
    FROM users u
    LEFT JOIN users p ON p.id = u.access_reviewed_by
    WHERE u.deleted_at IS NULL
    ORDER BY u.access_reviewed_at IS NOT NULL, u.access_reviewed_at ASC, u.username ASC
  ` as BarisMentah[]
  return susunBaris(rows)
}

/**
 * Menandai satu orang sudah ditinjau.
 *
 * Stempelnya `NOW()` MySQL, bukan jam yang dikirim klien: tanggal tinjauan itu bukti,
 * dan bukti yang tanggalnya ditentukan pihak yang ditinjau bukan bukti.
 *
 * Memulangkan `false` kalau orangnya tidak ada — pemanggil yang memutuskan itu 404,
 * bukan fungsi ini yang melempar.
 */
export async function tandaiDitinjau(userId: number, olehUserId: number): Promise<boolean> {
  let ada = false
  await withTransaction(async ({ tx }) => {
    const baris = await tx`
      SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1
    ` as { id: number }[]
    if (baris.length === 0) return
    ada = true
    await tx`
      UPDATE users
      SET access_reviewed_at = NOW(), access_reviewed_by = ${olehUserId}, updated_at = NOW()
      WHERE id = ${userId}
    `
  })
  return ada
}

