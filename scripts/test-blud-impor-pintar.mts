// scripts/test-blud-impor-pintar.mts
// Penjaga "impor yang lebih pintar" + "impor formulir di atas versi terbuka" —
// konsep docs/konsep/blud/CONCEPT-blud-impor-formulir-baru.md (2026-11-26).
//
// Pemicunya berkas nyata `draft anggaran 2027.xlsx`: rumus BELANJA MODAL berbunyi
// `=F399+F517+F525` — menunjuk cucu (525), melompati "Belanja Modal Aset Lainnya" (524).
// Pembaca lama memasang 525 di bawah 524, lalu 524 lepas jadi akar kedua (L1) dan
// pratinjau berselisih Rp 70 juta.
//
//   A. K1 — rantai yang dilompati disambung, tapi hanya kalau angkanya membuktikan
//   B. K2 — baris yang dilupakan rentang SUM: dihitung, dilaporkan, bisa dilewati
//   C. K3 — induk berangka ketikan: induk dari awalan kode
//   D. K4 — dijumlah dua kali: kode yang memutuskan tempatnya, dilaporkan
//   E. K5 — kode satu kolom: tanpa "berbeda pendapat" palsu, bentrok kode disebut
//   F. K6 — angka di kolom Penanggung Jawab
//   G. pasangkanJangkar — formulir luar di atas versi terbuka
//   H. adaPeriodeKosong — kalimat kunci hanya menyebut jalan yang ada
//   I. Sambungan layar/route
//   J. Kalibrasi berkas nyata (opsional): berkas salah-rumus & berkas yang dibetulkan
//      wajib menghasilkan pohon IDENTIK. Berkas TIDAK di-commit (repo publik).
//
// Jalankan: npx tsx scripts/test-blud-impor-pintar.mts [berkas-asli.xlsx berkas-dibetulkan.xlsx]

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type ExcelJS from 'exceljs'
import { loadExcelJs } from '../lib/shared/excel-export'
import { bacaGridDpa } from '../lib/blud/import-dpa-grid'
import { bacaDpaDariGrid, type HasilBacaDpa } from '../lib/blud/import-dpa'
import { pasangkanJangkar } from '../lib/blud/impor-balik'
import { segmenKodeNormal, indukDariAwalanKode } from '../lib/blud/import-rapikan'
import { adaPeriodeKosong } from '../lib/blud/tanggal'
import { AsalImporSchema } from '../lib/blud/schemas'

