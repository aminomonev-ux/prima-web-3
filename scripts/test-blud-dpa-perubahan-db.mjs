// Uji DB DPA Perubahan BLUD (docs/CONCEPT-blud-dpa-perubahan.md, Tahap 1).
//   node scripts/test-blud-dpa-perubahan-db.mjs
//
// MENYENTUH DB — hanya di TAHUN KOTAK PASIR 2099, dibersihkan di awal DAN di
// `finally`: dpa_blud, pergeseran_dpa, blud_dpa_perubahan, blud_realisasi_tx
// (+ alokasi lewat CASCADE), blud_riwayat_simpan, blud_locks ber-tahun 2099.
//
// Yang diuji fungsi ASLI `saveDpa`/`savePergeseran`/`deleteDpaVersi`/
// `deletePergeseranVersi` + `getPaguSumber`/`getPaguEfektif`, bukan tiruan SQL-nya:
// pagar-pagar Perubahan hidup di dalam transaksi, di bawah kunci, dan hanya
// MySQL sungguhan yang bisa menjawab apakah urutan & isinya benar.
//
// Contoh angka = konsep §1: pergeseran terakhir A 80 · B 70 · C 30 (juta), B sudah
// terserap 65; Perubahan A +15, C −10, rekening baru D 25.
import { kompilasiUji } from './_kompilasi-uji.mjs'
import fs from 'node:fs'
import path from 'node:path'
import Module from 'node:module'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(repo, 'node_modules', '.cache', 'blud-dpa-perubahan-db-test')

for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(t.slice(0, i).trim() in process.env)) process.env[t.slice(0, i).trim()] = v
}

kompilasiUji(repo, outDir, ['lib/data/db.ts', 'lib/blud/data.ts', 'lib/blud/pagu.ts', 'lib/blud/row-map.ts', 'lib/blud/impor-balik.ts'])
const resolveAsli = Module._resolveFilename
Module._resolveFilename = function (permintaan, ...sisa) {
  if (permintaan.startsWith('@/')) return path.join(outDir, permintaan.slice(2) + '.js')
  return resolveAsli.call(this, permintaan, ...sisa)
}

const { sql } = require(path.join(outDir, 'lib/data/db.js'))
const data = require(path.join(outDir, 'lib/blud/data.js'))
const { getPaguSumber, getPaguEfektif } = require(path.join(outDir, 'lib/blud/pagu.js'))
const { pergeseranKeDpaInput, dpaKeInput } = require(path.join(outDir, 'lib/blud/row-map.js'))
const { gabungImporBalik } = require(path.join(outDir, 'lib/blud/impor-balik.js'))
const { saveDpa, savePergeseran, deleteDpaVersi, deletePergeseranVersi, getDpaByDate, getDpaVersion, getPergeseranByDate, getPergeseranVersion } = data

const TAHUN = 2099
const JT = 1_000_000
const V0 = '2099-01-10'     // DPA murni
const P1 = '2099-03-31'     // pergeseran babak murni (dasar Perubahan ke-1)
const M = '2099-10-09'      // DPA Perubahan ke-1
const M_1 = '2099-10-10'    // revisi Perubahan ke-1 keesokan hari
const P2 = '2099-10-20'     // pergeseran babak Perubahan ke-1
const M2 = '2099-11-20'     // DPA Perubahan ke-2

let gagal = 0
let jalan = 0
function periksa(nama, benar, tambahan = '') {
  jalan++
  if (!benar) gagal++
  console.log(`${benar ? '  ok  ' : ' GAGAL'} ${nama.padEnd(70)} ${tambahan}`)
}
/** Jalankan fn, kembalikan nama kelas error-nya (atau null kalau lolos). */
async function tangkap(fn) {
  try { await fn(); return null } catch (e) { return e?.name ?? 'Error' }
}
async function galat(fn) {
  try { await fn(); return null } catch (e) { return e }
}

let USER = 1

