#!/usr/bin/env node
// scripts/test-blud-race-hapus-versi.mjs — race hapus-versi × sumber pagu.
//
// Membuktikan DUA hal dalam satu jalan, di lapisan DB, deterministik:
//
//   TANPA kunci setahun  → dua penghapusan berbeda di tahun yang sama saling
//                          melewatkan pemeriksaan, dan pagu mendarat DI BAWAH
//                          realisasi yang sudah tercatat.
//   DENGAN kunci setahun → yang kedua menunggu, membaca keadaan yang sudah
//                          final, lalu MENOLAK penghapusannya.
//
// Urutan query-nya cermin `pagarHapusVersi`/`paguPenerus` di lib/blud/data.ts —
// pola yang sama dengan scripts/concurrency-test.js. Menguji lewat lapisan DB,
// bukan lewat fungsinya, karena yang diuji justru INTERLEAVING-nya: dua transaksi
// harus dijeda tepat di sela pemeriksaan dan DELETE-nya.
//
// AMAN: hanya menyentuh tahun anggaran 2099 + entity lock ber-prefix __race_.
// Dibersihkan di awal DAN di akhir.
//
// USAGE: node scripts/test-blud-race-hapus-versi.mjs

import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'

const TAHUN = 2099
const KEY   = '__race_key_A'
const V_JAN = '2099-01-31'
const V_JUN = '2099-06-30'
const V_DES = '2099-12-31'
const PAGU_JAN = 1_000_000
const PAGU_LAIN = 5_000_000
const TERSERAP = 3_000_000

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
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(56)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(56)} ${catatan}`) }
}

const tidur = (ms) => new Promise(r => setTimeout(r, ms))

async function bersih(c) {
  await c.query('DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ?', [TAHUN]) // alokasi CASCADE
  await c.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
  await c.query('DELETE FROM dpa_blud WHERE tahun_anggaran = ?', [TAHUN])
  await c.query("DELETE FROM blud_locks WHERE key_id LIKE ? OR key_id LIKE ?", [`${TAHUN}:%`, `${TAHUN}`])
}

async function siapkan(c) {
  await bersih(c)
  await c.query(
    `INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, kode_rekening, uraian, jumlah, tipe_baris, row_id, anggaran_key, urutan)
     VALUES (?, ?, '5.1.99', 'Uji balapan', ?, 'CHILD', 'race_row_1', ?, 1)`,
    [TAHUN, V_JAN, PAGU_JAN, KEY])
  for (const [v, pagu] of [[V_JAN, PAGU_JAN], [V_JUN, PAGU_LAIN], [V_DES, PAGU_LAIN]]) {
    await c.query(
      `INSERT INTO pergeseran_dpa
         (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian,
          jumlah, pergeseran, tipe_baris, row_id, anggaran_key, urutan)
       VALUES (?, ?, ?, '5.1.99', 'Uji balapan', ?, ?, 'CHILD', 'race_row_1', ?, 1)`,
      [TAHUN, v, V_JAN, pagu, pagu, KEY])
  }
  const [tx] = await c.query(
    `INSERT INTO blud_realisasi_tx (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_keluar)
     VALUES (?, 3, '2099-03-10', 'BELANJA', 'Uji balapan', ?)`, [TAHUN, TERSERAP])
  await c.query(
    `INSERT INTO blud_realisasi_alokasi (tx_id, tahun_anggaran, anggaran_key, nilai) VALUES (?, ?, ?, ?)`,
    [tx.insertId, TAHUN, KEY, TERSERAP])
}

// ── Cermin lib/blud/data.ts ──────────────────────────────────────────────────

/** `acquireBludLock(tx, BLUD_VERSI_ENTITY, bludTahunKey(tahun))`. */
async function kunciVersiTahun(c) {
  await c.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)',
    ['blud_versi_tahun', String(TAHUN)])
  await c.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE',
    ['blud_versi_tahun', String(TAHUN)])
}

const toStr = v => (v instanceof Date
  ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  : String(v).slice(0, 10))

/**
 * `pagarHapusVersi` + `paguPenerus` untuk pergeseran_dpa. Memulangkan alasan
 * penolakan, atau null kalau boleh lanjut.
 */
async function pagarHapus(c, versi) {
  const [mx] = await c.query('SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
  const max = mx[0]?.v ? toStr(mx[0].v) : null
  if (max !== versi) return null                      // bukan sumber pagu → lewat

  const [pv] = await c.query(
    'SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ? AND versi_tanggal < ?', [TAHUN, versi])
  const penerus = pv[0]?.v ? toStr(pv[0].v) : null

  let pagu = 0
  if (penerus) {
    const [rows] = await c.query(
      'SELECT pergeseran AS p FROM pergeseran_dpa WHERE tahun_anggaran = ? AND versi_tanggal = ? AND anggaran_key = ?',
      [TAHUN, penerus, KEY])
    pagu = Number(rows[0]?.p ?? 0)
  } else {
    const [rows] = await c.query(
      `SELECT jumlah AS p FROM dpa_blud WHERE tahun_anggaran = ? AND anggaran_key = ?
        AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ?)`,
      [TAHUN, KEY, TAHUN])
    pagu = Number(rows[0]?.p ?? 0)
  }

  await c.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)',
    ['realisasi_pagu', `${TAHUN}:${KEY}`])
  await c.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE',
    ['realisasi_pagu', `${TAHUN}:${KEY}`])

  const [sum] = await c.query(
    'SELECT COALESCE(SUM(nilai),0) AS n FROM blud_realisasi_alokasi WHERE tahun_anggaran = ? AND anggaran_key = ? FOR UPDATE',
    [TAHUN, KEY])
  const terserap = Number(sum[0]?.n ?? 0)
  if (terserap > 0 && pagu < terserap) {
    return `pagu penerus ${pagu.toLocaleString('id-ID')} < terserap ${terserap.toLocaleString('id-ID')}`
  }
  return null
}

/**
 * Satu putaran balapan. `pakaiKunci` = perilaku SESUDAH perbaikan.
 * T1 menghapus versi TERBARU (Des), T2 versi TENGAH (Jun) — dijeda tepat di sela
 * pemeriksaan dan DELETE milik T1.
 */
async function balapan(pakaiKunci) {
  const bootstrap = await mysql.createConnection(cfg)
  await siapkan(bootstrap)
  await bootstrap.end()

  const c1 = await mysql.createConnection(cfg)
  const c2 = await mysql.createConnection(cfg)
  await c1.query('SET SESSION innodb_lock_wait_timeout = 10')
  await c2.query('SET SESSION innodb_lock_wait_timeout = 10')
  await c1.beginTransaction()
  await c2.beginTransaction()

  const hasil = { t1: null, t2: null }
  try {
    // T1 — sampai sebelum DELETE, lalu ditahan.
    if (pakaiKunci) await kunciVersiTahun(c1)
    hasil.t1 = await pagarHapus(c1, V_DES)

    // T2 — berangkat mumpung T1 belum commit.
    const p2 = (async () => {
      if (pakaiKunci) await kunciVersiTahun(c2)      // ← di sini ia menunggu
      const alasan = await pagarHapus(c2, V_JUN)
      if (alasan) { await c2.rollback(); return alasan }
      await c2.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ? AND versi_tanggal = ?', [TAHUN, V_JUN])
      await c2.commit()
      return null
    })()

    await tidur(400)                                  // beri T2 kesempatan menyusul
    if (!hasil.t1) {
      await c1.query('DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ? AND versi_tanggal = ?', [TAHUN, V_DES])
      await c1.commit()
    } else { await c1.rollback() }
    hasil.t2 = await p2
  } finally {
    await c1.end().catch(() => {})
    await c2.end().catch(() => {})
  }

  const c = await mysql.createConnection(cfg)
  const [mx] = await c.query('SELECT MAX(versi_tanggal) AS v FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
  const versiAkhir = mx[0]?.v ? toStr(mx[0].v) : null
  const [pg] = await c.query(
    'SELECT pergeseran AS p FROM pergeseran_dpa WHERE tahun_anggaran = ? AND versi_tanggal = ? AND anggaran_key = ?',
    [TAHUN, versiAkhir, KEY])
  const [dp] = await c.query(
    `SELECT jumlah AS p FROM dpa_blud WHERE tahun_anggaran = ? AND anggaran_key = ?
      AND versi_tanggal = (SELECT MAX(versi_tanggal) FROM dpa_blud WHERE tahun_anggaran = ?)`,
    [TAHUN, KEY, TAHUN])
  await c.end()

  return {
    ...hasil,
    versiAkhir,
    paguAkhir: versiAkhir ? Number(pg[0]?.p ?? 0) : Number(dp[0]?.p ?? 0),
  }
}

// ─────────────────────────────────────────────────────────────────────────────

console.log(`\nRace hapus-versi × sumber pagu — tahun uji ${TAHUN}, terserap Rp ${TERSERAP.toLocaleString('id-ID')}\n`)

console.log('── A. TANPA kunci setahun (perilaku sebelum perbaikan) ──')
const a = await balapan(false)
console.log(`   T1 hapus ${V_DES}: ${a.t1 ?? 'lolos pemeriksaan'}`)
console.log(`   T2 hapus ${V_JUN}: ${a.t2 ?? 'lolos pemeriksaan'}`)
console.log(`   sumber pagu akhir: ${a.versiAkhir ?? '(DPA)'} → Rp ${a.paguAkhir.toLocaleString('id-ID')}`)
cek('Lubangnya nyata: keduanya lolos', a.t1 === null && a.t2 === null,
  'masing-masing menjawab "bukan saya sumber pagunya"')
cek('…dan pagu jatuh DI BAWAH realisasi', a.paguAkhir < TERSERAP,
  `Rp ${a.paguAkhir.toLocaleString('id-ID')} < Rp ${TERSERAP.toLocaleString('id-ID')}`)

console.log('\n── B. DENGAN kunci setahun (perilaku sesudah perbaikan) ──')
const b = await balapan(true)
console.log(`   T1 hapus ${V_DES}: ${b.t1 ?? 'lolos pemeriksaan'}`)
console.log(`   T2 hapus ${V_JUN}: ${b.t2 ?? 'lolos pemeriksaan'}`)
console.log(`   sumber pagu akhir: ${b.versiAkhir ?? '(DPA)'} → Rp ${b.paguAkhir.toLocaleString('id-ID')}`)
cek('T1 (versi terbaru) tetap boleh — penerusnya masih menutupi', b.t1 === null)
cek('T2 ditolak sesudah menunggu', typeof b.t2 === 'string',
  b.t2 ?? '(tidak ditolak)')
cek('Pagu akhir tidak pernah di bawah realisasi', b.paguAkhir >= TERSERAP,
  `Rp ${b.paguAkhir.toLocaleString('id-ID')} ≥ Rp ${TERSERAP.toLocaleString('id-ID')}`)

// Kunci setahun tidak boleh mengunci tahun LAIN.
console.log('\n── C. Kuncinya berlingkup satu tahun, bukan seluruh tabel ──')
{
  const x = await mysql.createConnection(cfg)
  const y = await mysql.createConnection(cfg)
  await x.query('SET SESSION innodb_lock_wait_timeout = 5')
  await y.query('SET SESSION innodb_lock_wait_timeout = 5')
  await x.beginTransaction(); await y.beginTransaction()
  await kunciVersiTahun(x)
  let lolosTahunLain = true
  try {
    await y.query('INSERT IGNORE INTO blud_locks (entity, key_id, version) VALUES (?, ?, 0)', ['blud_versi_tahun', '2098'])
    await y.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE', ['blud_versi_tahun', '2098'])
  } catch { lolosTahunLain = false }
  await x.rollback(); await y.rollback()
  await x.query("DELETE FROM blud_locks WHERE entity = 'blud_versi_tahun' AND key_id IN ('2098', '2099')")
  await x.end(); await y.end()
  cek('Tahun lain tidak ikut terkunci', lolosTahunLain,
    'kalau ikut, seluruh BLUD antre di belakang satu penghapusan')
}

const c = await mysql.createConnection(cfg)
await bersih(c)
const [sisa] = await c.query('SELECT COUNT(*) AS n FROM pergeseran_dpa WHERE tahun_anggaran = ?', [TAHUN])
await c.end()
cek('Data uji dibersihkan', Number(sisa[0].n) === 0)

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
