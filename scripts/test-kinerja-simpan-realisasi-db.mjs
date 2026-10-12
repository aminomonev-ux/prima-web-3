// Uji DB Simpan Realisasi & Tutup Bulan E-Anggaran (docs/CONCEPT-kinerja-simpan-realisasi.md).
//   node scripts/test-kinerja-simpan-realisasi-db.mjs
//
// MENYENTUH DB — hanya TAHUN KOTAK PASIR 2099, dibersihkan di awal DAN di `finally`:
// kinerja_realisasi, kinerja_ssk, kinerja_riwayat_simpan, kinerja_bulan_tutup, dan baris
// blud_locks ber-kunci PERSIS milik uji ini (L92 — bukan `WHERE entity = ?`).
//
// Yang diuji fungsi ASLI `saveRealisasiBatch` / `saveSskBatch` / `tutupBulanRealisasi` /
// `bukaBulanRealisasi`: pembanding, jejak per baris, pagar bulan tertutup, dan gembok
// bersama hidup di dalam transaksi — hanya MySQL sungguhan yang bisa menjawabnya.
import { kompilasiUji } from './_kompilasi-uji.mjs'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'kinerja-simpan-realisasi-db-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

kompilasiUji(repo, outDir, ['lib/data/db.ts', 'lib/data/kinerja.ts', 'lib/kinerja/tutup-bulan-data.ts'])
const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const { saveRealisasiBatch, saveSskBatch, getKinerjaVersion, penyimpanTerakhir } = require(path.join(outDir, 'lib/data/kinerja.js'))
const { tutupBulanRealisasi, bukaBulanRealisasi, daftarBulanTertutup } = require(path.join(outDir, 'lib/kinerja/tutup-bulan-data.js'))
const mysql = require('mysql2/promise')