/** Pohon kecil: induk I + anak A/B/C (+ D kalau ada). Angka dalam juta. */
function pohonDpa(angka, ekstra = {}) {
  const anak = Object.entries(angka)
  const total = anak.reduce((s, [, v]) => s + v, 0)
  return [
    { kode_rekening: '5.1', uraian: 'Induk uji', vol: null, satuan: null, harga: null, jumlah: total * JT,
      penanggung_jawab: null, keterangan: null, tipe_baris: 'MASTER', row_id: 'r-I', anggaran_key: 'AK-uji-I',
      parent_id: null, urutan: 0, origin: 'MANUAL', usulan_item_id: null, usulan_no: null },
    ...anak.map(([n, v], i) => ({
      kode_rekening: `5.1.0${i + 1}`, uraian: `Rekening ${n}`, vol: 1, satuan: 'paket', harga: v * JT, jumlah: v * JT,
      penanggung_jawab: null, keterangan: null, tipe_baris: 'CHILD', row_id: `r-${n}`,
      anggaran_key: n === 'D' ? null : `AK-uji-${n}`, parent_id: 'r-I', urutan: i + 1,
      origin: n === 'A' ? 'USULAN' : 'MANUAL', usulan_item_id: n === 'A' ? 9001 : null, usulan_no: n === 'A' ? 'USL/2099/1' : null,
      ...(ekstra[n] ?? {}),
    })),
  ]
}

/** Pergeseran dari DPA acuan: kolom kiri = DPA, kolom P = angka geseran (juta). */
function pohonPergeseran(dpaAngka, pAngka) {
  return pohonDpa(dpaAngka).map(r => {
    const n = r.row_id.slice(2)
    const p = n === 'I' ? Object.values(pAngka).reduce((s, v) => s + v, 0) : pAngka[n]
    return {
      kode_rekening: r.kode_rekening, uraian: r.uraian, vol: r.vol, satuan: r.satuan, harga: r.harga, jumlah: r.jumlah,
      vol_p: r.vol, harga_p: n === 'I' ? null : p * JT, pergeseran: p * JT, bertambah_berkurang: p * JT - r.jumlah,
      bertambah: null, berkurang: null, penanggung_jawab: null, keterangan: null,
      tipe_baris: r.tipe_baris, row_id: r.row_id, anggaran_key: r.anggaran_key, parent_id: r.parent_id, urutan: r.urutan,
    }
  })
}

