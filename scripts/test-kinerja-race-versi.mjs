#!/usr/bin/env node
// scripts/test-kinerja-race-versi.mjs — race "Buat Perubahan" x "Simpan SSK".
//
// Temuan A6. Diuji di lapisan DB, deterministik, karena yang diuji justru
// INTERLEAVING-nya: kedua transaksi harus dijeda tepat di selanya. Urutan
// query-nya cermin app/api/kinerja/ssk/perubahan/route.ts + saveSskBatch di
// lib/data/kinerja.ts. Pola: scripts/test-blud-race-hapus-versi.mjs.
//
// TIGA balapan, tiga kerusakan yang berbeda:
//
//   1A  Buat Perubahan menyalin baris yang dibaca SEBELUM transaksinya dibuka.
//       Simpan itu DELETE-lalu-tulis-ulang, jadi baris sumbernya lahir kembali
//       dengan id BARU dan `parent_versi_id` yang sudah dipegang menunjuk baris
//       yang tidak ada lagi -> ER_NO_REFERENCED_ROW_2, seluruh permintaan gagal
//       500 tanpa sebab yang bisa dibaca siapa pun.
//   1B  Urutan sebaliknya, dan yang ini SENYAP: pagar "versi sudah dikunci" di
//       `saveSskBatch` dulu dibaca di luar transaksinya, jadi Simpan yang
//       berangkat sebelum penguncian ikut lolos sesudahnya — dan karena ia
//       menulis ulang barisnya, MURNI-0 lahir kembali TANPA locked_at. Versi
//       yang sudah punya turunan diam-diam terbuka lagi untuk disunting.
//   2   Dua Buat Perubahan berbarengan sama-sama menjawab "berikutnya
//       PERUBAHAN-1". Yang menjaganya cuma `uq_ks_canonical_versi` — dan indeks
//       itu TIDAK ADA di basis data pengembangan saat balapan ini pertama
//       dijalankan, jadi keduanya lahir. Karena itu keberadaannya ikut diperiksa
//       di sini, bukan diandaikan.
//
// AMAN: hanya menyentuh tahun anggaran 2040 + baris lock ber-entity kinerja_*.
// Dibersihkan di awal DAN di akhir.
//
// USAGE: node scripts/test-kinerja-race-versi.mjs

import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'

const TAHUN  = '2040'
const SUMBER = 'GAJI'
const CID    = 'UJI-RACE-1'
const PAGU_AWAL = 7_000_000_000
const PAGU_BARU = 9_000_000_000
const BULAN = { jan:0,feb:0,mar:0,apr:0,mei:0,jun:0,jul:0,agu:0,sep:0,okt:0,nov:0,des:0 }

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
const cfg = {
  host: E.MYSQL_HOST || 'localhost', port: +(E.MYSQL_PORT || 3306),
  user: E.MYSQL_USER, password: E.MYSQL_PASSWORD, database: E.MYSQL_DATABASE,
  timezone: '+07:00', multipleStatements: false,
}

let lulus = 0, gagal = 0
function cek(nama, syarat, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
const tidur = (ms) => new Promise(r => setTimeout(r, ms))

async function bersih(c) {
  await c.query('UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM kinerja_ssk WHERE tahun = ?', [TAHUN])
  await c.query('DELETE FROM blud_locks WHERE entity LIKE ? AND key_id LIKE ?', ['kinerja%', `${TAHUN}:%`])
}

async function siapkan(c, pagu = PAGU_AWAL) {
  await bersih(c)
  await c.query(
    `INSERT INTO kinerja_ssk
       (tahun, sumber, versi_tipe, versi_seq, canonical_id, uraian_ssk, uraian,
        pagu, months, months_pct, total, total_pct, urut)
     VALUES (?, ?, 'MURNI', 0, ?, 'UJI SSK', 'UJI ITEM RACE', ?, ?, ?, 0, 0, 1)`,
    [TAHUN, SUMBER, CID, pagu, JSON.stringify(BULAN), JSON.stringify(BULAN)])
}

// -- Cermin kode produksi ----------------------------------------------------

/** `kunciVersiSsk(tx, tahun, sumber)` = acquireBludLock(KINERJA_VERSI_ENTITY). */
async function kunciVersiSsk(c) {
  await c.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)',
    ['kinerja_versi_ssk', `${TAHUN}:${SUMBER}`])
  await c.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE',
    ['kinerja_versi_ssk', `${TAHUN}:${SUMBER}`])
}

async function bacaMax(c) {
  const [r] = await c.query(
    `SELECT COALESCE(MAX(versi_seq), 0) AS max_seq FROM kinerja_ssk
      WHERE tahun = ? AND sumber = ? AND versi_tipe = 'PERUBAHAN'`, [TAHUN, SUMBER])
  return Number(r[0]?.max_seq ?? 0) + 1
}

