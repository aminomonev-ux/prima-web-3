// Uji DB Realisasi per Penanggung Jawab (docs/CONCEPT-blud-realisasi-pj.md).
//   node scripts/test-blud-realisasi-pj-db.mjs
//
// MENYENTUH DB — hanya TAHUN KOTAK PASIR 2099, dibersihkan di awal DAN di `finally`.
//
// Yang dibuktikan: transaksi per PJ (`getRegisterPj`) menjumlah PERSIS angka PJ itu di
// rekap layar (`rekapPerPj` atas baris yang disusun seperti route pagu) — dua jalur, satu
// aturan rekening. Plus kuitansi yang dibagi ke dua PJ, PJ ganda satu rantai, tanpa PJ.
import { kompilasiUji } from './_kompilasi-uji.mjs'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-realisasi-pj-db-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

kompilasiUji(repo, outDir, ['lib/data/db.ts', 'lib/blud/pagu.ts', 'lib/blud/realisasi-data.ts', 'lib/blud/realisasi-pj.ts'])
const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const { getPaguEfektif, getTerserap, getSerapanPeriode, gulungKeAtas } = require(path.join(outDir, 'lib/blud/pagu.js'))
const { getRegisterPj } = require(path.join(outDir, 'lib/blud/realisasi-data.js'))
const { rekapPerPj } = require(path.join(outDir, 'lib/blud/realisasi-pj.js'))

const TAHUN = 2099
const VERSI = '2099-01-10'
const JT = 1_000_000
let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(72)} ${tambahan}`)
}

async function bersihkan() {
  await sql`DELETE FROM blud_realisasi_alokasi WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
}

// I (tanpa PJ) → A "Kasubbag Umum" → A1 "Kasi X" (ganda), A2 · B "Kasubbag Keuangan" · C tanpa PJ
const POHON = [
  ['I', null, null, 'MASTER', 100],
  ['A', 'I', 'Kasubbag Umum', 'CHILD', 60],
  ['A1', 'A', 'Kasi X', 'LEADER', 40],
  ['A2', 'A', null, 'LEADER', 20],
  ['B', 'I', 'Kasubbag Keuangan', 'CHILD', 30],
  ['C', 'I', null, 'CHILD', 10],
]

async function tx(bulan, uraian, alokasi) {
  const total = alokasi.reduce((s, [, n]) => s + n, 0) * JT
  const r = await sql`
    INSERT INTO blud_realisasi_tx (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_keluar, status, version)
    VALUES (${TAHUN}, ${bulan}, ${`2099-${String(bulan).padStart(2, '0')}-15`}, 'BELANJA', ${uraian}, ${total}, 'NORMAL', 0)
  `
  const id = r.insertId ?? r[0]?.insertId
  for (const [k, n] of alokasi) {
    await sql`INSERT INTO blud_realisasi_alokasi (tx_id, tahun_anggaran, anggaran_key, nilai) VALUES (${id}, ${TAHUN}, ${`AK-pj-${k}`}, ${n * JT})`
  }
}

/** Baris persis seperti keluaran route pagu (`app/api/blud/realisasi/pagu/route.ts`). */
async function barisLayar(bulan) {
  const baris = await getPaguEfektif(TAHUN)
  const setahun = gulungKeAtas(baris, await getTerserap(TAHUN))
  const periode = await getSerapanPeriode(TAHUN, bulan)
  const ini = gulungKeAtas(baris, new Map([...periode].map(([k, v]) => [k, v.bulan_ini])))
  const lalu = gulungKeAtas(baris, new Map([...periode].map(([k, v]) => [k, v.bulan_lalu])))
  return baris.map(b => ({
    ...b, terserap: setahun.get(b.anggaran_key) ?? 0,
    bulan_ini: ini.get(b.anggaran_key) ?? 0, bulan_lalu: lalu.get(b.anggaran_key) ?? 0,
    sd_bulan: (ini.get(b.anggaran_key) ?? 0) + (lalu.get(b.anggaran_key) ?? 0),
  }))
}

