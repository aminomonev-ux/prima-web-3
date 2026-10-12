// Uji DB "Simpan yang isinya sama tidak menulis apa pun" BLUD (docs/CONCEPT-blud-simpan-identik.md).
//   node scripts/test-blud-simpan-identik-db.mjs
//
// MENYENTUH DB — hanya TAHUN KOTAK PASIR 2099, dibersihkan di awal DAN di `finally`
// (tabel & kunci yang sama dengan test-blud-dpa-perubahan-db.mjs).
//
// Yang diuji fungsi ASLI `saveDpa`/`savePergeseran`: pembandingnya dibaca di dalam
// transaksi, dan yang paling penting dibuktikan di sini adalah bolak-balik layar —
// baris yang dimuat lalu dipetakan seperti layar (`dpaKeInput`) harus terbaca SAMA,
// kalau tidak aturan ini tidak pernah menggigit di pemakaian nyata.
import { kompilasiUji } from './_kompilasi-uji.mjs'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-simpan-identik-db-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

kompilasiUji(repo, outDir, ['lib/data/db.ts', 'lib/blud/data.ts', 'lib/blud/row-map.ts'])
const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const data = require(path.join(outDir, 'lib/blud/data.js'))
const { dpaKeInput, pergeseranKeInput } = require(path.join(outDir, 'lib/blud/row-map.js'))
const { saveDpa, savePergeseran, getDpaByDate, getDpaVersion, getPergeseranByDate, getPergeseranVersion, getPergeseranMutasi } = data

const TAHUN = 2099
const JT = 1_000_000
const V0 = '2099-01-10'     // DPA pertama
const ARSIP = '2099-01-31'  // akhir bulan di antara V0 dan T
const T = '2099-02-15'      // "hari ini" yang lain
const M = '2099-10-09'      // DPA Perubahan
const P1 = '2099-03-31'     // pergeseran
const P2 = '2099-04-15'

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

let USER = 1

function pohonDpa(angka) {
  const anak = Object.entries(angka)
  const total = anak.reduce((s, [, v]) => s + v, 0)
  return [
    { kode_rekening: '5.1', uraian: 'Induk uji', vol: null, satuan: null, harga: null, jumlah: total * JT,
      penanggung_jawab: null, keterangan: null, tipe_baris: 'MASTER', row_id: 'r-I', anggaran_key: 'AK-uji-I',
      parent_id: null, urutan: 0, origin: 'MANUAL', usulan_item_id: null, usulan_no: null },
    ...anak.map(([n, v], i) => ({
      kode_rekening: `5.1.0${i + 1}`, uraian: `Rekening ${n}`, vol: 1, satuan: 'paket', harga: v * JT, jumlah: v * JT,
      penanggung_jawab: n === 'A' ? 'Kasubbag Uji' : null, keterangan: null, tipe_baris: 'CHILD', row_id: `r-${n}`,
      anggaran_key: `AK-uji-${n}`, parent_id: 'r-I', urutan: i + 1,
      origin: 'MANUAL', usulan_item_id: null, usulan_no: null,
    })),
  ]
}

function pohonPergeseran(dpaAngka, pAngka) {
  return pohonDpa(dpaAngka).map(r => {
    const n = r.row_id.slice(2)
    const p = n === 'I' ? Object.values(pAngka).reduce((s, v) => s + v, 0) : pAngka[n]
    return {
      kode_rekening: r.kode_rekening, uraian: r.uraian, vol: r.vol, satuan: r.satuan, harga: r.harga, jumlah: r.jumlah,
      vol_p: r.vol, harga_p: n === 'I' ? null : p * JT, pergeseran: p * JT, bertambah_berkurang: p * JT - r.jumlah,
      bertambah: null, berkurang: null, penanggung_jawab: r.penanggung_jawab, keterangan: null,
      tipe_baris: r.tipe_baris, row_id: r.row_id, anggaran_key: r.anggaran_key, parent_id: r.parent_id, urutan: r.urutan,
    }
  })
}

const simpanDpa = async (versi, rows, asal = null) =>
  saveDpa(TAHUN, versi, rows, USER, await getDpaVersion(TAHUN, versi), false, false, false, asal)