const TAHUN = '2099'
const SUMBER = 'GAJI'
const KUNCI_REAL = `${TAHUN}:${SUMBER}`
const KUNCI_SSK = `${TAHUN}:${SUMBER}:MURNI:0`
const KUNCI_SSK_P1 = `${TAHUN}:${SUMBER}:PERUBAHAN:1`
const BULAN = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des']

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(72)} ${tambahan}`)
}
async function galat(fn) {
  try { await fn(); return null } catch (e) { return e }
}

async function bersihkan() {
  await sql`DELETE FROM kinerja_realisasi WHERE tahun = ${TAHUN}`
  await sql`DELETE FROM kinerja_riwayat_simpan WHERE tahun = ${TAHUN}`
  await sql`DELETE FROM kinerja_bulan_tutup WHERE tahun = ${TAHUN}`
  await sql`UPDATE kinerja_ssk SET parent_versi_id = NULL WHERE tahun = ${TAHUN}`
  await sql`DELETE FROM kinerja_ssk WHERE tahun = ${TAHUN}`
  await sql`DELETE FROM blud_locks WHERE entity = 'kinerja_realisasi' AND key_id = ${KUNCI_REAL}`
  await sql`DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ${KUNCI_SSK}`
  await sql`DELETE FROM blud_locks WHERE entity = 'kinerja_ssk' AND key_id = ${KUNCI_SSK_P1}`
}

function bulanKosong() { return Object.fromEntries(BULAN.map(b => [b, 0])) }

const ITEM = [
  { cid: 'K-UJI-A', uraian: 'Belanja uji A', pagu: 1_200_000_000 },
  { cid: 'K-UJI-B', uraian: 'Belanja uji B', pagu: 600_000_000 },
]

function sskBaris(ubah = {}) {
  return ITEM.map(it => {
    const months = Object.fromEntries(BULAN.map(b => [b, it.pagu / 12]))
    return {
      uraian_ssk: 'Uji', uraian: it.uraian, program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu: it.pagu, months, months_pct: bulanKosong(), total: it.pagu, total_pct: 100,
      canonical_id: it.cid, is_nullified: false, ...(ubah[it.cid] ?? {}),
    }
  })
}

/** 2 item × 12 bulan. `nilai[cid][bulan]` = real_keuangan; fisik = keuangan. */
function realisasi(nilai = {}) {
  const rows = []
  for (let b = 1; b <= 12; b++) {
    for (const it of ITEM) {
      const v = nilai[it.cid]?.[b] ?? 0
      rows.push({
        bulan: b, ssk_canonical_id: it.cid, ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0,
        keterangan: it.uraian, program: 'P', kegiatan: 'K', subkegiatan: 'S', uraian_ssk: 'Uji',
        real_fisik: v, real_keuangan: v,
      })
    }
  }
  return rows
}

const versiReal = () => getKinerjaVersion('kinerja_realisasi', KUNCI_REAL)
async function jumlahRiwayat() {
  const r = await sql`SELECT COUNT(*) AS n FROM kinerja_riwayat_simpan WHERE tahun = ${TAHUN} AND jenis = 'REALISASI'`
  return Number(r[0]?.n ?? 0)
}
async function barisDb(bulan, cid) {
  const r = await sql`
    SELECT real_keuangan, updated_by, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
    FROM kinerja_realisasi WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND bulan = ${bulan} AND ssk_canonical_id = ${cid}`
  return r[0]
}

const userRows = await sql`SELECT id FROM users WHERE username = 'dummy_dev_claude' LIMIT 1`
const USER = Number(userRows[0]?.id ?? (await sql`SELECT MIN(id) AS id FROM users`)[0].id)

try {
  await bersihkan()
  await saveSskBatch(TAHUN, SUMBER, sskBaris(), USER, 'MURNI', 0, 0)

  console.log('\n[1] Simpan pertama & simpan identik')
  {
    const h = await saveRealisasiBatch(TAHUN, SUMBER, realisasi({ 'K-UJI-A': { 1: 100_000_000 } }), USER, 0)
    periksa('Simpan pertama → ada perubahan', h.tidakBerubah === false)
    periksa('…12 bulan × 2 baris baru', h.perBulan.length === 12 && h.perBulan.every(x => x.baru === 2 && x.berubah === 0))
    periksa('…selisih keuangan Januari +100 jt', h.perBulan[0].selisihKeuangan === 100_000_000, String(h.perBulan[0].selisihKeuangan))
    periksa('…angka gembok 1, riwayat 1', (await versiReal()) === 1 && (await jumlahRiwayat()) === 1)

    const h2 = await saveRealisasiBatch(TAHUN, SUMBER, realisasi({ 'K-UJI-A': { 1: 100_000_000 } }), USER, 1)
    periksa('Simpan identik → tidakBerubah', h2.tidakBerubah === true && h2.perBulan.length === 0)
    periksa('…angka gembok TETAP 1, riwayat TETAP 1', (await versiReal()) === 1 && (await jumlahRiwayat()) === 1)
    const e = await galat(() => saveRealisasiBatch(TAHUN, SUMBER, realisasi({ 'K-UJI-A': { 1: 100_000_000 } }), USER, 0))
    periksa('Simpan identik dgn angka gembok basi tetap 409', e?.name === 'KinerjaVersionConflictError')
    // Angka desimal dari DB (string "100000000.00") vs angka layar — bukan perubahan.
    const h3 = await saveRealisasiBatch(TAHUN, SUMBER,
      realisasi({ 'K-UJI-A': { 1: 100_000_000.001 } }), USER, 1)
    periksa('Selisih di bawah 1 sen bukan perubahan', h3.tidakBerubah === true)
  }

  console.log('\n[2] Jejak per baris')
  {
    await sql`UPDATE kinerja_realisasi SET updated_by = NULL, updated_at = '2099-01-01 00:00:00' WHERE tahun = ${TAHUN}`
    const h = await saveRealisasiBatch(TAHUN, SUMBER,
      realisasi({ 'K-UJI-A': { 1: 100_000_000, 9: 250_000_000 } }), USER, 1)
    periksa('Hanya September yang berubah', h.perBulan.length === 1 && h.perBulan[0].bulan === 9 && h.perBulan[0].berubah === 1)
    periksa('…selisihnya +250 jt', h.perBulan[0].selisihKeuangan === 250_000_000)
    const jan = await barisDb(1, 'K-UJI-A')
    const sep = await barisDb(9, 'K-UJI-A')
    const sepB = await barisDb(9, 'K-UJI-B')
    periksa('Januari (tak berubah) membawa jejak lama', jan.updated_by === null && jan.updated_at === '2099-01-01 00:00:00', `${jan.updated_by} ${jan.updated_at}`)
    periksa('September A (berubah) distempel orang & jam simpanan ini', Number(sep.updated_by) === USER && sep.updated_at !== '2099-01-01 00:00:00', `${sep.updated_by} ${sep.updated_at}`)
    periksa('September B (tak berubah) membawa jejak lama', sepB.updated_by === null && sepB.updated_at === '2099-01-01 00:00:00')
    periksa('…angka gembok 2, riwayat 2', (await versiReal()) === 2 && (await jumlahRiwayat()) === 2)
  }

  console.log('\n[3] Aturan urutan Tutup/Buka')
  {
    let e = await galat(() => tutupBulanRealisasi(TAHUN, SUMBER, 2, USER))
    periksa('Tutup Februari sebelum Januari → ditolak', e?.name === 'KinerjaAturanTutupError', e?.message?.slice(0, 40))
    const t1 = await tutupBulanRealisasi(TAHUN, SUMBER, 1, USER)
    periksa('Tutup Januari → [1]', t1.map(x => x.bulan).join() === '1' && t1[0].ditutup_oleh !== null)
    e = await galat(() => tutupBulanRealisasi(TAHUN, SUMBER, 1, USER))
    periksa('Tutup Januari dua kali → ditolak', e?.name === 'KinerjaAturanTutupError')
    const t2 = await tutupBulanRealisasi(TAHUN, SUMBER, 2, USER)
    periksa('Tutup Februari → [1,2]', t2.map(x => x.bulan).join() === '1,2')
    e = await galat(() => bukaBulanRealisasi(TAHUN, SUMBER, 1))
    periksa('Buka Januari saat Februari tertutup → ditolak', e?.name === 'KinerjaAturanTutupError')
    const b2 = await bukaBulanRealisasi(TAHUN, SUMBER, 2)
    periksa('Buka Februari → [1]', b2.map(x => x.bulan).join() === '1')
    await tutupBulanRealisasi(TAHUN, SUMBER, 2, USER)
    periksa('Daftar akhir [1,2]', (await daftarBulanTertutup(sql, TAHUN, SUMBER)).map(x => x.bulan).join() === '1,2')
    periksa('Tutup/Buka TIDAK menaikkan angka gembok realisasi', (await versiReal()) === 2)
  }

  console.log('\n[4] Pagar bulan tertutup di Simpan')
  {
    const dasar = { 'K-UJI-A': { 1: 100_000_000, 9: 250_000_000 } }
    let e = await galat(() => saveRealisasiBatch(TAHUN, SUMBER,
      realisasi({ 'K-UJI-A': { 1: 90_000_000, 9: 250_000_000 } }), USER, 2))
    periksa('Ubah Januari (tertutup) → BULAN_TERTUTUP', e?.name === 'KinerjaBulanTertutupError', e?.message?.slice(0, 50))
    periksa('…pelanggaran menyebut Januari, real keuangan 100 jt → 90 jt',
      e?.pelanggaran?.some(p => p.bulan === 1 && p.kolom === 'real_keuangan' && p.lama === 100_000_000 && p.baru === 90_000_000))
    periksa('…tidak ada yang tertulis', Number((await barisDb(1, 'K-UJI-A')).real_keuangan) === 100_000_000 && (await versiReal()) === 2)
    e = await galat(() => saveRealisasiBatch(TAHUN, SUMBER,
      realisasi({ 'K-UJI-A': { 1: 90_000_000, 9: 250_000_000 } }), USER, 2, true))
    periksa('force=true TIDAK menembusnya', e?.name === 'KinerjaBulanTertutupError')

    const h = await saveRealisasiBatch(TAHUN, SUMBER,
      realisasi({ 'K-UJI-A': { ...dasar['K-UJI-A'], 10: 5_000_000 } }), USER, 2)
    periksa('Ubah Oktober (terbuka) saat Jan–Feb tertutup → diterima', h.tidakBerubah === false && h.perBulan[0].bulan === 10)

    // Baris baru bernilai 0 di bulan tertutup (Init sesudah rekening baru) — diterima.
    const nol = [...realisasi({ 'K-UJI-A': { ...dasar['K-UJI-A'], 10: 5_000_000 } }),
      ...Array.from({ length: 12 }, (_, i) => ({
        bulan: i + 1, ssk_canonical_id: 'K-UJI-C', ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0,
        keterangan: 'Belanja uji C', program: 'P', kegiatan: 'K', subkegiatan: 'S', uraian_ssk: 'Uji',
        real_fisik: 0, real_keuangan: 0 }))]
    const h2 = await saveRealisasiBatch(TAHUN, SUMBER, nol, USER, 3)
    periksa('Baris baru bernilai 0 di Jan–Feb → diterima', h2.tidakBerubah === false && h2.perBulan.every(x => x.baru === 1))
    const isi = nol.map(r => r.ssk_canonical_id === 'K-UJI-C' && r.bulan === 1 ? { ...r, real_keuangan: 7 } : r)
    e = await galat(() => saveRealisasiBatch(TAHUN, SUMBER, isi, USER, 4))
    periksa('…tapi berangka di Januari → ditolak', e?.name === 'KinerjaBulanTertutupError')
    const tanpaJanA = nol.filter(r => !(r.ssk_canonical_id === 'K-UJI-A' && r.bulan === 1))
    e = await galat(() => saveRealisasiBatch(TAHUN, SUMBER, tanpaJanA, USER, 4))
    periksa('Baris Januari berangka yang HILANG dari kiriman → ditolak', e?.name === 'KinerjaBulanTertutupError'
      && e.pelanggaran.some(p => p.bulan === 1 && p.baru === 0))
  }

  console.log('\n[5] Peringatan RKO bulan tertutup')
  {
    const vSsk = await getKinerjaVersion('kinerja_ssk', KUNCI_SSK)
    const jan = sskBaris({ 'K-UJI-A': { months: { ...sskBaris()[0].months, jan: 1 } } })
    let e = await galat(() => saveSskBatch(TAHUN, SUMBER, jan, USER, 'MURNI', 0, vSsk))
    periksa('Target Januari (tertutup) berubah → TARGET_BULAN_TERTUTUP', e?.name === 'KinerjaTargetTertutupError'
      && e.perubahan.some(p => p.bulan === 1 && p.baru === 1))
    periksa('…tidak ada yang tertulis', (await getKinerjaVersion('kinerja_ssk', KUNCI_SSK)) === vSsk)
    const okt = sskBaris({ 'K-UJI-A': { months: { ...sskBaris()[0].months, okt: 1 } } })
    e = await galat(() => saveSskBatch(TAHUN, SUMBER, okt, USER, 'MURNI', 0, vSsk))
    periksa('Target Oktober (terbuka) berubah → tanpa peringatan', e === null, e?.message)
    const pagu = sskBaris({ 'K-UJI-A': { pagu: 1_300_000_000, months: { ...sskBaris()[0].months, okt: 1 } } })
    e = await galat(() => saveSskBatch(TAHUN, SUMBER, pagu, USER, 'MURNI', 0, vSsk + 1))
    periksa('Pagu berubah → diperingatkan (persen bulan tertutup ikut bergeser)', e?.name === 'KinerjaTargetTertutupError'
      && e.perubahan.some(p => p.bulan === null))
    e = await galat(() => saveSskBatch(TAHUN, SUMBER, pagu, USER, 'MURNI', 0, vSsk + 1, false, true))
    periksa('…dengan setuju_bulan_tertutup → tersimpan', e === null && (await getKinerjaVersion('kinerja_ssk', KUNCI_SSK)) === vSsk + 2, e?.message)
  }

  console.log('\n[6] Tutup Bulan menunggu Simpan yang sedang berjalan (gembok bersama)')
  {
    const c = await mysql.createConnection({
      host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
    })
    try {
      // Simpan yang "sedang berjalan": memegang gembok realisasi persis seperti saveRealisasiBatch.
      await c.beginTransaction()
      await c.query('SELECT version FROM blud_locks WHERE entity = ? AND key_id = ? FOR UPDATE', ['kinerja_realisasi', KUNCI_REAL])
      let selesai = false
      const tutup = tutupBulanRealisasi(TAHUN, SUMBER, 3, USER).then(() => { selesai = true })
      await new Promise(r => setTimeout(r, 700))
      const [tunggu] = await c.query(
        `SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
         JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.BLOCKING_ENGINE_LOCK_ID
         WHERE l.OBJECT_NAME = 'blud_locks'`)
      periksa('Tutup Maret MENUNGGU selama gembok Simpan dipegang', selesai === false && Number(tunggu[0].n) >= 1, `tunggu=${tunggu[0].n}`)
      await c.commit()
      await tutup
      periksa('…lalu selesai begitu Simpan commit', selesai === true
        && (await daftarBulanTertutup(sql, TAHUN, SUMBER)).map(x => x.bulan).join() === '1,2,3')
    } finally {
      await c.end()
    }
  }

  console.log('\n[7] Bentrok RKO (Tahap 4): siapa penyimpannya & versi yang baru dikunci')
  {
    const vSsk = await getKinerjaVersion('kinerja_ssk', KUNCI_SSK)
    let e = await galat(() => saveSskBatch(TAHUN, SUMBER, sskBaris(), USER, 'MURNI', 0, vSsk - 1, false, true))
    periksa('Angka kunci basi → VERSION_CONFLICT', e?.name === 'KinerjaVersionConflictError')
    const p = await penyimpanTerakhir('kinerja_ssk', KUNCI_SSK)
    const nama = (await sql`SELECT COALESCE(nama_lengkap, username) AS n FROM users WHERE id = ${USER}`)[0].n
    periksa('…dialog menyebut nama & jam penyimpan terakhir', p.oleh === nama && /^\d\d:\d\d$/.test(p.pada ?? ''), `${p.oleh} ${p.pada}`)
    // "Buat Perubahan" orang lain terselip: versinya terkunci, angka kuncinya TIDAK naik.
    await sql`UPDATE kinerja_ssk SET locked_at = NOW() WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND versi_tipe = 'MURNI' AND versi_seq = 0`
    e = await galat(() => saveSskBatch(TAHUN, SUMBER, sskBaris(), USER, 'MURNI', 0, vSsk, false, true))
    periksa('Versi terkunci → KinerjaVersiTerkunciError (kode sendiri)', e?.name === 'KinerjaVersiTerkunciError', e?.message)
    const terkunci = await sql`SELECT COUNT(*) AS n FROM kinerja_ssk WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND locked_at IS NOT NULL`
    periksa('…tidak ada yang tertulis, kuncinya utuh', (await getKinerjaVersion('kinerja_ssk', KUNCI_SSK)) === vSsk && Number(terkunci[0].n) === 2)
  }

  console.log('\n[8] parent_versi_id bertahan saat versi Perubahan disimpan')
  {
    // Cermin route "Buat Perubahan": salin MURNI-0 (sudah terkunci di [7]) ke PERUBAHAN-1,
    // induk = id baris asal.
    await sql`
      INSERT INTO kinerja_ssk (tahun, sumber, versi_tipe, versi_seq, canonical_id, parent_versi_id, is_nullified,
        uraian_ssk, uraian, program, kegiatan, subkegiatan, pagu, months, months_pct, total, total_pct, urut, updated_by)
      SELECT tahun, sumber, 'PERUBAHAN', 1, canonical_id, id, is_nullified,
        uraian_ssk, uraian, program, kegiatan, subkegiatan, pagu, months, months_pct, total, total_pct, urut, updated_by
      FROM kinerja_ssk WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND versi_tipe = 'MURNI' AND versi_seq = 0`
    const idMurni = Object.fromEntries((await sql`
      SELECT canonical_id AS c, id FROM kinerja_ssk
      WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND versi_tipe = 'MURNI' AND versi_seq = 0`).map(r => [r.c, Number(r.id)]))
    const induk = async () => Object.fromEntries((await sql`
      SELECT canonical_id AS c, parent_versi_id AS p FROM kinerja_ssk
      WHERE tahun = ${TAHUN} AND sumber = ${SUMBER} AND versi_tipe = 'PERUBAHAN' AND versi_seq = 1`)
      .map(r => [r.c, r.p === null ? null : Number(r.p)]))

    const baru = { uraian_ssk: 'Uji', uraian: 'Belanja uji baru', program: 'P', kegiatan: 'K', subkegiatan: 'S',
      pagu: 0, months: bulanKosong(), months_pct: bulanKosong(), total: 0, total_pct: 0, is_nullified: false }
    // parent_versi_id dari klien sengaja dikirim ngawur — kolom itu milik server.
    const isi = [...sskBaris({ 'K-UJI-A': { pagu: 1_250_000_000, parent_versi_id: 1 } }), baru]
    await saveSskBatch(TAHUN, SUMBER, isi, USER, 'PERUBAHAN', 1, 0, false, true)
    let p = await induk()
    periksa('Simpan pertama: baris lama tetap menunjuk baris MURNI asalnya', p['K-UJI-A'] === idMurni['K-UJI-A']
      && p['K-UJI-B'] === idMurni['K-UJI-B'], JSON.stringify(p))
    periksa('…isian parent_versi_id dari klien diabaikan', p['K-UJI-A'] !== 1)
    periksa('…rekening baru di Perubahan tanpa induk', Object.keys(p).length === 3
      && Object.entries(p).filter(([c]) => !(c in idMurni)).every(([, v]) => v === null))
    await saveSskBatch(TAHUN, SUMBER, sskBaris(), USER, 'PERUBAHAN', 1, 1, true, true)
    p = await induk()
    periksa('Simpan kedua: tautan tetap (bukan cuma selamat sekali)', p['K-UJI-A'] === idMurni['K-UJI-A']
      && p['K-UJI-B'] === idMurni['K-UJI-B'] && Object.keys(p).length === 2)
  }
} finally {
  await bersihkan()
  const sisa = await sql`
    SELECT (SELECT COUNT(*) FROM kinerja_realisasi WHERE tahun = ${TAHUN})
         + (SELECT COUNT(*) FROM kinerja_ssk WHERE tahun = ${TAHUN})
         + (SELECT COUNT(*) FROM kinerja_riwayat_simpan WHERE tahun = ${TAHUN})
         + (SELECT COUNT(*) FROM kinerja_bulan_tutup WHERE tahun = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_locks WHERE (entity = 'kinerja_realisasi' AND key_id = ${KUNCI_REAL})
                                               OR (entity = 'kinerja_ssk' AND key_id IN (${KUNCI_SSK}, ${KUNCI_SSK_P1}))) AS n
  `
  periksa('Kotak pasir 2099 bersih setelah uji', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