try {
  await bersihkan()
  for (const [i, [k, induk, pj, tipe, pagu]] of POHON.entries()) {
    await sql`
      INSERT INTO dpa_blud (tahun_anggaran, versi_tanggal, kode_rekening, uraian, vol, satuan, harga, jumlah,
        penanggung_jawab, keterangan, tipe_baris, row_id, anggaran_key, parent_id, urutan, origin)
      VALUES (${TAHUN}, ${VERSI}, ${`5.${k}`}, ${`Rekening ${k}`}, NULL, NULL, NULL, ${pagu * JT},
        ${pj}, NULL, ${tipe}, ${`r-pj-${k}`}, ${`AK-pj-${k}`}, ${induk ? `r-pj-${induk}` : null}, ${i}, 'MANUAL')
    `
  }
  await tx(2, 'Kuitansi dibagi dua PJ', [['A1', 5], ['B', 3]])
  await tx(3, 'Belanja A2', [['A2', 2]])
  await tx(3, 'Belanja tanpa PJ', [['C', 1]])
  await tx(5, 'Sesudah Maret', [['B', 4]])

  console.log('\n[1] PJ terbaca dari versi sumber pagu')
  const baris = await getPaguEfektif(TAHUN)
  periksa('getPaguEfektif membawa PJ baris', baris.find(b => b.anggaran_key === 'AK-pj-A')?.penanggung_jawab === 'Kasubbag Umum')

  console.log('\n[2] Rekap layar s.d. Maret')
  const rows = await barisLayar(3)
  const h = rekapPerPj(rows)
  const umum = h.baris.find(b => b.pj === 'Kasubbag Umum')
  const keu = h.baris.find(b => b.pj === 'Kasubbag Keuangan')
  periksa('Kasubbag Umum = A1 + A2 (PJ ganda A1 ke induk)', umum?.sd_bulan === 7 * JT, `${umum?.sd_bulan}`)
  periksa('Kasubbag Keuangan s.d. Maret = 3 jt (Mei tidak ikut)', keu?.sd_bulan === 3 * JT, `${keu?.sd_bulan}`)
  periksa('Belum ada PJ = 1 jt', h.tanpaPj?.sd_bulan === 1 * JT, `${h.tanpaPj?.sd_bulan}`)
  periksa('Total = akar (11 jt s.d. Maret)', h.total.sd_bulan === 11 * JT && h.konflik === 1)

  console.log('\n[3] Transaksi per PJ = angka rekap')
  const rUmum = await getRegisterPj(TAHUN, 'Kasubbag Umum', 3)
  periksa('Kasubbag Umum: total transaksi = rekap', rUmum.total === umum?.sd_bulan, `${rUmum.total}`)
  periksa('…dua baris (A1 dari kuitansi terbagi, A2)', rUmum.rows.length === 2)
  const terbagi = rUmum.rows.find(r => r.anggaran_key === 'AK-pj-A1')
  periksa('…kuitansi terbagi: bagian 5 jt dari kuitansi 8 jt', terbagi?.nilai === 5 * JT && terbagi?.total_kuitansi === 8 * JT)
  periksa('…rekeningnya disebut', terbagi?.kode_rekening === '5.A1' && terbagi?.uraian_rekening === 'Rekening A1')
  const rKeu = await getRegisterPj(TAHUN, 'Kasubbag Keuangan', 3)
  periksa('Kasubbag Keuangan s.d. Maret: hanya bagian 3 jt', rKeu.total === keu?.sd_bulan && rKeu.rows.length === 1)
  const rKeuSetahun = await getRegisterPj(TAHUN, 'Kasubbag Keuangan')
  periksa('…tanpa batas bulan: 7 jt (setahun)', rKeuSetahun.total === 7 * JT && rKeuSetahun.total === keu?.terserap)
  const rTanpa = await getRegisterPj(TAHUN, '', 3)
  periksa('"" = transaksi rekening tanpa PJ', rTanpa.total === h.tanpaPj?.sd_bulan && rTanpa.rows[0]?.anggaran_key === 'AK-pj-C')
  const rGanda = await getRegisterPj(TAHUN, 'Kasi X', 3)
  periksa('PJ ganda di turunan tidak punya transaksi sendiri', rGanda.rows.length === 0 && rGanda.total === 0)
  const rAsing = await getRegisterPj(TAHUN, 'Tidak Ada', 3)
  periksa('PJ yang tidak ada → kosong, bukan galat', rAsing.rows.length === 0)
} finally {
  await bersihkan()
  const sisa = await sql`SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}) AS d, (SELECT COUNT(*) FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}) AS t`
  console.log(`\nkotak pasir dibersihkan — sisa dpa ${sisa[0].d}, tx ${sisa[0].t}`)
  console.log(`\n${jalan - gagal} pemeriksaan LULUS${gagal ? ` · ${gagal} GAGAL` : ''}`)
  process.exit(gagal ? 1 : 0)
}