const AKAR = join(import.meta.dirname, '..')
const baca = (p: string) => readFileSync(join(AKAR, p), 'utf8')

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(70)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(70)} ${catatan}`) }
}

/** [kode, uraian, vol, satuan, harga, jumlah (angka | [rumus, hasil]), pj?] — data mulai b.9. */
type Baris = [string, string, number | null, string | null, number | null, number | [string, number] | null, string?]

async function berkas(isi: Baris[]): Promise<HasilBacaDpa> {
  const ExcelJSLib = await loadExcelJs()
  const wb: ExcelJS.Workbook = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet('BLUD 2099')
  ws.getRow(2).getCell(1).value = 'RSJD UJI'
  ws.getRow(8).values = ['Kode Rekening', 'Uraian', 'Vol', 'Sat', 'Harga', 'Jumlah', 'Penanggung Jawab']
  isi.forEach((b, i) => {
    const r = ws.getRow(9 + i)
    if (b[0]) r.getCell(1).value = b[0]
    r.getCell(2).value = b[1]
    if (b[2] != null) r.getCell(3).value = b[2]
    if (b[3] != null) r.getCell(4).value = b[3]
    if (b[4] != null) r.getCell(5).value = b[4]
    const j = b[5]
    if (Array.isArray(j)) r.getCell(6).value = { formula: j[0], result: j[1] } as ExcelJS.CellFormulaValue
    else if (j != null) r.getCell(6).value = j
    if (b[6]) r.getCell(7).value = b[6]
  })
  return bacaDpaDariGrid(await bacaGridDpa(Buffer.from(await wb.xlsx.writeBuffer())))
}

const induk = (h: HasilBacaDpa, b: number) => h.baris.find(x => x.barisExcel === b)?.indukBarisExcel ?? null
const akar = (h: HasilBacaDpa) => h.baris.filter(b => b.indukBarisExcel == null).map(b => b.barisExcel)
const pohon = (h: HasilBacaDpa) => JSON.stringify(h.baris.map(b => [b.barisExcel, b.indukBarisExcel, b.tipe_baris, b.jumlahHitung]))
const ada = (h: HasilBacaDpa, pola: RegExp) => h.peringatan.some(p => pola.test(p))

/** Bentuk 2027 diperkecil. `rumusModal` = rumus BELANJA MODAL (b.10). */
const bentuk2027 = (rumusModal: string, hasilModal = 175): Baris[] => [
  ['',          'BELANJA DAERAH',            null, null, null, ['F10', hasilModal]],
  ['5.2',       'BELANJA MODAL',             null, null, null, [rumusModal, hasilModal]],
  ['5.2.02',    'Peralatan',                 1, 'unit', 100, ['C11*E11', 100]],
  ['5.2.6',     'Belanja Modal Aset Lainnya', null, null, null, ['SUM(F13:F13)', 75]],
  ['5.2.06.99', 'Aset Lainnya BLUD',         null, null, null, ['F14', 75]],
  ['',          'Anti virus',                1, 'th', 75, ['C14*E14', 75]],
]

// ─── A. K1 ──────────────────────────────────────────────────────────────────
console.log('\n── A. K1 rantai yang dilompati ──')
{
  const salah = await berkas(bentuk2027('F11+F13'))
  const benar = await berkas(bentuk2027('F11+F12'))
  cek('A1 berkas benar: satu akar, cocok', akar(benar).join() === '9' && benar.totalFile === benar.totalHitung)
  cek('A2 berkas salah-rumus: b.12 dipasang di bawah b.10', induk(salah, 12) === 10, String(induk(salah, 12)))
  cek('A3 berkas salah-rumus: satu akar, total cocok 175', akar(salah).join() === '9' && salah.totalHitung === 175 && salah.totalFile === 175,
    `${akar(salah)} ${salah.totalFile}/${salah.totalHitung}`)
  cek('A4 pohon salah-rumus IDENTIK dengan yang dibetulkan', pohon(salah) === pohon(benar))
  const p = salah.perbaikan.find(x => x.jenis === 'SAMBUNG_RANTAI')
  cek('A5 pembetulan disebut di panel, menyebut b.10 & b.13', !!p && p.barisExcel === 12 && p.keterangan.includes('b.10') && p.keterangan.includes('b.13'),
    p?.keterangan.slice(0, 80) ?? '')
  cek('A6 berkas benar tanpa pembetulan', benar.perbaikan.length === 0)
  cek('A7 tidak dilaporkan "dijumlah dua kali" maupun "tidak dihitung"', !ada(salah, /dua kali/) && salah.diLuarRumus.length === 0)

  // Lompatan dua tingkat: b.10 menunjuk cicit (b.14).
  const cicit = await berkas(bentuk2027('F11+F14'))
  cek('A8 lompatan dua tingkat: b.12 di bawah b.10, pohon identik', induk(cicit, 12) === 10 && pohon(cicit) === pohon(benar))

  // Angka berkas TIDAK membuktikan → jangan sambung lewat aturan 3.
  const tanpaBukti = await berkas(bentuk2027('F11+F13', 160))
  cek('A9 angka tak cocok: tidak ada SAMBUNG_RANTAI', !tanpaBukti.perbaikan.some(x => x.jenis === 'SAMBUNG_RANTAI'))
  cek('A10 …dan tidak menuduh "dijumlah dua kali"', !ada(tanpaBukti, /dua kali/), tanpaBukti.peringatan.join(' | ').slice(0, 120))
  cek('A11 …dan tidak menyebutnya "tidak dihitung rumus"', tanpaBukti.diLuarRumus.length === 0)
  cek('A12 …selisihnya tetap dilaporkan sebagai sumber selisih', tanpaBukti.sumberSelisih.length > 0)

  // Baris rekap DI BAWAH ikut menjumlah b.11 dan kebetulan angkanya sama dengan akar.
  // Tanpa pagar "induk harus di atas", akar b.9 ikut dipindah ke bawah b.10.
  const rekap = await berkas([
    ['',      'BELANJA DAERAH', null, null, null, ['F12', 50]],
    ['5.1',   'Kelompok',       null, null, null, ['SUM(F11:F11)', 50]],
    ['5.1.1', 'ATK',            1, 'pak', 50, ['C11*E11', 50]],
    ['5.1',   'Rekap kelompok', null, null, null, ['F11', 50]],
  ])
  cek('A13 akar tidak pernah dipindah ke bawah baris di bawahnya', induk(rekap, 9) === null, String(induk(rekap, 9)))
}

// ─── B. K2 ──────────────────────────────────────────────────────────────────
console.log('\n── B. K2 rentang SUM lupa melebar ──')
{
  const h = await berkas([
    ['',      'BELANJA DAERAH', null, null, null, ['F10', 300]],
    ['5.1',   'BELANJA BARANG', null, null, null, ['SUM(F11:F12)', 300]],
    ['5.1.1', 'ATK',            1, 'pak', 100, ['C11*E11', 100]],
    ['5.1.2', 'Listrik',        1, 'bln', 200, ['C12*E12', 200]],
    ['5.1.3', 'Air',            1, 'bln', 50,  ['C13*E13', 50]],
  ])
  cek('B1 baris terlupa ditempel ke induk kodenya', induk(h, 13) === 10)
  cek('B2 PRIMA menghitungnya: total 350 lawan Excel 300', h.totalHitung === 350 && h.totalFile === 300, `${h.totalFile}/${h.totalHitung}`)
  const d = h.diLuarRumus
  cek('B3 disebut satu per satu untuk "Lewati"', d.length === 1 && d[0].barisExcel === 13 && d[0].nilai === 50 && d[0].indukBarisExcel === 10,
    JSON.stringify(d))
  cek('B4 baris di panel K2 tidak diulang di catatan "awalan kode"', !ada(h, /awalan kode rekening/), h.peringatan.join(' | ').slice(0, 120))
}

// ─── C. K3 ──────────────────────────────────────────────────────────────────
console.log('\n── C. K3 induk berangka ketikan ──')
{
  const h = await berkas([
    ['',      'BELANJA DAERAH', null, null, null, ['F10', 300]],
    ['5.1',   'BELANJA BARANG', null, null, null, 300],
    ['5.1.1', 'ATK',            1, 'pak', 100, ['C11*E11', 100]],
    ['5.1.2', 'Listrik',        1, 'bln', 200, ['C12*E12', 200]],
  ])
  cek('C1 anak diambil dari awalan kode', induk(h, 11) === 10 && induk(h, 12) === 10)
  cek('C2 cocok, tanpa selisih & tanpa "tidak dihitung"', h.totalHitung === 300 && h.sumberSelisih.length === 0 && h.diLuarRumus.length === 0)
  cek('C3 disebut sekali: induk dari awalan kode', ada(h, /awalan kode rekening/))
}

// ─── D. K4 ──────────────────────────────────────────────────────────────────
console.log('\n── D. K4 dijumlah dua kali ──')
{
  const h = await berkas([
    ['',      'BELANJA DAERAH', null, null, null, ['F10+F11', 250]],
    ['5.1',   'BARANG',         null, null, null, ['F12', 100]],
    ['5.2',   'MODAL',          null, null, null, ['F12+F13', 150]],
    ['5.1.1', 'ATK',            1, 'pak', 100, ['C12*E12', 100]],
    ['5.2.1', 'Laptop',         1, 'unit', 50, ['C13*E13', 50]],
  ])
  cek('D1 kode yang memutuskan: 5.1.1 di bawah 5.1 (bukan yang terdekat)', induk(h, 12) === 10, String(induk(h, 12)))
  cek('D2 disebut "dijumlah dua kali" dengan kedua induknya',
    ada(h, /dijumlah dua kali/) && h.peringatan.some(p => /b\.12 ATK/.test(p) && /b\.10/.test(p) && /b\.11/.test(p)))
  cek('D3 PRIMA menghitung sekali: 150', h.totalHitung === 150, String(h.totalHitung))
}

// ─── E. K5 ──────────────────────────────────────────────────────────────────
console.log('\n── E. K5 kode satu kolom ──')
{
  const salah = await berkas(bentuk2027('F11+F13'))
  cek('E1 tidak ada lagi "berbeda pendapat" untuk kode satu kolom', !ada(salah, /berbeda pendapat/))
  const bentrok = await berkas([
    ['',          'BELANJA DAERAH', null, null, null, ['F10', 300]],
    ['5.2.02',    'BELANJA MODAL',  null, null, null, ['F11+F12', 300]],
    ['5.2.02.99', 'Peralatan',      1, 'unit', 100, ['C11*E11', 100]],
    ['5.2.03',    'Gedung',         1, 'unit', 200, ['C12*E12', 200]],
  ])
  cek('E2 bentrok kode disebut barisnya', bentrok.peringatan.some(p => /b\.10 BELANJA MODAL \(5\.2\.02\) membawahi 5\.2\.03/.test(p)),
    bentrok.peringatan.join(' | ').slice(0, 140))
  const sama = await berkas([
    ['',             'BELANJA DAERAH', null, null, null, ['F10', 100]],
    ['5.1.02.99.99', 'BARANG',         null, null, null, ['F11', 100]],
    ['5.1.02.99.99', 'BARANG BLUD',    1, 'pak', 100, ['C11*E11', 100]],
  ])
  cek('E3 kode sama dengan induknya bukan bentrok', !ada(sama, /tidak sejalan/))
  cek('E4 segmen dinormalkan: 5.2.06 = 5.2.6', segmenKodeNormal('5.2.06.99').join('.') === '5.2.6.99')
  cek('E5 awalan terpanjang menang', JSON.stringify(indukDariAwalanKode(['5', '5.2', '5.1', '5.2.6', ''])) === '[null,0,0,1,null]')
}

// ─── F. K6 ──────────────────────────────────────────────────────────────────
console.log('\n── F. K6 angka di kolom PJ ──')
{
  const h = await berkas([
    ['',    'BELANJA DAERAH', null, null, null, ['F10', 100], '291000000'],
    ['5.1', 'ATK',            1, 'pak', 100, ['C10*E10', 100], 'Kasubbag Umum'],
  ])
  const b9 = h.baris.find(b => b.barisExcel === 9)!
  cek('F1 angka tidak jadi PJ dan tidak dipindah ke keterangan', b9.penanggungJawab === null && !(b9.keterangan ?? '').includes('291000000'))
  cek('F2 disebut sekali sebagai hitungan bantu', ada(h, /angka di kolom Penanggung Jawab \(b\.9\)/))
  cek('F3 nama PJ biasa tetap terbaca', h.baris.find(b => b.barisExcel === 10)?.penanggungJawab === 'Kasubbag Umum')
}

// ─── G. pasangkanJangkar ────────────────────────────────────────────────────
console.log('\n── G. pasangkanJangkar ──')
{
  const versi = [
    { kode_rekening: '5.2.06.99', uraian: 'Aset Lainnya BLUD', anggaran_key: 'AK-1' },
    { kode_rekening: '5.1.1',     uraian: 'ATK',               anggaran_key: 'AK-2' },
    { kode_rekening: '5.1.2',     uraian: 'Listrik lama',      anggaran_key: 'AK-3' },
    { kode_rekening: '',          uraian: 'Honor',             anggaran_key: 'AK-4' },
    { kode_rekening: '',          uraian: 'Honor',             anggaran_key: 'AK-5' },
    { kode_rekening: '5.9',       uraian: 'Tanpa kunci',       anggaran_key: null },
  ]
  const berkasBaris = [
    { barisExcel: 9,  kode: '5.2.6.99', uraian: 'aset  lainnya blud' },
    { barisExcel: 10, kode: '5.1.1',    uraian: 'ATK' },
    { barisExcel: 11, kode: '5.1.02',   uraian: 'Listrik baru' },
    { barisExcel: 12, kode: '',         uraian: 'Honor' },
    { barisExcel: 13, kode: '5.3',      uraian: 'Baru sama sekali' },
    { barisExcel: 14, kode: '5.1.1',    uraian: 'ATK', jangkar: 'AK-X' },
  ]
  const p = pasangkanJangkar(versi, berkasBaris)
  cek('G1 kode dinormalkan + uraian dirapikan', p.pasangan[9] === 'AK-1')
  cek('G2 kode+uraian sama persis', p.pasangan[10] === 'AK-2')
  cek('G3 kode saja bila tunggal di kedua sisi', p.pasangan[11] === 'AK-3')
  cek('G4 calon kembar tidak dipasangkan, dihitung berebut', p.pasangan[12] == null && p.berebut === 1, String(p.berebut))
  cek('G5 baris baru & baris berjangkar tidak disentuh', p.pasangan[13] == null && p.pasangan[14] == null)
  cek('G6 satu kunci hanya dipakai sekali', new Set(Object.values(p.pasangan)).size === Object.values(p.pasangan).length)
  cek('G7 Zod: jejak audit formulir di atas versi diterima',
    AsalImporSchema.safeParse({ berkas: 'a.xlsx', lembar: 'BLUD', baris: 5, di_atas_versi: '2099-09-30', jangkar_dipasangkan: 3 }).success)
}

// ─── H. adaPeriodeKosong ────────────────────────────────────────────────────
console.log('\n── H. adaPeriodeKosong ──')
{
  const nov2026 = Date.UTC(2026, 10, 26, 3)
  cek('H1 tahun yang belum berjalan: tidak ada periode kosong', !adaPeriodeKosong(2027, ['2026-09-30'], nov2026))
  cek('H2 tahun berjalan dengan bulan kosong: ada', adaPeriodeKosong(2026, ['2026-01-31'], nov2026))
  const penuh = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-28`)
  cek('H3 semua bulan lewat sudah berarsip: tidak ada', !adaPeriodeKosong(2026, penuh, nov2026))
}

