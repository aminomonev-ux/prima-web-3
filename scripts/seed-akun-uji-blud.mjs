// Akun uji untuk menengok jalur LIHAT modul BLUD dengan mata sendiri.
//   node scripts/seed-akun-uji-blud.mjs                 → buat / setel ulang
//   node scripts/seed-akun-uji-blud.mjs --sandi=...     → tentukan sandinya sendiri
//   node scripts/seed-akun-uji-blud.mjs --hapus         → buang lagi
//
// Kenapa lewat skrip, bukan lewat Admin Panel: tiga peran ini semuanya sub-bidang
// atau bidang, dan mendaftarkannya lewat UI berarti melewati verifikasi email +
// persetujuan admin satu per satu. Yang diuji bukan alur pendaftarannya.
//
// Tidak ada sandi tertulis di berkas ini — kalau tidak diberikan, satu sandi acak
// dibuatkan lalu DICETAK sekali. Repo ini publik; menaruh sandi tetap di sini
// berarti menerbitkannya, dan gate Gitleaks di CI memang berhak menolaknya.
//
// PERINGATAN: ini akun mainan untuk basis data pengembangan. JANGAN jalankan pada
// basis data produksi. Kalau sudah selesai menengok, jalankan lagi dengan --hapus.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

const mysql  = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const diberikan = process.argv.find((a) => a.startsWith('--sandi='))?.slice(8)
// Aturan sandi aplikasi minta huruf besar/kecil, angka, dan simbol — imbuhan
// tetap di belakang menjamin itu terpenuhi tanpa perlu mengulang validatornya.
const SANDI = diberikan || `Uji${crypto.randomBytes(6).toString('base64url')}@1a`

// Ketiganya butuh grant `app_access: ['blud']` — tidak satu pun ada di
// BLUD_ALLOWED_ROLES (lib/blud/schemas.ts), jadi tanpa grant mereka tertahan di
// layout modul dan jalur LIHAT tetap tak terlihat. Itu justru yang mau dilihat:
// orang yang BOLEH masuk modul tapi TIDAK boleh mengubah isinya.
const AKUN = [
  { username: 'uji.program',        role: 'PROGRAM',        nama: 'Uji — Program (perencana)' },
  { username: 'uji.keuangan',       role: 'KEUANGAN',       nama: 'Uji — Keuangan (kabid)' },
  { username: 'uji.perbendaharaan', role: 'PERBENDAHARAAN', nama: 'Uji — Perbendaharaan (bendahara)' },
]

const ROLE_QUOTA = 3 // lib/constants.ts — berlaku untuk BIDANG_ROLES, KEUANGAN salah satunya

const conn = await mysql.createConnection({
  host:     process.env.MYSQL_HOST ?? 'localhost',
  port:     parseInt(process.env.MYSQL_PORT ?? '3306'),
  user:     process.env.MYSQL_USER ?? '',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? '',
})

try {
  if (process.argv.includes('--hapus')) {
    const [r] = await conn.query(
      `DELETE FROM users WHERE username IN (?)`,
      [AKUN.map((a) => a.username)],
    )
    console.log(`${r.affectedRows} akun uji dibuang.`)
  } else {
    // Kuota peran ditegakkan real-time oleh aplikasi (COUNT status AKTIF), bukan
    // oleh kolom penghitung — menyuntik langsung ke tabel memang melewatinya.
    // Jadi diperiksa di sini, kalau tidak akun uji bisa menghabiskan jatah orang.
    for (const { role } of AKUN) {
      const [[{ n }]] = await conn.query(
        `SELECT COUNT(*) AS n FROM users WHERE role = ? AND status = 'AKTIF'
           AND username NOT IN (?) AND deleted_at IS NULL`,
        [role, AKUN.map((a) => a.username)],
      )
      if (role === 'KEUANGAN' && n >= ROLE_QUOTA) {
        console.error(`Batal: kuota ${role} sudah penuh (${n}/${ROLE_QUOTA}) di luar akun uji.`)
        process.exit(1)
      }
    }

    const hash = await bcrypt.hash(SANDI, 12)
    for (const { username, role, nama } of AKUN) {
      await conn.query(
        `INSERT INTO users (username, email, password_hash, nama_lengkap, role, status,
                            email_verified, app_access)
         VALUES (?, ?, ?, ?, ?, 'AKTIF', 1, ?)
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash), nama_lengkap = VALUES(nama_lengkap),
           role = VALUES(role), status = 'AKTIF', email_verified = 1,
           app_access = VALUES(app_access), failed_attempts = 0, locked_until = NULL,
           deleted_at = NULL`,
        [username, `${username}@uji.local`, hash, nama, role, JSON.stringify(['blud'])],
      )
      console.log(`  siap  ${username.padEnd(20)} ${role}`)
    }
    console.log(`\nSandi ketiganya: ${SANDI}`)
    console.log('Selesai menengok? node scripts/seed-akun-uji-blud.mjs --hapus')
  }
} finally {
  await conn.end()
}