async function bacaSumber(c, kunciBaris) {
  const [r] = await c.query(
    `SELECT id, canonical_id, uraian_ssk, uraian, pagu, months, months_pct, total, total_pct, urut, is_nullified
       FROM kinerja_ssk
      WHERE tahun = ? AND sumber = ? AND versi_tipe = 'MURNI' AND versi_seq = 0
      ${kunciBaris ? 'FOR UPDATE' : ''}`, [TAHUN, SUMBER])
  return r
}

async function tulisPerubahan(c, seq, sumberRows) {
  await c.query(
    `UPDATE kinerja_ssk SET locked_at = NOW()
      WHERE tahun = ? AND sumber = ? AND versi_tipe = 'MURNI' AND versi_seq = 0 AND locked_at IS NULL`,
    [TAHUN, SUMBER])
  for (const r of sumberRows) {
    await c.query(
      `INSERT INTO kinerja_ssk
         (tahun, sumber, versi_tipe, versi_seq, canonical_id, parent_versi_id, is_nullified,
          uraian_ssk, uraian, pagu, months, months_pct, total, total_pct, urut)
       VALUES (?, ?, 'PERUBAHAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [TAHUN, SUMBER, seq, String(r.canonical_id ?? ''), Number(r.id), Number(r.is_nullified ?? 0) ? 1 : 0,
       String(r.uraian_ssk ?? ''), String(r.uraian ?? ''), Number(r.pagu ?? 0),
       typeof r.months === 'string' ? r.months : JSON.stringify(r.months ?? {}),
       typeof r.months_pct === 'string' ? r.months_pct : JSON.stringify(r.months_pct ?? {}),
       Number(r.total ?? 0), Number(r.total_pct ?? 0), Number(r.urut ?? 0)])
  }
}

/** Pagar locked_at milik `saveSskBatch`. `diDalam` = sesudah perbaikan. */
async function pagarKunci(c, diDalam) {
  const [g] = await c.query(
    `SELECT COUNT(*) AS n, MAX(locked_at) AS locked_at FROM kinerja_ssk
      WHERE tahun = ? AND sumber = ? AND versi_tipe = 'MURNI' AND versi_seq = 0
      ${diDalam ? 'FOR UPDATE' : ''}`, [TAHUN, SUMBER])
  return g[0]?.locked_at ? 'Versi MURNI-0 sudah dikunci, tidak bisa diubah.' : null
}

async function tulisSsk(c, pagu) {
  await c.query(
    `DELETE FROM kinerja_ssk WHERE tahun = ? AND sumber = ? AND versi_tipe = 'MURNI' AND versi_seq = 0`,
    [TAHUN, SUMBER])
  await c.query(
    `INSERT INTO kinerja_ssk
       (tahun, sumber, versi_tipe, versi_seq, canonical_id, uraian_ssk, uraian,
        pagu, months, months_pct, total, total_pct, urut)
     VALUES (?, ?, 'MURNI', 0, ?, 'UJI SSK', 'UJI ITEM RACE', ?, ?, ?, 0, 0, 1)`,
    [TAHUN, SUMBER, CID, pagu, JSON.stringify(BULAN), JSON.stringify(BULAN)])
}

async function keadaan(c) {
  const [r] = await c.query(
    `SELECT versi_tipe, versi_seq, pagu, locked_at FROM kinerja_ssk
      WHERE tahun = ? AND sumber = ? ORDER BY versi_seq, versi_tipe`, [TAHUN, SUMBER])
  return r.map(x => ({
    versi: `${x.versi_tipe}-${x.versi_seq}`, pagu: Number(x.pagu), terkunci: !!x.locked_at,
  }))
}

async function duaKoneksi() {
  const c1 = await mysql.createConnection(cfg)
  const c2 = await mysql.createConnection(cfg)
  await c1.query('SET SESSION innodb_lock_wait_timeout = 10')
  await c2.query('SET SESSION innodb_lock_wait_timeout = 10')
  return [c1, c2]
}

/** Bagian "Buat Perubahan" sampai sebelum menulis. */
async function siapPerubahan(c, pakaiPerbaikan) {
  if (pakaiPerbaikan) {
    await c.beginTransaction()
    await kunciVersiSsk(c)                    // L84: perintah PERTAMA
    return { seq: await bacaMax(c), rows: await bacaSumber(c, true) }   // FOR UPDATE
  }
  const seq = await bacaMax(c)                // di LUAR transaksi
  const rows = await bacaSumber(c, false)
  await c.beginTransaction()
  return { seq, rows }
}

// -- Balapan 1A: Simpan menyelinap SEBELUM Perubahan menulis ------------------
async function balapan1a(pakaiPerbaikan) {
  const boot = await mysql.createConnection(cfg); await siapkan(boot); await boot.end()
  const [c1, c2] = await duaKoneksi()
  const hasil = { galatT1: null, tolakT2: null }
  try {
    const { seq, rows } = await siapPerubahan(c1, pakaiPerbaikan)
    const p2 = (async () => {
      await c2.beginTransaction()
      const alasan = await pagarKunci(c2, pakaiPerbaikan)
      if (alasan) { await c2.rollback(); return alasan }
      await tulisSsk(c2, PAGU_BARU)
      await c2.commit(); return null
    })()
    await tidur(500)
    try {
      await tulisPerubahan(c1, seq, rows)
      await c1.commit()
    } catch (e) { hasil.galatT1 = e.code || e.message; await c1.rollback().catch(() => {}) }
    hasil.tolakT2 = await p2
  } finally { await c1.end().catch(() => {}); await c2.end().catch(() => {}) }
  const c = await mysql.createConnection(cfg); hasil.akhir = await keadaan(c); await c.end()
  return hasil
}

// -- Balapan 1B: Simpan membaca pagarnya SEBELUM penguncian, menulis SESUDAH --
async function balapan1b(pakaiPerbaikan) {
  const boot = await mysql.createConnection(cfg); await siapkan(boot); await boot.end()
  const [c1, c2] = await duaKoneksi()
  const hasil = { tolakT2: null }
  try {
    // T2 membaca pagarnya lebih dulu. Sebelum perbaikan itu terjadi di LUAR
    // transaksi — itulah seluruh bedanya.
    let alasan = null
    if (!pakaiPerbaikan) alasan = await pagarKunci(c2, false)

    const { seq, rows } = await siapPerubahan(c1, pakaiPerbaikan)
    await tulisPerubahan(c1, seq, rows)
    await c1.commit()

    await c2.beginTransaction()
    if (pakaiPerbaikan) alasan = await pagarKunci(c2, true)
    if (alasan) { await c2.rollback() } else { await tulisSsk(c2, PAGU_BARU); await c2.commit() }
    hasil.tolakT2 = alasan
  } finally { await c1.end().catch(() => {}); await c2.end().catch(() => {}) }
  const c = await mysql.createConnection(cfg); hasil.akhir = await keadaan(c); await c.end()
  return hasil
}

// -- Balapan 2: dua Buat Perubahan berbarengan -------------------------------
async function balapan2(pakaiPerbaikan) {
  const boot = await mysql.createConnection(cfg); await siapkan(boot); await boot.end()
  const [c1, c2] = await duaKoneksi()
  const jalan = async (c, jeda) => {
    try {
      const { seq, rows } = await siapPerubahan(c, pakaiPerbaikan)
      if (jeda) await tidur(jeda)
      await tulisPerubahan(c, seq, rows)
      await c.commit()
      return null
    } catch (e) { await c.rollback().catch(() => {}); return e.code || e.message }
  }
  const [g1, g2] = await Promise.all([jalan(c1, 400), jalan(c2, 0)])
  await c1.end().catch(() => {}); await c2.end().catch(() => {})
  const c = await mysql.createConnection(cfg); const akhir = await keadaan(c); await c.end()
  return { galat1: g1, galat2: g2, akhir }
}

// -- Jalan -------------------------------------------------------------------
console.log('\n== 0. Penjaga di lapisan basis data =============================\n')
{
  const c = await mysql.createConnection(cfg)
  const [idx] = await c.query("SHOW INDEX FROM kinerja_ssk WHERE Key_name = 'uq_ks_canonical_versi'")
  await c.end()
  // Diperiksa, bukan diandaikan: indeks ini ADA di migration-022 tapi TIDAK di
  // docs/schema-mysql.sql, dan memang tidak terpasang di basis data pengembangan.
  cek('0a uq_ks_canonical_versi terpasang', idx.length === 5,
      idx.length === 5 ? '5 kolom'
        : `${idx.length} kolom — jalankan docs/migrations/migration-kinerja-uq-versi.sql`)
  cek('0b dan ia UNIQUE, bukan indeks biasa', idx.every(i => i.Non_unique === 0))
}

console.log('\n== 1A. Simpan menyelinap sebelum Perubahan menulis ==============\n')

const a0 = await balapan1a(false)
console.log('  TANPA perbaikan:', JSON.stringify(a0.akhir), `| T1: ${a0.galatT1} | T2: ${a0.tolakT2 ?? 'lolos'}`)
cek('1A-a Buat Perubahan gagal: induknya sudah lenyap',
    a0.galatT1 === 'ER_NO_REFERENCED_ROW_2', String(a0.galatT1))
cek('1A-a tidak ada PERUBAHAN yang lahir',
    a0.akhir.filter(x => x.versi.startsWith('PERUBAHAN')).length === 0)

const a1 = await balapan1a(true)
console.log('  DENGAN perbaikan:', JSON.stringify(a1.akhir), `| T1: ${a1.galatT1} | T2: ${a1.tolakT2 ?? 'lolos'}`)
const mA = a1.akhir.find(x => x.versi === 'MURNI-0')
const pA = a1.akhir.find(x => x.versi === 'PERUBAHAN-1')
cek('1A-b Buat Perubahan berhasil', a1.galatT1 === null, String(a1.galatT1))
cek('1A-b salinannya sama dengan sumbernya', mA?.pagu === pA?.pagu, `${mA?.pagu} vs ${pA?.pagu}`)
cek('1A-b Simpan ditolak dengan sebab yang terbaca',
    typeof a1.tolakT2 === 'string' && a1.tolakT2.includes('sudah dikunci'), String(a1.tolakT2))

console.log('\n== 1B. Simpan membaca pagarnya sebelum penguncian ===============\n')

const b0 = await balapan1b(false)
console.log('  TANPA perbaikan:', JSON.stringify(b0.akhir), `| T2: ${b0.tolakT2 ?? 'lolos'}`)
const mB0 = b0.akhir.find(x => x.versi === 'MURNI-0')
cek('1B-a Simpan lolos padahal versinya sudah dikunci', b0.tolakT2 === null, String(b0.tolakT2))
cek('1B-a MURNI-0 terbuka lagi diam-diam', mB0?.terkunci === false, `terkunci=${mB0?.terkunci}`)
cek('1B-a dan isinya berubah di bawah turunannya', mB0?.pagu === PAGU_BARU, `dapat ${mB0?.pagu}`)
cek('1B-a punya turunan tapi tetap terbuka',
    b0.akhir.filter(x => x.versi.startsWith('PERUBAHAN')).length === 1)

const b1 = await balapan1b(true)
console.log('  DENGAN perbaikan:', JSON.stringify(b1.akhir), `| T2: ${b1.tolakT2 ?? 'lolos'}`)
const mB1 = b1.akhir.find(x => x.versi === 'MURNI-0')
cek('1B-b Simpan ditolak', typeof b1.tolakT2 === 'string' && b1.tolakT2.includes('sudah dikunci'), String(b1.tolakT2))
cek('1B-b MURNI-0 tetap terkunci', mB1?.terkunci === true)
cek('1B-b dan isinya tidak bergeser', mB1?.pagu === PAGU_AWAL, `dapat ${mB1?.pagu}`)

console.log('\n== 2. Dua Buat Perubahan berbarengan ============================\n')

const c0 = await balapan2(false)
console.log('  TANPA perbaikan:', JSON.stringify(c0.akhir), `| galat: ${c0.galat1} / ${c0.galat2}`)
cek('2a satu permintaan ditolak ER_DUP_ENTRY mentah',
    [c0.galat1, c0.galat2].filter(g => g === 'ER_DUP_ENTRY').length === 1, `${c0.galat1} / ${c0.galat2}`)
cek('2a hanya satu PERUBAHAN yang lahir',
    c0.akhir.filter(x => x.versi.startsWith('PERUBAHAN')).length === 1,
    JSON.stringify(c0.akhir.map(x => x.versi)))

const c1x = await balapan2(true)
console.log('  DENGAN perbaikan:', JSON.stringify(c1x.akhir), `| galat: ${c1x.galat1} / ${c1x.galat2}`)
cek('2b tidak ada ER_DUP_ENTRY sama sekali',
    c1x.galat1 !== 'ER_DUP_ENTRY' && c1x.galat2 !== 'ER_DUP_ENTRY', `${c1x.galat1} / ${c1x.galat2}`)
cek('2b keduanya berhasil', c1x.galat1 === null && c1x.galat2 === null, `${c1x.galat1} / ${c1x.galat2}`)
cek('2b nomornya urut: PERUBAHAN-1 dan PERUBAHAN-2',
    JSON.stringify(c1x.akhir.filter(x => x.versi.startsWith('PERUBAHAN')).map(x => x.versi).sort())
      === JSON.stringify(['PERUBAHAN-1','PERUBAHAN-2']),
    JSON.stringify(c1x.akhir.map(x => x.versi)))

const con = await mysql.createConnection(cfg)
await bersih(con)
const [sisa] = await con.query('SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ?', [TAHUN])
cek('bersih: nol sisa di tahun uji', Number(sisa[0].n) === 0, `sisa ${sisa[0].n}`)
await con.end()

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