// ─── I. Sambungan ───────────────────────────────────────────────────────────
console.log('\n── I. Sambungan ──')
{
  const kode = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const rute = kode(baca('app/api/blud/dpa/import/route.ts'))
  cek('I1 route: formulir tanpa Jangkar di atas versi → pasangkanJangkar, bukan penolakan',
    /versiTerbukaParsed\.success && hasil\.kolom\.jangkar == null\)[\s\S]{0,300}pasangkanJangkar\(barisVersi\.map\(dpaKeInput\), hasil\.baris\)/.test(rute))
  cek('I2 route: sasaranSama dihitung server', rute.includes('sasaranSama: sasaranParsed.success && sasaranParsed.data === versi'))
  cek('I3 route: realisasi terdampak memakai jangkar pasangan', rute.includes('gantiIsi?.pasangan[b.barisExcel] ?? b.jangkar'))
  cek('I4 route: diLuarRumus & gantiIsi ikut jawaban', rute.includes('diLuarRumus: hasil.diLuarRumus,') && /\bgantiIsi,\n/.test(rute))

  const modal = kode(baca('components/blud/ImportDpaModal.tsx'))
  cek('I5 modal: baris dilewati + turunannya dibuang', modal.includes('.filter(b => !buang.has(b.barisExcel))'))
  cek('I6 modal: jangkar pasangan dipasang hanya pada baris tanpa jangkar', modal.includes('return key && !b.jangkar ? { ...b, jangkar: key } : b'))
  cek('I7 modal: ganti isi membawa angka kunci segar & jejak audit',
    modal.includes('onTerapkan(keDpaBarisInput(barisDipakai), { ...asal, di_atas_versi: ganti.versi, jangkar_dipasangkan: dipasangkan }, ganti.simpananKini)'))
  cek('I8 modal: sasaran = versi terbuka ditanyakan dulu', modal.includes('...(g?.sasaranSama'))
  cek('I9 modal: tidak ada lagi kalimat "periode yang belum punya versi"', !modal.includes('belum punya versi'))
  cek('I9b modal: pratinjau & neraca dihitung ulang tanpa baris yang dilewati',
    modal.includes('data={pratinjau}') && modal.includes('const hitung = recalcDpaJumlah(keDpaBarisInput(barisDipakai))'))

  const dpa = kode(baca('app/(dashboard)/blud/dpa/dpa-client.tsx'))
  const badan = dpa.slice(dpa.indexOf('function terapkanImpor'), dpa.indexOf('async function bukaImpor'))
  cek('I10 terapkanImpor: ganti isi tidak melepas versi',
    badan.includes('const gantiIsi = !!asal.di_atas_versi && asal.di_atas_versi === versi')
      && badan.includes('if (balik || gantiIsi) { if (simpananKini != null) setVersion(simpananKini) }'))
  cek('I11 terapkanImpor & Form Baru: sasaran Simpan tidak disentuh',
    !badan.includes('setPeriodeTulis(')
      && !dpa.slice(dpa.indexOf('function executeBuildForm'), dpa.indexOf('function executeBuildForm') + 900).includes('setPeriodeTulis('))
  cek('I12 Form Baru tidak lagi dikunci', !dpa.includes('alasanKunciBorongan') && dpa.includes('data-tooltip={tooltipFormBaru}'))
  cek('I13 dialog Form Baru menyebut akibat Simpan & realisasi', dpa.includes('Simpan akan menahan rekening yang hilang'))

  const pgs = kode(baca('app/(dashboard)/blud/pergeseran/pergeseran-client.tsx'))
  cek('I14 Pergeseran: kalimat kunci bergantung adaPeriodeKosong', pgs.includes('kunciBabakLama ?? (adaPeriodeKosong(tahun, history.map(h => h.versi_tanggal))'))
  cek('I15 Pergeseran: tanpa periode kosong menunjuk Sinkronkan DPA', pgs.includes('pakai Sinkronkan DPA'))
  cek('I16 periksaImporBalik tidak lagi menerima formulir luar', !kode(baca('lib/blud/impor-balik.ts')).includes('adaKolomJangkar'))
}

