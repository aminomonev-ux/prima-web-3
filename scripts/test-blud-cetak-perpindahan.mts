// scripts/test-blud-cetak-perpindahan.mts — Catatan Perpindahan sampai ke berkas.
// Konsep: docs/CONCEPT-blud-cetak-perpindahan.md
//
// Tiga hal yang dijaga di sini:
//
//   T1  kepala tabel dan datanya sejajar. `renderPergeseranView` memulangkan 14
//       nilai per baris sejak L86 menambah Bertambah/Berkurang, sementara
//       `buildMeta` di kedua eksporter masih memakai daftar 12 kolom — dari
//       kolom ke-10 ke kanan nama kolom berhenti menerangkan angka di bawahnya,
//       tanpa satu galat pun.
//   T2  catatan perpindahan ikut ke dokumen. Tanpa `mutasi`, `uraiGeser` jatuh
//       ke turunan selisih: rekening yang menerima 45jt lalu melepas 12jt
//       tercetak "33 / —" padahal layar menunjukkan "45 / 12".
//   T3  daftar perpindahannya sendiri — view baru + lembar kedua dokumen resmi.
//
// Diuji lewat jalur SUNGGUHAN: `renderCetakHtml` dan `buatWorkbookPergeseran`,
// yang sama dengan tombol Cetak dan tombol Excel. Yang tidak bisa dijalankan di
// Node (jspdf butuh DOM) diperiksa dari sumbernya, dan kutipannya UTUH sampai
// kurung buka — potongan pendek ikut cocok pada baris tetangganya (L82c).
//
// Jalankan: npx tsx scripts/test-blud-cetak-perpindahan.mts

