// scripts/_kompilasi-izin.mjs — daftar berkas + langkah kompilasi bersama untuk
// `test-menu-access.mjs` dan `bench-menu-access.mjs`.
//
// Dulu kedua harness memelihara daftarnya sendiri: uji mengompilasi 2 berkas, bench 6.
// Menambah modul berarti harus ingat menyentuh KEDUANYA — dan itu sudah pernah meleset
// waktu PK masuk (uji lulus, bench gagal). Sekarang daftarnya satu.
//
// **Modul baru = tambah satu baris di `BERKAS_PERAN`.** Tidak ada tempat kedua.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** Tabel peran tiap modul. Modul daun — aman dikompilasi sendirian. */
export const BERKAS_PERAN = [
  'lib/blud/peran.ts',
  'lib/pk/peran.ts',
]

/** Mesin resolusi izin: dipakai bench, tidak dipakai uji tabel murni. */
export const BERKAS_MESIN = [
  'lib/data/menu-access.ts',
  'lib/data/db.ts',
  'lib/registry/menu-apps.ts',
  'lib/data/locks.ts',
]

/**
 * Kompilasi ke CommonJS supaya bisa di-`require` dari skrip .mjs.
 *
 * `--rootDir` WAJIB: dua modul sama-sama punya berkas bernama `peran.ts`, dan tanpa itu
 * keduanya menulis ke `outDir/peran.js` — yang belakangan menimpa yang duluan, dan uji
 * BLUD diam-diam menguji tabel PK. Struktur foldernya harus ikut terbawa.
 *
 * `abaikanGagal` dipakai bench: impor `@/...` tidak ter-resolve saat compile, tapi
 * berkas .js tetap ditulis dan jalur `@/` dibelokkan saat runtime.
 */
export function kompilasi(repo, outDir, berkas, { abaikanGagal = false } = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  const daftar = berkas.map((b) => `"${path.join(repo, b)}"`).join(' ')
  const perintah =
    `npx tsc ${daftar} --outDir "${outDir}" --rootDir "${repo}"`
    + ' --module commonjs --target es2020 --esModuleInterop --skipLibCheck'
    + (abaikanGagal ? ' --moduleResolution node' : '')
  try {
    execSync(perintah, { cwd: repo, stdio: 'pipe' })
  } catch (e) {
    if (!abaikanGagal) throw e
  }
}
