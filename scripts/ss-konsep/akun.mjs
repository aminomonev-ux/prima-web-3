// scripts/ss-konsep/akun.mjs — akun sementara untuk memotret layar (dihapus sesudahnya)
import fs from 'node:fs'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=')
  if (i < 0 || line.trim().startsWith('#')) continue
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
}

const MODUL = ['dashboard', 'rencana_aksi', 'buku_besar_aset', 'blud', 'perjanjian_kinerja', 'iki', 'lkjip', 'new_econtrolling', 'usulan_aset']
const c = await mysql.createConnection({ host: env.MYSQL_HOST, port: +env.MYSQL_PORT || 3306, user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE })

if (process.argv[2] === 'hapus') {
  const [r] = await c.query("DELETE FROM users WHERE username = 'ss.konsep'")
  console.log('akun dihapus:', r.affectedRows)
} else {
  const sandi = process.env.SS_KONSEP_SANDI
  if (!sandi || sandi.length < 12) { console.error('Setel SS_KONSEP_SANDI (≥ 12 huruf) dulu.'); process.exit(1) }
  const hash = await bcrypt.hash(sandi, 12)
  const [ada] = await c.query("SELECT id FROM users WHERE username = 'ss.konsep'")
  if (ada.length) {
    await c.query("UPDATE users SET password_hash=?, role='SUPER_ADMIN', status='AKTIF', email_verified=1, app_access=?, theme_preference='light', failed_attempts=0, locked_until=NULL WHERE id=?", [hash, JSON.stringify(MODUL), ada[0].id])
    console.log('akun diperbarui id', ada[0].id)
  } else {
    const [r] = await c.query("INSERT INTO users (username,email,password_hash,nama_lengkap,role,status,email_verified,app_access,theme_preference,failed_attempts,promotion_failed_count) VALUES ('ss.konsep','ss.konsep@contoh.local',?,'Akun Tangkapan Layar','SUPER_ADMIN','AKTIF',1,?,'light',0,0)", [hash, JSON.stringify(MODUL)])
    console.log('akun dibuat id', r.insertId)
  }
  const [u] = await c.query("SELECT id,username,role,status,email_verified,app_access,theme_preference FROM users WHERE username='ss.konsep'")
  console.log(JSON.stringify(u[0]))
}
await c.end()