const simpanPg = async (versi, acuan, rows, mutasi = [], asalTutup = null) =>
  savePergeseran(TAHUN, versi, acuan, rows, USER, await getPergeseranVersion(TAHUN, versi), false, false, false, asalTutup, mutasi)
const adaVersiDpa = async (v) => (await getDpaByDate(TAHUN, v)).length > 0
const riwayat = async (jenis) =>
  Number((await sql`SELECT COUNT(*) AS n FROM blud_riwayat_simpan WHERE tahun_anggaran = ${TAHUN} AND jenis = ${jenis}`)[0].n)

async function bersihkan() {
  await sql`DELETE FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM dpa_blud WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_riwayat_simpan WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_pergeseran_tutup WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM pergeseran_mutasi WHERE tahun_anggaran = ${TAHUN}`
  await sql`DELETE FROM blud_locks WHERE key_id LIKE ${`${TAHUN}:%`} OR (entity = 'blud_versi_tahun' AND key_id = ${String(TAHUN)})`
}

try {
  USER = Number((await sql`SELECT MIN(id) AS id FROM users`)[0]?.id ?? 1)
  await bersihkan()

  console.log('\n[1] DPA — simpan ulang versi yang sama')
  await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
  const v0 = await getDpaVersion(TAHUN, V0)
  const rw0 = await riwayat('DPA')
  {
    const r = await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
    periksa('Isi sama → tidakBerubah, versi berlaku = versi itu sendiri', r.tidakBerubah?.versiBerlaku === V0)
    periksa('…angka kunci TETAP, foto riwayat TETAP', (await getDpaVersion(TAHUN, V0)) === v0 && (await riwayat('DPA')) === rw0)
    // Bolak-balik layar: muat → petakan seperti layar → kirim balik.
    const layar = (await getDpaByDate(TAHUN, V0)).map(dpaKeInput)
    const r2 = await simpanDpa(V0, layar)
    periksa('Bolak-balik layar (getDpaByDate → dpaKeInput) terbaca SAMA', r2.tidakBerubah?.versiBerlaku === V0)
    const e = await galat(() => saveDpa(TAHUN, V0, layar, USER, v0 - 1))
    periksa('Isi sama dgn angka kunci basi tetap 409', e?.name === 'BludVersionConflictError', e?.name)
  }

  console.log('\n[2] DPA — buka versi lama, Simpan ke tanggal baru tanpa perubahan')
  {
    const layar = (await getDpaByDate(TAHUN, V0)).map(dpaKeInput)
    const r = await simpanDpa(T, layar)
    periksa('Sasaran tanggal baru, isi = versi berlaku → dilewati', r.tidakBerubah?.versiBerlaku === V0)
    periksa('…TIDAK lahir versi kembar', !(await adaVersiDpa(T)) && (await riwayat('DPA')) === rw0)
    const r2 = await simpanDpa(ARSIP, layar)
    periksa('Arsip akhir bulan, isi = versi yang berlaku pada tanggal itu → dilewati', r2.tidakBerubah?.versiBerlaku === V0 && !(await adaVersiDpa(ARSIP)))
  }

  console.log('\n[3] DPA — ada yang berubah tetap ditulis; mengembalikan dari arsip tetap ditulis')
  {
    const salahKetik = (await getDpaByDate(TAHUN, V0)).map(dpaKeInput).map(r => (r.row_id === 'r-B' ? { ...r, harga: 71 * JT, jumlah: 71 * JT } : r))
    salahKetik[0] = { ...salahKetik[0], jumlah: 181 * JT }
    const r = await simpanDpa(T, salahKetik)
    periksa('Satu angka berubah → versi baru ditulis', !r.tidakBerubah && (await adaVersiDpa(T)))
    // Mengembalikan isi V0 (benar) ke T yang berisi salah ketik: pembandingnya T sendiri.
    const benar = (await getDpaByDate(TAHUN, V0)).map(dpaKeInput)
    const r2 = await simpanDpa(T, benar)
    const t = await getDpaByDate(TAHUN, T)
    periksa('Isi arsip dikembalikan ke versi salah ketik → DITULIS', !r2.tidakBerubah && t.find(x => x.row_id === 'r-B')?.jumlah === 70 * JT)
    const r3 = await simpanDpa(T, benar)
    periksa('…disimpan sekali lagi tanpa perubahan → dilewati', r3.tidakBerubah?.versiBerlaku === T)
    const uraian = benar.map(x => (x.row_id === 'r-C' ? { ...x, uraian: 'Rekening C (koreksi)' } : x))
    periksa('Uraian saja yang berubah → ditulis', !(await simpanDpa(T, uraian)).tidakBerubah)
    const volNol = (await getDpaByDate(TAHUN, T)).map(dpaKeInput).map(x => (x.row_id === 'r-I' ? { ...x, vol: 0 } : x))
    periksa('vol kosong → 0 dianggap perubahan (NULL ≠ 0)', !(await simpanDpa(T, volNol)).tidakBerubah)
  }

  console.log('\n[4] DPA — pembuat Perubahan tidak pernah dilewati')
  {
    const isi = (await getDpaByDate(TAHUN, T)).map(dpaKeInput)
    const r = await simpanDpa(M, isi, { sumber_dasar: 'DPA', versi_dasar: T })
    const p = await sql`SELECT COUNT(*) AS n FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN}`
    periksa('Isi sama dgn dasar + asal_perubahan → versi & penanda TETAP terbit', !r.tidakBerubah && (await adaVersiDpa(M)) && Number(p[0].n) === 1)
  }
  await bersihkan()

  console.log('\n[5] Pergeseran — isi, acuan, dan catatan perpindahan')
  await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
  const mutasi = [{ dari_row: 'r-A', ke_row: 'r-B', nilai: 10 * JT, keterangan: 'uji' }]
  await simpanPg(P1, V0, pohonPergeseran({ A: 80, B: 70, C: 30 }, { A: 70, B: 80, C: 30 }), mutasi)
  const rwP = await riwayat('PERGESERAN')
  {
    const layar = (await getPergeseranByDate(TAHUN, P1)).map(pergeseranKeInput)
    const mLayar = await getPergeseranMutasi(TAHUN, P1)
    const r = await simpanPg(P1, V0, layar, mLayar)
    periksa('Bolak-balik layar (baris + catatan) → dilewati', r.tidakBerubah?.versiBerlaku === P1 && (await riwayat('PERGESERAN')) === rwP)
    const r2 = await simpanPg(P2, V0, layar, mLayar)
    periksa('Tanggal baru, isi sama → tidak lahir versi kembar', r2.tidakBerubah?.versiBerlaku === P1 && (await getPergeseranByDate(TAHUN, P2)).length === 0)
    const r3 = await simpanPg(P1, V0, layar, [...mLayar, { dari_row: 'r-C', ke_row: 'r-B', nilai: 1 * JT, keterangan: null }])
    periksa('Catatan perpindahan bertambah → ditulis', !r3.tidakBerubah)
    const mKini = await getPergeseranMutasi(TAHUN, P1)
    periksa('Catatan tidak dikirim (jalur lama) → hanya baris yang menentukan',
      (await savePergeseran(TAHUN, P1, V0, layar, USER, await getPergeseranVersion(TAHUN, P1))).tidakBerubah?.versiBerlaku === P1 && mKini.length === 2)
  }

  console.log('\n[6] Pergeseran — penutupan tidak pernah dilewati')
  {
    const layar = (await getPergeseranByDate(TAHUN, P1)).map(pergeseranKeInput)
    const r = await simpanPg(P2, V0, layar, await getPergeseranMutasi(TAHUN, P1), { versi_ditutup: P1 })
    const tutup = await sql`SELECT COUNT(*) AS n FROM blud_pergeseran_tutup WHERE tahun_anggaran = ${TAHUN}`
    periksa('asal_tutup → basis & catatan penutupan TETAP terbit', !r.tidakBerubah && (await getPergeseranByDate(TAHUN, P2)).length > 0 && Number(tutup[0].n) === 1)
  }
} finally {
  await bersihkan()
  const sisa = await sql`
    SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_riwayat_simpan WHERE tahun_anggaran = ${TAHUN}) AS n`
  periksa('Kotak pasir 2099 bersih setelah uji', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