import fs from 'node:fs'
import path from 'node:path'
import type ExcelJS from 'exceljs'
import { renderCetakHtml, kalimatCakupan, saringYangBergeser } from '../lib/blud/cetak-data'
import { buatWorkbookDpa, buatWorkbookPergeseran } from '../lib/blud/export/dpa-dokumen'
import { periksaMutasi, type MutasiInput } from '../lib/blud/mutasi'
import type { DpaBaris, PergeseranBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(62)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(62)} ${catatan}`) }
}

const repo = path.join(import.meta.dirname, '..')
const baca = (p: string) => fs.readFileSync(path.join(repo, p), 'utf8')
/** Buang komentar dulu — prosa yang menjelaskan bug lama tidak boleh menyalakkan
 *  tesnya sendiri, dan tidak boleh menggeser kode yang diperiksa ke luar jendela. */
const kode = (p: string) => baca(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const dasar = {
  id: 0, tahun_anggaran: 2026, versi_tanggal: '2026-01-31', dpa_versi_tanggal: '2026-01-31',
  satuan: 'th', parent_id: null, anggaran_key: null, origin: null,
  usulan_item_id: null, usulan_no: null, penanggung_jawab: null, keterangan: null,
  bertambah: null, berkurang: null,
} as unknown as PergeseranBaris

function baris(o: Record<string, unknown>): PergeseranBaris {
  const jumlah = Number(o.jumlah ?? 0)
  const pergeseran = Number(o.pergeseran ?? 0)
  return { ...dasar, ...o, jumlah, pergeseran, bertambah_berkurang: pergeseran - jumlah } as unknown as PergeseranBaris
}

/**
 * Pohon utama — kasus "45 / 12" dari konsep, dan sekaligus yang membuktikan
 * rollup induk mengabaikan uraian tangan yang tertinggal di baris induk.
 *
 *   A  100jt → 55jt   (−45)  melepas 45 ke B
 *   B   50jt → 83jt   (+33)  menerima 45 dari A, melepas 12 ke C
 *   C   30jt → 42jt   (+12)  menerima 12 dari B
 */
function pohon(): PergeseranBaris[] {
  return [
    baris({ row_id: 'induk', tipe_baris: 'MASTER', urutan: 1, kode_rekening: '5.1',
      uraian: 'BELANJA OPERASI', vol: null, harga: null, vol_p: null, harga_p: null,
      jumlah: 180_000_000, pergeseran: 180_000_000,
      // Uraian tangan di baris INDUK harus kalah oleh rollup anak-anaknya.
      bertambah: 999_999_999, berkurang: 999_999_999 }),
    baris({ row_id: 'A', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 2, kode_rekening: '5.1.01',
      uraian: 'Alat tulis kantor', vol: 1, harga: 100_000_000, vol_p: 1, harga_p: 55_000_000,
      jumlah: 100_000_000, pergeseran: 55_000_000 }),
    baris({ row_id: 'B', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 3, kode_rekening: '5.1.02',
      uraian: 'Belanja listrik', vol: 1, harga: 50_000_000, vol_p: 1, harga_p: 83_000_000,
      jumlah: 50_000_000, pergeseran: 83_000_000,
      penanggung_jawab: 'Kasubbag Umum', keterangan: 'tambah daya' }),
    baris({ row_id: 'C', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 4, kode_rekening: '5.1.03',
      uraian: 'Belanja air', vol: 1, harga: 30_000_000, vol_p: 1, harga_p: 42_000_000,
      jumlah: 30_000_000, pergeseran: 42_000_000 }),
  ]
}

const mutasiUtama: MutasiInput[] = [
  { dari_row: 'A', ke_row: 'B', nilai: 45_000_000, keterangan: 'kegiatan batal' },
  { dari_row: 'B', ke_row: 'C', nilai: 12_000_000, keterangan: null },
]

/**
 * Pohon bersih-nol — F menerima 7jt DAN melepas 7jt, jadi selisihnya nol dan
 * `saringYangBergeser` (yang menilai dari selisih) membuangnya. Ini satu-satunya
 * bentuk yang membuat baris bercatatan menghilang dari cetakan; data uji
 * "E turun, G naik" tidak akan pernah menemukannya karena keduanya lolos saring.
 */
function pohonBersihNol(): PergeseranBaris[] {
  return [
    baris({ row_id: 'induk', tipe_baris: 'MASTER', urutan: 1, kode_rekening: '5.2',
      uraian: 'BELANJA MODAL', vol: null, harga: null, vol_p: null, harga_p: null,
      jumlah: 180_000_000, pergeseran: 180_000_000 }),
    baris({ row_id: 'E', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 2, kode_rekening: '5.2.01',
      uraian: 'Meja', vol: 1, harga: 100_000_000, vol_p: 1, harga_p: 93_000_000,
      jumlah: 100_000_000, pergeseran: 93_000_000 }),
    baris({ row_id: 'F', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 3, kode_rekening: '5.2.02',
      uraian: 'Kursi', vol: 1, harga: 50_000_000, vol_p: 1, harga_p: 50_000_000,
      jumlah: 50_000_000, pergeseran: 50_000_000 }),
    baris({ row_id: 'G', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 4, kode_rekening: '5.2.03',
      uraian: 'Lemari', vol: 1, harga: 30_000_000, vol_p: 1, harga_p: 37_000_000,
      jumlah: 30_000_000, pergeseran: 37_000_000 }),
  ]
}

const mutasiBersihNol: MutasiInput[] = [
  { dari_row: 'E', ke_row: 'F', nilai: 7_000_000 },
  { dari_row: 'F', ke_row: 'G', nilai: 7_000_000 },
]

const rekap = (rows: PergeseranBaris[], opsi: { mutasi?: MutasiInput[]; saring?: boolean } = {}) =>
  renderCetakHtml({
    menu: 'pergeseran', view: 'rekapPergeseran', rows,
    versi: '2026-01-31', tanggal: '', hanyaBergeser: opsi.saring, mutasi: opsi.mutasi ?? null,
  })

const perpindahan = (rows: PergeseranBaris[], mutasi: MutasiInput[] | null, saring = false) =>
  renderCetakHtml({
    menu: 'pergeseran', view: 'daftarPerpindahan', rows,
    versi: '2026-01-31', tanggal: '', hanyaBergeser: saring, mutasi,
  })

// ── 0. Pohon ujinya sendiri harus sah ────────────────────────────────────────
console.log('\n── 0. Prasyarat: catatan uji memang cocok dengan pagunya ──')
cek('pohon utama lolos periksaMutasi', periksaMutasi(pohon(), mutasiUtama).length === 0,
  'kalau tidak, route menolaknya dan seluruh tes ini menguji keadaan mustahil')
cek('pohon bersih-nol lolos periksaMutasi', periksaMutasi(pohonBersihNol(), mutasiBersihNol).length === 0)
cek('B memang berselisih +33jt', pohon().find(r => r.row_id === 'B')!.bertambah_berkurang === 33_000_000)
cek('F memang berselisih nol', pohonBersihNol().find(r => r.row_id === 'F')!.bertambah_berkurang === 0)

// ── A. T1: kepala tabel sejajar dengan datanya ───────────────────────────────
console.log('\n── A. T1 — kepala tabel dan data sejajar ──')
{
  const r = rekap(pohon())
  cek('rekap Pergeseran 14 kolom', r.meta.columns.length === 14, `${r.meta.columns.length}`)
  cek('tiap baris ekspor sepanjang kepala tabelnya',
    r.rows.every(b => b.length === r.meta.columns.length),
    'pemeriksaan inilah yang menangkap T1 kalau lahir lagi')
  cek('kolom ke-10..12 Bertambah/Berkurang/Selisih',
    r.meta.columns.slice(9, 12).join('|') === 'Bertambah|Berkurang|Selisih')

  const pdfSrc = kode('lib/blud/export/pdf.ts')
  const xlsSrc = kode('lib/blud/export/excel.ts')
  cek('cadangan buildMeta PDF ikut 14 kolom',
    pdfSrc.includes(`'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih', 'Penanggung Jawab', 'Keterangan'`))
  cek('cadangan buildMeta Excel ikut 14 kolom',
    xlsSrc.includes(`'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih', 'Penanggung Jawab', 'Keterangan'`))
  cek('Excel memformat Bertambah/Berkurang/Selisih sebagai angka',
    xlsSrc.includes('numberColIdx: new Set([2, 4, 5, 6, 7, 8, 9, 10, 11])'))
  cek('PDF memakai kolom kiriman pemanggil',
    pdfSrc.includes('const columns  = args.columns ? [...args.columns] : cadangan.columns'))
  cek('Excel memakai kolom kiriman pemanggil',
    xlsSrc.includes('const columns = args.columns ? [...args.columns] : cadangan.columns'))

  const cl = kode('app/(dashboard)/blud/cetak/cetak-client.tsx')
  cek('cetak-client mengirim meta ke KEDUA eksporter',
    (cl.match(/columns: renderedMeta\?\.columns, title: renderedMeta\?\.title,/g) ?? []).length === 2,
    'dihitung kemunculannya — merusak satu masih menyisakan satunya untuk dicocokkan (L82c)')
}

// ── B. T2: catatan ikut ke rekap ─────────────────────────────────────────────
console.log('\n── B. T2 — catatan perpindahan ikut ke dokumen ──')
{
  const tanpa = rekap(pohon())
  const dengan = rekap(pohon(), { mutasi: mutasiUtama })
  const barisB = (r: ReturnType<typeof rekap>) => r.rows.find(b => b[0] === '5.1.02')!
  const barisInduk = (r: ReturnType<typeof rekap>) => r.rows.find(b => b[0] === '5.1')!

  cek('tanpa catatan B berbunyi 33 / —',
    barisB(tanpa)[9] === 33_000_000 && barisB(tanpa)[10] === 0, 'perilaku lama, sengaja dikunci')
  cek('dengan catatan B berbunyi 45 / 12',
    barisB(dengan)[9] === 45_000_000 && barisB(dengan)[10] === 12_000_000)
  cek('selisih B TIDAK ikut berubah', barisB(dengan)[11] === 33_000_000,
    'catatan menjelaskan pagu, tidak menggesernya')
  cek('rollup induk dijumlah dari anak, bukan dari uraian tangannya sendiri',
    barisInduk(dengan)[9] === 57_000_000 && barisInduk(dengan)[10] === 57_000_000,
    'baris induk menyimpan 999.999.999 yang harus diabaikan')
  cek('rollup induk tanpa catatan tetap 45 / 45',
    barisInduk(tanpa)[9] === 45_000_000 && barisInduk(tanpa)[10] === 45_000_000)
  cek('HTML rekap memuat nominal 45.000.000', dengan.html.includes('45.000.000'))
}

// ── C. T2 di dokumen resmi 14 kolom ──────────────────────────────────────────
console.log('\n── C. T2 — dokumen resmi (workbook sungguhan) ──')
{
  const cariBaris = (ws: ExcelJS.Worksheet, uraian: string) => {
    for (let n = 1; n <= ws.rowCount; n++) {
      if (String(ws.getRow(n).getCell(2).value ?? '').includes(uraian)) return ws.getRow(n)
    }
    return null
  }
  const wbTanpa = await buatWorkbookPergeseran({ rows: pohon(), tahun: 2026, versi: '2026-01-31' })
  const wbDengan = await buatWorkbookPergeseran({ rows: pohon(), tahun: 2026, versi: '2026-01-31', mutasi: mutasiUtama })

  const bTanpa = cariBaris(wbTanpa.worksheets[0], 'Belanja listrik')!
  const bDengan = cariBaris(wbDengan.worksheets[0], 'Belanja listrik')!
  cek('tanpa catatan sel J/K = 33jt / kosong',
    bTanpa.getCell(10).value === 33_000_000 && bTanpa.getCell(11).value === '')
  cek('dengan catatan sel J/K = 45jt / 12jt',
    bDengan.getCell(10).value === 45_000_000 && bDengan.getCell(11).value === 12_000_000)

  cek('tanpa catatan workbook cuma 1 lembar', wbTanpa.worksheets.length === 1,
    'lembar kosong di dokumen yang beredar terbaca seperti ada yang gagal')
  cek('dengan catatan workbook 2 lembar', wbDengan.worksheets.length === 2)
  const ws2 = wbDengan.worksheets[1]
  cek('lembar kedua bernama Perpindahan', ws2?.name === 'Perpindahan', String(ws2?.name))

  const cariKolom1 = (ws: ExcelJS.Worksheet, teks: string) => {
    for (let n = 1; n <= ws.rowCount; n++) {
      if (String(ws.getRow(n).getCell(1).value ?? '').includes(teks)) return ws.getRow(n)
    }
    return null
  }
  cek('lembar Perpindahan memuat baris asal A', !!cariKolom1(ws2!, '5.1.01'))
  cek('lembar Perpindahan memuat keterangan', String(ws2!.getRow(4).getCell(4).value ?? '') === 'kegiatan batal')
  const totalRow = cariKolom1(ws2!, 'TOTAL PERPINDAHAN')
  cek('lembar Perpindahan bertotal 57jt', totalRow?.getCell(3).value === 57_000_000)
}

// ── D. T3: view Daftar Perpindahan ───────────────────────────────────────────
console.log('\n── D. T3 — view Daftar Perpindahan ──')
{
  const v = perpindahan(pohon(), mutasiUtama)
  cek('4 kolom Dari/Ke/Nilai/Keterangan',
    v.meta.columns.join('|') === 'Dari|Ke|Nilai|Keterangan')
  cek('2 perpindahan + 1 baris total', v.rows.length === 3, `${v.rows.length}`)
  cek('tiap baris ekspor sepanjang kepala tabelnya',
    v.rows.every(b => b.length === v.meta.columns.length))
  cek('kolom Dari memuat kode + uraian', String(v.rows[0][0]).startsWith('5.1.01 — Alat tulis'))
  cek('nilainya angka, bukan teks', v.rows[0][2] === 45_000_000)
  cek('baris total = jumlah perpindahan',
    v.rows[2]?.[0] === 'TOTAL PERPINDAHAN' && v.rows[2]?.[2] === 57_000_000)

  const kosong = perpindahan(pohon(), [])
  cek('tanpa catatan: nol baris + keterangan, bukan tabel kosong',
    kosong.rows.length === 0 && kosong.html.includes('Belum ada catatan perpindahan'))

  // Pohon bersih-nol, BUKAN pohon utama: di pohon utama semua daun bergeser,
  // jadi saringan tidak membuang apa pun dan pemeriksaan ini akan selalu lulus.
  const penuh = perpindahan(pohonBersihNol(), mutasiBersihNol)
  const disaring = perpindahan(pohonBersihNol(), mutasiBersihNol, true)
  cek('view ini TIDAK tunduk saringan "hanya yang bergeser"',
    disaring.rows.length === penuh.rows.length && disaring.rows.length === 3,
    'saringan itu sifat view Rekap, bukan sifat dokumennya')
  cek('rekening bersih-nol tetap disebut namanya, bukan "tidak ditemukan"',
    !disaring.rows.some(b => String(b[0]).includes('tidak ditemukan') || String(b[1]).includes('tidak ditemukan')))

  const yatim = perpindahan(pohon(), [{ dari_row: 'A', ke_row: 'HILANG', nilai: 1_000_000 }])
  cek('baris yang sudah tidak ada tetap tercetak, bukan disembunyikan',
    String(yatim.rows[0][1]).includes('baris tidak ditemukan'))
}

// ── E. Baris bersih-nol: saringan membuangnya, spanduk mengakuinya ───────────
console.log('\n── E. Bersih-nol — catatan yang barisnya tidak ikut tercetak ──')
{
  const rows = pohonBersihNol()
  const tampil = saringYangBergeser(rows)
  cek('F memang tersaring keluar', !tampil.some(r => r.row_id === 'F'),
    `${tampil.length} dari ${rows.length} baris`)

  const r = rekap(rows, { mutasi: mutasiBersihNol, saring: true })
  cek('cakupan dilaporkan di meta', !!r.meta.cakupan)
  cek('2 catatan diakui tidak tertampil', r.meta.cakupan?.catatanTakTampil === 2,
    'keduanya menyebut F')
  cek('kalimat cakupan menyebutkannya',
    kalimatCakupan(r.meta.cakupan!).includes('2 catatan perpindahan menyebut rekening yang tidak ditampilkan'))
  cek('spanduk HTML memuat kalimat yang sama',
    r.html.includes('2 catatan perpindahan menyebut rekening yang tidak ditampilkan'))

  const penuh = rekap(rows, { mutasi: mutasiBersihNol })
  cek('tanpa saringan tidak ada yang perlu diakui', !penuh.meta.cakupan)
  cek('tanpa saringan F berbunyi 7 / 7',
    penuh.rows.find(b => b[0] === '5.2.02')![9] === 7_000_000
    && penuh.rows.find(b => b[0] === '5.2.02')![10] === 7_000_000)

  const takBerubah = rekap(rows, { saring: true })
  cek('tanpa catatan cakupan tidak menyebut angka catatan',
    !kalimatCakupan(takBerubah.meta.cakupan!).includes('catatan perpindahan'))
}

// ── F. Yang tidak boleh ikut berubah ─────────────────────────────────────────
console.log('\n── F. Pagar: yang sengaja tidak tersentuh ──')
{
  const pj = renderCetakHtml({
    menu: 'pergeseran', view: 'penanggungJawab', rows: pohon(),
    versi: '2026-01-31', tanggal: '', mutasi: mutasiUtama,
  })
  cek('view PENANGGUNG JAWAB tetap 3 kolom', pj.meta.columns.length === 3,
    'nominalnya pagu; catatan tidak pernah menggeser pagu')

  const cl = kode('app/(dashboard)/blud/cetak/cetak-client.tsx')
  cek('mutasi hanya diambil untuk menu pergeseran',
    cl.includes(`const mutasi = menu === 'pergeseran' ? j.mutasi ?? null : null`))
  cek('dokumen resmi menerima mutasi', cl.includes('mutasi: rawMutasi,'))
  cek('sakelar saringan tidak menyentuh view baru',
    cl.includes(`const bisaSaringBergeser = menu === 'pergeseran' && view === 'rekapPergeseran'`))
  cek('daftar perpindahan terdaftar di dropdown',
    cl.includes(`{ value: 'daftarPerpindahan', label: 'Daftar Perpindahan' },`))

  cek('klien memakai kalimat milik cetak-data, tidak menyalinnya',
    cl.includes('setCatatanCakupan(result.meta.cakupan ? kalimatCakupan(result.meta.cakupan)')
    && !cl.includes('Hanya baris yang bergeser —'),
    'salinan kedua pasti berbeda bunyi begitu satu disunting (L78)')

  const cd = kode('lib/blud/cetak-data.ts')
  cek('buangMutasiYatim dipakai untuk menghitung, bukan menyaring',
    cd.includes('? mutasi.length - buangMutasiYatim(tampil, mutasi).length'))
  cek('uraiGeser rekap menerima mutasi', cd.includes('const urai = uraiGeser(sorted, mutasi)'))
  cek('kalimat cakupan satu sumber',
    (cd.match(/rincianCakupan\(/g) ?? []).length === 3,
    'definisi + spanduk + kalimatCakupan')
}

// ── G. Berkas unduhan memuat kolom yang sama dengan layar ────────────────────
console.log('\n── G. Dokumen resmi sejajar dengan tabel di menu Cetak ──')
{
  const kepala = (ws: ExcelJS.Worksheet) => {
    const b = ws.getRow(6)
    const semua: { nama: string; tersembunyi: boolean }[] = []
    for (let c = 1; c <= 20; c++) {
      const nama = String(b.getCell(c).value ?? '')
      if (!nama) continue
      semua.push({ nama, tersembunyi: ws.getColumn(c).hidden === true })
    }
    return semua
  }

  const wb = await buatWorkbookPergeseran({ rows: pohon(), tahun: 2026, versi: '2026-01-31' })
  const k = kepala(wb.worksheets[0])
  const tampak = k.filter(x => !x.tersembunyi).map(x => x.nama)
  const sembunyi = k.filter(x => x.tersembunyi).map(x => x.nama)

  const layar = rekap(pohon()).meta.columns
  cek('kolom TAMPAK dokumen persis sama dengan tabel di layar',
    tampak.join('|') === layar.join('|'),
    tampak.length === layar.length ? '' : `${tampak.length} vs ${layar.length}`)
  cek('yang disembunyikan HANYA Level & Jangkar',
    sembunyi.join('|') === 'Level|Jangkar', sembunyi.join('|') || '(tidak ada)')
  cek('Penanggung Jawab & Keterangan ikut tercetak',
    tampak.includes('Penanggung Jawab') && tampak.includes('Keterangan'))

  // Kepala tabel yang ada tapi selnya kosong itu kolom yang tidak berguna —
  // diperiksa terpisah dari nama kolomnya.
  const iPj = tampak.indexOf('Penanggung Jawab') + 1
  const iKet = tampak.indexOf('Keterangan') + 1
  let barisB = 0
  wb.worksheets[0].eachRow((row, n) => { if (String(row.getCell(1).value ?? '') === '5.1.02') barisB = n })
  const sel = (k: number) => (k > 0 ? wb.worksheets[0].getRow(barisB).getCell(k).value : null)
  cek('selnya benar-benar terisi dari barisnya',
    sel(iPj) === 'Kasubbag Umum' && sel(iKet) === 'tambah daya',
    `${sel(iPj)} · ${sel(iKet)}`)

  // Kop & blok tanda tangan dimerge selebar kolom yang TAMPAK. Angka mati di
  // sini membuat judulnya berhenti di tengah tabel begitu ada kolom baru.
  const merges: string[] = (wb.worksheets[0].model as { merges?: string[] }).merges ?? []
  const kolomAkhir = (r: string) => r.split(':')[1]?.replace(/\d+/g, '') ?? ''
  const hurufKe = (n: number) => String.fromCharCode(64 + n)
  cek('kop dimerge selebar kolom yang tampak',
    merges.some(r => r.startsWith('A1:') && kolomAkhir(r) === hurufKe(tampak.length)),
    `cari A1:${hurufKe(tampak.length)}1 — ada ${merges.filter(r => r.startsWith('A1')).join(', ') || '(tidak ada)'}`)

  // Kolom cadangan dicari dari NAMANYA, bukan ditulis sebagai angka: waktu L86
  // menyisipkan tiga kolom, indeks tangan [11, 12] tetap diam dan dokumen
  // menyembunyikan Berkurang & Selisih sambil memamerkan Level & Jangkar.
  const dk = kode('lib/blud/export/dpa-dokumen.ts')
  cek('letak kolom cadangan dihitung, bukan ditulis tangan',
    dk.includes('const kolomCadangan = (kolom: readonly string[]): number[] =>')
    && !/selesaikanLembar\(ws, LEBAR_\w+, \[/.test(dk))
  cek('lebar kolom sepanjang daftar kolomnya',
    (dk.match(/const LEBAR_PERGESERAN = \[[^\]]*\]/)?.[0].split(',').length ?? 0) === 16)

  const wbDpa = await buatWorkbookDpa({ rows: pohon() as unknown as DpaBaris[], tahun: 2026, versi: '2026-01-31' })
  const kd = kepala(wbDpa.worksheets[0])
  const layarDpa = renderCetakHtml({
    menu: 'dpa', view: 'dpa', rows: pohon(), versi: '2026-01-31', tanggal: '',
  }).meta.columns
  cek('dokumen DPA juga sejajar dengan layarnya',
    kd.filter(x => !x.tersembunyi).map(x => x.nama).join('|') === layarDpa.join('|'))
  cek('dokumen DPA menyembunyikan Level & Jangkar',
    kd.filter(x => x.tersembunyi).map(x => x.nama).join('|') === 'Level|Jangkar')
}

console.log(`\n${gagal === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL'} — ${lulus} lulus, ${gagal} gagal`)
process.exit(gagal === 0 ? 0 : 1)
