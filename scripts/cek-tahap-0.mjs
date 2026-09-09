#!/usr/bin/env node
// scripts/cek-tahap-0.mjs - Tahap 0 konsep Pusat Akses (docs/CONCEPT-pusat-akses-satu-pintu.md §17.2).
//
// HANYA MEMBACA. Dua SELECT, nol tulis, nol tabel disentuh. Aman dijalankan
// kapan saja, di mesin mana saja yang `.env.local`-nya menunjuk basis data yang
// mau diperiksa - dan yang perlu diperiksa adalah basis data SERVER KANTOR,
// bukan dev lokal: sakelar di dua mesin itu isinya beda.
//
// Kenapa perlu dibaca SEBELUM Tahap 1 (bukan sesudah): A1 memasang pagar pada
// tiga sakelar yang selama ini tidak menutup apa pun. Kalau salah satunya
// tertinggal bernilai 'maintenance' - pernah dicoba lalu dilupakan, dan tak ada
// yang menyadarinya justru karena tidak berefek - modulnya MATI begitu deploy.
//
// USAGE: node scripts/cek-tahap-0.mjs

import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'

// Ketiganya punya sakelar + tombolnya di Admin Panel, tapi belum ada satu pun
// halaman/route yang membacanya (T-1). Tahap 1 membuat mereka menggigit.
const AKAN_MENGGIGIT = {
  app_status_usulan_aset:        'Usulan Kebutuhan',
  app_status_perjanjian_kinerja: 'Perjanjian Kinerja',
  app_status_dashboard:          'Dashboard',
}

function env() {
  const txt = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const out = {}
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const E = env()
const conn = await mysql.createConnection({
  host: E.MYSQL_HOST || 'localhost',
  port: +(E.MYSQL_PORT || 3306),
  user: E.MYSQL_USER,
  password: E.MYSQL_PASSWORD,
  database: E.MYSQL_DATABASE,
  timezone: '+07:00',
})

const jam = (d) => (d ? new Date(d).toISOString().slice(0, 19).replace('T', ' ') : '-')

console.log('')
console.log('PRIMA - Tahap 0 - pemeriksaan sebelum Tahap 1')
console.log(`basis data  : ${E.MYSQL_DATABASE} @ ${E.MYSQL_HOST || 'localhost'}`)
console.log('')

// ── 1. Sakelar ───────────────────────────────────────────────────────────────
const [sakelar] = await conn.query(
  "SELECT `key`, value, updated_at FROM app_config WHERE `key` LIKE 'app_status_%' ORDER BY `key`",
)

console.log('1) SAKELAR PEMELIHARAAN')
if (!sakelar.length) {
  console.log('   (tidak ada satu pun baris - semuanya terbaca "online", itu aman)')
} else {
  for (const r of sakelar) {
    const mati = r.value !== 'online'
    const tanda = mati ? '  !! ' : '    '
    const catatan = AKAN_MENGGIGIT[r.key] ? `  <- Tahap 1 memasang pagarnya (${AKAN_MENGGIGIT[r.key]})` : ''
    console.log(`${tanda}${r.key.padEnd(32)} ${String(r.value).padEnd(13)} ${jam(r.updated_at)}${catatan}`)
  }
}

const ada = new Set(sakelar.map((r) => r.key))
const belumAda = Object.keys(AKAN_MENGGIGIT).filter((k) => !ada.has(k))
if (belumAda.length) {
  // Baris yang tidak ada dibaca 'online' oleh app-status/route.ts - bukan masalah.
  console.log(`    (belum punya baris, jadi terbaca online: ${belumAda.join(', ')})`)
}

const bahaya = sakelar.filter((r) => AKAN_MENGGIGIT[r.key] && r.value !== 'online')
console.log('')

// ── 2. Akun yang bergantung pada app_access ──────────────────────────────────
const [akun] = await conn.query(
  `SELECT username, role, status, app_access
     FROM users
    WHERE app_access IS NOT NULL
    ORDER BY status, role, username`,
)

console.log(`2) AKUN DENGAN app_access - ${akun.length} akun`)
if (!akun.length) {
  console.log('   (tidak ada - semua akses lahir dari peran saja)')
} else {
  for (const u of akun) {
    const daftar = Array.isArray(u.app_access) ? u.app_access : JSON.parse(u.app_access || '[]')
    console.log(`    ${String(u.username).padEnd(20)} ${String(u.role).padEnd(24)} ${String(u.status).padEnd(9)} ${daftar.join(', ') || '(kosong)'}`)
  }
  const aktif = akun.filter((u) => u.status === 'AKTIF').length
  console.log(`    -> ${aktif} aktif dari ${akun.length}. Segini yang benar-benar akan terasa kalau Pusat Akses salah menghitung.`)
}

// ── 3. Putusan ───────────────────────────────────────────────────────────────
console.log('')
console.log('PUTUSAN')
if (bahaya.length) {
  console.log('  !! TAHAN. Sakelar berikut sedang TIDAK online, dan Tahap 1 akan membuatnya menggigit:')
  for (const r of bahaya) console.log(`      ${r.key} = ${r.value}  (${AKAN_MENGGIGIT[r.key]})`)
  console.log('    Nyalakan dulu lewat Admin Panel -> App Status, atau pastikan memang sengaja dimatikan.')
} else {
  console.log('  OK  Aman untuk Tahap 1 - ketiga sakelar yang akan dipasangi pagar bernilai online.')
}
console.log('')

await conn.end()
