// Setel sandi acak untuk akun SUPER_ADMIN langsung dari server (bukan lewat layar).
// Jalankan di folder aplikasi: node scripts/setel-sandi-superadmin.mjs [username]   (bawaan: superadmin)
//
// Dipakai saat pemasangan baru — skema tidak lagi membawa sandi bawaan yang tertulis di repo publik —
// dan untuk mengganti sandi yang sudah bocor. Sandinya dibuat acak dan dicetak SEKALI ke terminal ini;
// tidak disimpan di berkas mana pun. Semua sesi akun itu dikeluarkan dan kunci gagal-login dilepas.
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tanpa dotenv (tidak ada di package.json) — urutan menang sama dengan check-schema.mjs.
for (const berkas of ['.env.local', '.env']) {
  const p = join(process.cwd(), berkas)
  if (!existsSync(p)) continue
  for (const baris of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = baris.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const kunci = t.slice(0, i).trim()
    if (process.env[kunci] !== undefined) continue
    process.env[kunci] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}

const username = process.argv[2] ?? 'superadmin'
const sandi = `Pr${randomBytes(12).toString('base64url')}#7`

const c = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost', port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
})
try {
  await c.beginTransaction()
  const [akun] = await c.query("SELECT id FROM users WHERE username = ? AND role = 'SUPER_ADMIN' FOR UPDATE", [username])
  if (akun.length !== 1) {
    console.error(`Akun SUPER_ADMIN "${username}" tidak ditemukan — tidak ada yang diubah.`)
    await c.rollback()
    process.exit(1)
  }
  const id = akun[0].id
  await c.query('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(sandi, 12), id])
  await c.query('UPDATE user_sessions SET invalidated_at = NOW() WHERE user_id = ? AND invalidated_at IS NULL', [id])
  await c.query("INSERT INTO audit_log (user_id, username, event_type, detail, target_user_id) VALUES (NULL, 'server', 'PASSWORD_CHANGE', ?, ?)",
    [`Sandi ${username} disetel ulang lewat scripts/setel-sandi-superadmin.mjs; semua sesinya dikeluarkan`, id])
  await c.commit()
  console.log(`Sandi baru "${username}": ${sandi}`)
  console.log('Catat sekarang — tidak ditampilkan lagi. Sesudah login, ganti lewat Profil kalau ingin sandi sendiri.')
} catch (e) {
  await c.rollback().catch(() => {})
  console.error('GAGAL:', e.code ?? '', e.message)
  process.exitCode = 1
} finally {
  await c.end()
}