async function simpanDpa(versi, rows, opsi = {}) {
  return saveDpa(TAHUN, versi, rows, USER, await getDpaVersion(TAHUN, versi),
    opsi.force ?? false, opsi.paksa ?? false, false, opsi.asal ?? null)
}
async function simpanPg(versi, acuan, rows) {
  return savePergeseran(TAHUN, versi, acuan, rows, USER, await getPergeseranVersion(TAHUN, versi))
}
async function serap(key, nilai) {
  const res = await sql`
    INSERT INTO blud_realisasi_tx (tahun_anggaran, bulan, tanggal, jenis, uraian, kas_keluar, status, version)
    VALUES (${TAHUN}, 9, '2099-09-15', 'BELANJA', 'Uji DPA Perubahan', ${nilai}, 'NORMAL', 0)
  `
  await sql`INSERT INTO blud_realisasi_alokasi (tx_id, tahun_anggaran, anggaran_key, nilai)
            VALUES (${Number(res[0]?.insertId ?? 0)}, ${TAHUN}, ${key}, ${nilai})`
}
async function penanda() {
  return sql`SELECT DATE_FORMAT(versi_mulai,'%Y-%m-%d') AS mulai, sumber_dasar, DATE_FORMAT(versi_dasar,'%Y-%m-%d') AS dasar
             FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN} ORDER BY versi_mulai`
}
const perKunci = (rows) => new Map(rows.map(r => [r.anggaran_key, r]))

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

  // ══ Fase I — tahun TANPA pergeseran: dasar = DPA terakhir ══════════════════
  console.log('\n── 2. Tahun tanpa pergeseran → dasar DPA ──')
  await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
  {
    const r = await simpanDpa(M, pohonDpa({ A: 95, B: 70, C: 20, D: 25 }), { asal: { sumber_dasar: 'DPA', versi_dasar: V0 } })
    const p = await penanda()
    periksa('Penanda tertulis, sumber_dasar = DPA', p.length === 1 && p[0].sumber_dasar === 'DPA' && p[0].dasar === V0 && p[0].mulai === M)
    periksa('SimpanHasil.perubahan: ke-1, dibuat', r.perubahan?.ke === 1 && r.perubahan.dibuat === true)
    const k = perKunci(await getDpaByDate(TAHUN, M))
    periksa('Sebelum dari kolom DPA (vol/harga/jumlah)',
      k.get('AK-uji-A').jumlah_sebelum === 80 * JT && k.get('AK-uji-A').vol_sebelum === 1 && k.get('AK-uji-A').harga_sebelum === 80 * JT)
    const s = await getPaguSumber(TAHUN)
    periksa('getPaguSumber → DPA Perubahan ke-1', s.sumber === 'DPA' && s.versi === M && s.perubahan_ke === 1, `${s.sumber} ${s.versi} ke-${s.perubahan_ke}`)
  }
  console.log('\n── 8a. Versi dasar DPA dikunci ──')
  periksa('Simpan ulang DPA dasar → VERSI_DASAR', await tangkap(() => simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))) === 'BludVersiDasarError')
  periksa('Hapus DPA dasar → VERSI_DASAR', await tangkap(() => deleteDpaVersi(TAHUN, V0)) === 'BludVersiDasarError')
  await bersihkan()

  // Impor-balik (§11.3) ke versi MURNI yang jadi sumber pagu: rekening berealisasi yang
  // dibuang di Excel tidak dinolkan (aturan §10 hanya untuk baris ber-Sebelum), jadi yang
  // menjaga belanjanya pagar §4.3 di jalur Simpan — bukan `periksaJangkar`, yang hanya
  // menangkap baris yang DIKIRIM tanpa jangkar.
  console.log('\n── 12. Impor-balik versi murni: rekening berealisasi dibuang di Excel ──')
  {
    await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
    await serap('AK-uji-B', 65 * JT)
    const versi = (await getDpaByDate(TAHUN, V0)).map(dpaKeInput)
    const berkas = versi.filter(r => r.row_id !== 'r-B')
      .map(r => ({ ...r, row_id: `x${r.row_id}`, parent_id: r.parent_id ? `x${r.parent_id}` : null }))
    const { rows, banding } = gabungImporBalik(versi, berkas)
    periksa('gabung: B (murni, tanpa Sebelum) dihapus & tercatat di neraca',
      !rows.some(r => r.anggaran_key === 'AK-uji-B') && banding.dihapus.some(d => d.uraian === 'Rekening B' && d.jumlah === 70 * JT))
    const e = await galat(() => simpanDpa(V0, rows))
    periksa('Simpan tanpa B → PAGU_DIBAWAH_REALISASI, B tercatat HILANG',
      e?.name === 'BludPaguDibawahRealisasiError' && e.bentrok?.some(b => b.anggaran_key === 'AK-uji-B' && b.hilang && b.terserap === 65 * JT), e?.name)
    periksa('…versi murni boleh dipaksa dengan alasan (bisaDipaksa)', e?.bisaDipaksa === true)
    periksa('…tidak ada yang tertulis', (await getDpaByDate(TAHUN, V0)).length === 4)
    const r = await simpanDpa(V0, rows, { paksa: true })
    periksa('…dipaksa → diterima, bentroknya dipulangkan untuk audit',
      r.bentrokPagu.some(b => b.anggaran_key === 'AK-uji-B' && b.hilang) && (await getDpaByDate(TAHUN, V0)).length === 3)
  }
  await bersihkan()

  // ══ Fase II — contoh §1: DPA murni + Pergeseran (A80 B70 C30), B terserap 65 ══
  await simpanDpa(V0, pohonDpa({ A: 80, B: 70, C: 30 }))
  await simpanPg(P1, V0, pohonPergeseran({ A: 80, B: 70, C: 30 }, { A: 80, B: 70, C: 30 }))
  await serap('AK-uji-B', 65 * JT)
  const pgP1 = await getPergeseranByDate(TAHUN, P1)
  const jejakDpa = new Map((await getDpaByDate(TAHUN, V0)).map(d => [d.row_id, d]))
  /** Isi layar "Jadikan DPA Perubahan": pergeseran P1 → baris DPA (jangkar dibawa). */
  const dariP1 = (ubah = {}, tambahD = true) => {
    const rows = pgP1.map((p, i) => pergeseranKeDpaInput(p, i, jejakDpa))
    for (const r of rows) {
      const n = r.row_id.slice(2)
      if (ubah[n] != null) { r.harga = ubah[n] * JT; r.jumlah = ubah[n] * JT; r.vol = ubah[n] === 0 ? null : 1 }
    }
    if (tambahD) rows.push({ ...rows[rows.length - 1], row_id: 'r-D', anggaran_key: null, kode_rekening: '5.1.04',
      uraian: 'Rekening D', vol: 1, harga: 25 * JT, jumlah: 25 * JT, urutan: 9, origin: 'MANUAL', usulan_item_id: null, usulan_no: null })
    const anak = rows.filter(r => r.parent_id)
    rows.find(r => r.row_id === 'r-I').jumlah = anak.reduce((s, r) => s + r.jumlah, 0)
    return rows
  }
  const ASAL = { sumber_dasar: 'PERGESERAN', versi_dasar: P1 }

  console.log('\n── Mapper: pergeseranKeDpaInput ──')
  {
    const rows = dariP1({}, false)
    const a = rows.find(r => r.row_id === 'r-A')
    periksa('Jangkar DIBAWA dari pergeseran', a.anggaran_key === 'AK-uji-A')
    periksa('Jejak usulan diambil dari DPA acuan lewat row_id', a.origin === 'USULAN' && a.usulan_item_id === 9001 && a.usulan_no === 'USL/2099/1')
    periksa('Angka = kolom P (pagu sesudah digeser)', a.jumlah === 80 * JT && a.harga === 80 * JT)
  }

  console.log('\n── 3. Sasaran yang sudah berisi / lebih awal dari DPA terakhir ──')
  {
    // V0 bukan dasar (dasarnya P1), jadi yang menolak harus §5.1.
    const e = await galat(() => simpanDpa(V0, dariP1(), { asal: ASAL }))
    periksa('Sasaran = tanggal yang sudah berisi DPA → §5.1', e?.name === 'BludSasaranPerubahanError' && e.dpaTerakhir === V0, e?.name)
    const e2 = await galat(() => simpanDpa('2099-01-05', dariP1(), { asal: ASAL }))
    periksa('Sasaran sebelum DPA terakhir → ditolak §5.1', e2?.name === 'BludSasaranPerubahanError' && e2.dpaTerakhir === V0, e2?.name)
    const e3 = await galat(() => simpanDpa(M, dariP1(), { asal: { sumber_dasar: 'DPA', versi_dasar: V0 } }))
    periksa('Dasar yang bukan pagu sekarang → DASAR_BERGESER', e3?.name === 'BludDasarPerubahanBergeserError', e3?.name)
    periksa('…tidak ada yang tertulis', (await penanda()).length === 0 && (await getDpaByDate(TAHUN, M)).length === 0)
  }

  console.log('\n── 5. Turunkan di bawah terserap → ditolak, paksa pun ditolak (R2 + R8) ──')
  {
    const e = await galat(() => simpanDpa(M, dariP1({ A: 95, B: 60, C: 20 }), { asal: ASAL }))
    periksa('B 70→60 padahal terserap 65 → PAGU_DIBAWAH_REALISASI', e?.name === 'BludPaguDibawahRealisasiError', e?.name)
    periksa('…dan layar tidak boleh menawarkan paksa (bisaDipaksa=false)', e?.bisaDipaksa === false)
    periksa('…+ turunkan paksa → TETAP ditolak (R8)',
      await tangkap(() => simpanDpa(M, dariP1({ A: 95, B: 60, C: 20 }), { asal: ASAL, paksa: true })) === 'BludPaksaPerubahanError')
    periksa('…penanda tidak tertulis', (await penanda()).length === 0)
  }

  console.log('\n── 6a. Buang baris dasar → ditolak (R4) ──')
  {
    const rows = dariP1({ A: 95, C: 20 }).filter(r => r.row_id !== 'r-C')
    rows.find(r => r.row_id === 'r-I').jumlah = rows.filter(r => r.parent_id).reduce((s, r) => s + r.jumlah, 0)
    const e = await galat(() => simpanDpa(M, rows, { asal: ASAL, force: true }))
    periksa('C dibuang → BARIS_DASAR_DIHAPUS, force tidak menembus', e?.name === 'BludBarisDasarHilangError' && e.hilang?.[0]?.anggaran_key === 'AK-uji-C', e?.name)
  }

  console.log('\n── 1. Buat Perubahan dari pergeseran ──')
  let keyD = null
  {
    // Isian Sebelum PALSU dari klien — harus diabaikan server.
    const rows = dariP1({ A: 95, C: 20 }).map(r => ({ ...r, vol_sebelum: 999, satuan_sebelum: 'palsu', harga_sebelum: 999, jumlah_sebelum: 999 }))
    const r = await simpanDpa(M, rows, { asal: ASAL })
    keyD = r.jangkar['r-D']
    const p = await penanda()
    periksa('Penanda tertulis (PERGESERAN, dasar P1)', p.length === 1 && p[0].mulai === M && p[0].sumber_dasar === 'PERGESERAN' && p[0].dasar === P1)
    const k = perKunci(await getDpaByDate(TAHUN, M))
    periksa('Sebelum A/B/C = angka pergeseran dasar (80/70/30)',
      k.get('AK-uji-A').jumlah_sebelum === 80 * JT && k.get('AK-uji-B').jumlah_sebelum === 70 * JT && k.get('AK-uji-C').jumlah_sebelum === 30 * JT)
    periksa('Sebelum induk I = 180 (total akar Sebelum = total dasar)', k.get('AK-uji-I').jumlah_sebelum === 180 * JT)
    periksa('Isian Sebelum palsu dari klien diabaikan', ![...k.values()].some(b => b.jumlah_sebelum === 999 || b.satuan_sebelum === 'palsu'))
    periksa('Rekening baru D: Sebelum NULL', keyD && k.get(keyD).jumlah_sebelum === null && k.get(keyD).vol_sebelum === null)
    periksa('Jangkar A/B/C tetap (realisasi menempel)', k.has('AK-uji-A') && k.has('AK-uji-B') && k.has('AK-uji-C'))
    const s = await getPaguSumber(TAHUN)
    periksa('getPaguSumber pindah ke DPA Perubahan ke-1', s.sumber === 'DPA' && s.versi === M && s.perubahan_ke === 1, `${s.sumber} ${s.versi}`)
    const ef = perKunci(await getPaguEfektif(TAHUN))
    periksa('Rekening baru D muncul di getPaguEfektif (25 jt)', ef.get(keyD)?.pagu === 25 * JT)
    periksa('Pagu A = 95, C = 20', ef.get('AK-uji-A')?.pagu === 95 * JT && ef.get('AK-uji-C')?.pagu === 20 * JT)
  }

  console.log('\n── 4. Pembuatan ganda ──')
  {
    // (a) Dua pembuatan berbarengan di tanggal yang sama: kunci setahun membuatnya
    // berurutan, yang kedua melihat tanggalnya sudah berisi.
    const Z = '2099-12-01'
    const hasil = await Promise.allSettled([
      simpanDpa(Z, dariP1({ A: 95, C: 20 }), { asal: { sumber_dasar: 'DPA', versi_dasar: M } }),
      simpanDpa(Z, dariP1({ A: 95, C: 20 }), { asal: { sumber_dasar: 'DPA', versi_dasar: M } }),
    ])
    const ok = hasil.filter(h => h.status === 'fulfilled').length
    periksa('Dua pembuatan berbarengan → tepat satu yang lolos', ok === 1, hasil.map(h => h.status === 'fulfilled' ? 'ok' : h.reason?.name).join(' / '))
    periksa('…penanda di tanggal itu tepat satu', (await penanda()).filter(p => p.mulai === Z).length === 1)
    await deleteDpaVersi(TAHUN, Z)
    periksa('…dan hapus versinya membuang penandanya', (await penanda()).every(p => p.mulai !== Z))
    // (b) PRIMARY KEY sebagai pagar terakhir: penanda yatim di tanggal kosong.
    await sql`INSERT INTO blud_dpa_perubahan (tahun_anggaran, versi_mulai, sumber_dasar, versi_dasar, dibuat_pada)
              VALUES (${TAHUN}, ${Z}, 'DPA', ${M}, '2099-12-01 00:00:00')`
    const e = await galat(() => simpanDpa(Z, dariP1({ A: 95, C: 20 }), { asal: { sumber_dasar: 'DPA', versi_dasar: M } }))
    periksa('Penanda sudah ada di tanggal itu → PRIMARY KEY menolak', e?.name === 'BludPerubahanGandaError', e?.name)
    periksa('…dan barisnya ikut batal (satu transaksi)', (await getDpaByDate(TAHUN, Z)).length === 0)
    await sql`DELETE FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN} AND versi_mulai = ${Z}`
  }

  console.log('\n── 9 + 6b. Revisi keesokan hari: Sebelum tetap; nolkan baris dasar diterima ──')
  {
    const rows = (await getDpaByDate(TAHUN, M)).map((d, i) => ({ ...d, urutan: i }))
    const c = rows.find(r => r.anggaran_key === 'AK-uji-C')
    c.vol = null; c.harga = null; c.jumlah = 0
    const a = rows.find(r => r.anggaran_key === 'AK-uji-A')
    a.harga = 110 * JT; a.jumlah = 110 * JT
    rows.find(r => r.row_id === 'r-I').jumlah = rows.filter(r => r.parent_id).reduce((s, r) => s + r.jumlah, 0)
    const r = await simpanDpa(M_1, rows)
    periksa('Revisi tanpa asal_perubahan → tetap babak ke-1 (tidak dibuat ulang)', r.perubahan?.ke === 1 && r.perubahan.dibuat === false)
    const k = perKunci(await getDpaByDate(TAHUN, M_1))
    periksa('Sebelum TIDAK berubah (A 80, C 30)', k.get('AK-uji-A').jumlah_sebelum === 80 * JT && k.get('AK-uji-C').jumlah_sebelum === 30 * JT)
    periksa('C dinolkan (tanpa realisasi) diterima, barisnya tetap ada', k.get('AK-uji-C').jumlah === 0)
    periksa('Penanda tetap satu', (await penanda()).length === 1)
  }

  console.log('\n── 8b. Versi dasar pergeseran dikunci ──')
  periksa('Simpan ulang pergeseran dasar P1 → VERSI_DASAR',
    await tangkap(() => simpanPg(P1, V0, pohonPergeseran({ A: 80, B: 70, C: 30 }, { A: 80, B: 70, C: 30 }))) === 'BludVersiDasarError')
  periksa('Hapus pergeseran dasar P1 → VERSI_DASAR', await tangkap(() => deletePergeseranVersi(TAHUN, P1)) === 'BludVersiDasarError')

  console.log('\n── 7. Pergeseran sesudah Perubahan (R6) ──')
  {
    const dpaM1 = await getDpaByDate(TAHUN, M_1)
    const pgDari = (acuanRows) => acuanRows.map((d, i) => ({
      kode_rekening: d.kode_rekening, uraian: d.uraian, vol: d.vol, satuan: d.satuan, harga: d.harga, jumlah: d.jumlah,
      vol_p: d.vol, harga_p: d.harga, pergeseran: d.jumlah, bertambah_berkurang: 0, bertambah: null, berkurang: null,
      penanggung_jawab: null, keterangan: null, tipe_baris: d.tipe_baris, row_id: d.row_id,
      anggaran_key: d.anggaran_key, parent_id: d.parent_id, urutan: i,
    }))
    const e = await galat(() => simpanPg(P2, V0, pgDari(dpaM1)))
    periksa('Pergeseran >= M beracuan DPA murni → ACUAN_SEBELUM_PERUBAHAN', e?.name === 'BludAcuanSebelumPerubahanError' && e.mulai === M, e?.name)

    // §9 — pergeseran babak LAMA bertanggal hari Perubahan (disimpan pagi, Perubahan
    // siang). Disisipkan langsung: lewat savePergeseran ia kini sudah ditolak R6.
    await sql`INSERT INTO pergeseran_dpa (tahun_anggaran, versi_tanggal, dpa_versi_tanggal, kode_rekening, uraian, vol, satuan, harga, jumlah,
                vol_p, harga_p, pergeseran, bertambah_berkurang, tipe_baris, row_id, anggaran_key, parent_id, urutan)
              SELECT tahun_anggaran, ${M}, dpa_versi_tanggal, kode_rekening, uraian, vol, satuan, harga, jumlah,
                vol_p, harga_p, pergeseran, bertambah_berkurang, tipe_baris, row_id, anggaran_key, parent_id, urutan
              FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN} AND versi_tanggal = ${P1}`
    const e2 = await galat(() => savePergeseran(TAHUN, M, M_1, pgDari(dpaM1), USER, 0, true))
    periksa('Babak baru menimpa pergeseran babak lama di tanggal sama → SASARAN_BABAK_LAMA, force tak menembus',
      e2?.name === 'BludSasaranBabakLamaError' && e2.acuanLama === V0 && e2.mulai === M, e2?.name)
    const lama = await getPergeseranByDate(TAHUN, M)
    periksa('…pergeseran babak lama masih utuh', lama.length === pgP1.length && lama.every(r => r.dpa_versi_tanggal === V0))
    await sql`DELETE FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN} AND versi_tanggal = ${M}`

    await simpanPg(P2, M_1, pgDari(dpaM1))
    const s = await getPaguSumber(TAHUN)
    periksa('Beracuan DPA Perubahan → diterima DAN jadi sumber pagu', s.sumber === 'PERGESERAN' && s.versi === P2 && s.perubahan_ke === 1, `${s.sumber} ${s.versi}`)
  }

  console.log('\n── 11. Perubahan ke-2 ──')
  {
    const pgP2 = await getPergeseranByDate(TAHUN, P2)
    const rows = pgP2.map((p, i) => pergeseranKeDpaInput(p, i))
    const a = rows.find(r => r.anggaran_key === 'AK-uji-A')
    a.harga = 120 * JT; a.jumlah = 120 * JT
    rows.find(r => r.row_id === 'r-I').jumlah = rows.filter(r => r.parent_id).reduce((s, r) => s + r.jumlah, 0)
    const r = await simpanDpa(M2, rows, { asal: { sumber_dasar: 'PERGESERAN', versi_dasar: P2 } })
    periksa('Nomor ke-2', r.perubahan?.ke === 2 && r.perubahan.dibuat === true)
    const k = perKunci(await getDpaByDate(TAHUN, M2))
    periksa('Sebelum dari dasar BARU (P2: A 110, C 0)', k.get('AK-uji-A').jumlah_sebelum === 110 * JT && k.get('AK-uji-C').jumlah_sebelum === 0)
    const s = await getPaguSumber(TAHUN)
    periksa('getPaguSumber → DPA Perubahan ke-2', s.sumber === 'DPA' && s.versi === M2 && s.perubahan_ke === 2)
    // Kembali ke keadaan sebelum ke-2: hapus M2, lalu pergeseran P2.
    const h = await deleteDpaVersi(TAHUN, M2)
    periksa('Hapus Perubahan ke-2 → penandanya ikut dibuang', h.penanda_dibuang === 1 && (await penanda()).length === 1)
    await deletePergeseranVersi(TAHUN, P2)
  }

  console.log('\n── 10. Hapus Perubahan sesudah belanja di rekening D (R5) ──')
  {
    await serap(keyD, 10 * JT)
    periksa('Hapus revisi (penerus = versi Perubahan M, D masih 25) → boleh', await tangkap(() => deleteDpaVersi(TAHUN, M_1)) === null)
    const e = await galat(() => deleteDpaVersi(TAHUN, M))
    periksa('Hapus Perubahan terakhir, D terserap → VERSI_TERPAKAI', e?.name === 'BludVersiTerpakaiError' && e.bentrok?.some(b => b.anggaran_key === keyD && b.hilang), e?.name)
    periksa('…penerusnya pergeseran lama (P1)', e?.penerus === P1, e?.penerus)
    periksa('…penanda masih ada', (await penanda()).length === 1)
    await sql`DELETE t FROM blud_realisasi_tx t JOIN blud_realisasi_alokasi a ON a.tx_id = t.id
              WHERE t.tahun_anggaran = ${TAHUN} AND a.anggaran_key = ${keyD}`
    const h = await deleteDpaVersi(TAHUN, M)
    periksa('Tanpa realisasi D → diterima, penanda hilang', h.penanda_dibuang === 1 && (await penanda()).length === 0)
    const s = await getPaguSumber(TAHUN)
    periksa('Pagu kembali ke pergeseran lama (P1), babak null', s.sumber === 'PERGESERAN' && s.versi === P1 && s.perubahan_ke === null, `${s.sumber} ${s.versi}`)
  }
} finally {
  await bersihkan()
  const sisa = await sql`
    SELECT (SELECT COUNT(*) FROM dpa_blud WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM pergeseran_dpa WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_dpa_perubahan WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_realisasi_tx WHERE tahun_anggaran = ${TAHUN})
         + (SELECT COUNT(*) FROM blud_riwayat_simpan WHERE tahun_anggaran = ${TAHUN}) AS n
  `
  periksa('Kotak pasir 2099 bersih setelah uji', Number(sisa[0]?.n ?? -1) === 0)
}

console.log(gagal === 0 ? `\n${jalan} pemeriksaan LULUS` : `\n${gagal} dari ${jalan} pemeriksaan GAGAL`)
process.exit(gagal === 0 ? 0 : 1)