// ─── J. Kalibrasi berkas nyata ──────────────────────────────────────────────
console.log('\n── J. Kalibrasi (opsional) ──')
{
  const [asli, dibetulkan] = process.argv.slice(2)
  if (!asli || !dibetulkan || !existsSync(asli) || !existsSync(dibetulkan)) {
    console.log('  (dilewati — berikan dua path: berkas salah-rumus dan berkas yang sudah dibetulkan)')
  } else {
    const hA = bacaDpaDariGrid(await bacaGridDpa(readFileSync(asli)))
    const hB = bacaDpaDariGrid(await bacaGridDpa(readFileSync(dibetulkan)))
    cek('J1 kedua berkas: pohon IDENTIK (induk, level, angka tiap baris)', pohon(hA) === pohon(hB))
    cek('J2 berkas salah-rumus: satu akar & selisih nol', akar(hA).length === 1 && hA.totalFile === hA.totalHitung,
      `${akar(hA).length} akar, ${hA.totalFile}/${hA.totalHitung}`)
    cek('J3 pembetulan disebut di panel', hA.perbaikan.some(p => p.jenis === 'SAMBUNG_RANTAI'))
    cek('J4 tanpa peringatan palsu "berbeda pendapat"', !ada(hA, /berbeda pendapat/))
  }
}

console.log(`\n${lulus} lulus · ${gagal} gagal`)
if (gagal) process.exit(1)
