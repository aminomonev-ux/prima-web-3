// scripts/test-renaksi-cetak-kolom.mts — kolom Capaian menu Cetak Renaksi: layar = PDF = Excel.
//
// Sebelum 2026-10-14 tabel layar punya kolom "Capaian", tapi spesifikasi kolom yang dipakai
// PDF & Excel (`cetakHeader`) melompat dari Real Akhir ke Anggaran. Sekaligus: Progres
// Negatif yang belum diisi dulu tercatat 200% — kini "—" (B5–B11, D5, E7, G5–G8). A–E menguji PERILAKU
// sungguhan (spesifikasi kolom, rumus, format, workbook & PDF yang benar-benar dibangun),
// F–G menjaga layar tidak menjauh lagi dari spesifikasi (komentar dibuang dulu — L82c).
//
// Jalankan: npx tsx scripts/test-renaksi-cetak-kolom.mts

import { readFileSync } from 'node:fs'
import type { RaRow } from '../app/(dashboard)/rencana-aksi/_lib/types'
import { capaianTahunan, capaianRpjmd, capaianTriwulan, hitungCapaianPct, realisasiAkhirTahun } from '../app/(dashboard)/rencana-aksi/_lib/types'
import { cetakHeader, tulisSelCetak, tulisCapaian, DEFAULT_CETAK_FILTER, type CetakFilter } from '../app/(dashboard)/rencana-aksi/_lib/cetak-filter'
import { buatWorkbookGabungan, buildCombinedPdf } from '../app/(dashboard)/rencana-aksi/_lib/exports'
import { tulisPersen } from '../lib/shared/desimal'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
function badanFungsi(src: string, awal: string, akhir: string): string {
  const i = src.indexOf(awal)
  const j = src.indexOf(akhir, i + awal.length)
  return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j)
}

const dasar: Omit<RaRow, 'id' | 'level' | 'program' | 'indikator'> = {
  tahun: 2099, kode: null, sasaran: null, tujuan: null,
  outcome_program: null, outcome_kegiatan: null, outcome_sub_kegiatan: null,
  kegiatan: null, sub_kegiatan: null, jenis: 'Akumulatif', satuan: '%',
  target_rpjmd: 0, target_tahunan: 0,
  q1_target: 0, q1_realisasi: 0, q2_target: 0, q2_realisasi: 0,
  q3_target: 0, q3_realisasi: 0, q4_target: 0, q4_realisasi: 0,
  anggaran_nominal: null, bulan_target: null, bulan_realisasi: null, version: 1,
}
const tujuan: RaRow   = { ...dasar, id: 1, level: 'tujuan', program: 'Tujuan Uji', indikator: 'Indeks Tujuan' }
// Akumulatif: 20+30+10+25 = 85 dari target 100 → 85%.
const sasaran: RaRow  = { ...dasar, id: 2, level: 'sasaran', program: 'Sasaran Uji', tujuan: 'Tujuan Uji',
  indikator: 'Persentase Layanan', target_rpjmd: 90, target_tahunan: 100,
  q1_realisasi: 20, q2_realisasi: 30, q3_realisasi: 10, q4_realisasi: 25 }
// Progres Negatif: realisasi 8 dari target 10 → (2 − 0,8) × 100 = 120%.
const program: RaRow  = { ...dasar, id: 3, level: 'program', program: 'Program Uji', sasaran: 'Sasaran Uji',
  indikator: 'Angka Kejadian', jenis: 'Progres Negatif', target_rpjmd: 12, target_tahunan: 10, q4_realisasi: 8 }
// Pecahan: 1 dari 3 → 33,333…% (dua desimal di layar/PDF, utuh di Excel).
const kegiatan: RaRow = { ...dasar, id: 4, level: 'kegiatan', program: 'Program Uji', kegiatan: 'Kegiatan Uji',
  indikator: 'Dokumen Tersusun', target_tahunan: 3, q2_realisasi: 1 }
const sub: RaRow      = { ...dasar, id: 5, level: 'sub-kegiatan', program: 'Program Uji', kegiatan: 'Kegiatan Uji',
  sub_kegiatan: 'Sub Uji', indikator: 'Laporan', target_tahunan: 4, q1_realisasi: 4, anggaran_nominal: 1_500_000 }
// Progres Negatif yang BELUM DIISI (kasus Net Death Rate 2026) — dulu 200% "selesai".
const pnKosong: RaRow = { ...dasar, id: 6, level: 'sasaran', program: 'Sasaran Kedua', tujuan: 'Tujuan Uji',
  indikator: 'Net Death Rate', jenis: 'Progres Negatif', target_rpjmd: 3, target_tahunan: 4 }
const semua = [tujuan, sasaran, program, kegiatan, sub, pnKosong]

// Sub-kegiatan berbulanan: null = belum diisi, 0 = nol SUNGGUHAN (R3).
const bulan = (isi: (number | null)[]) => [...isi, ...Array(12 - isi.length).fill(null)] as (number | null)[]
const pnNolNyata: RaRow = { ...pnKosong, id: 7, level: 'sub-kegiatan', bulan_realisasi: bulan([null, 0]) }
const pnBulanKosong: RaRow = { ...pnKosong, id: 8, level: 'sub-kegiatan', bulan_realisasi: bulan([]), q1_realisasi: 2 }
const pnSebagian: RaRow = { ...pnKosong, id: 9, q1_target: 4, q1_realisasi: 3, q2_target: 4, q2_realisasi: 0 }
const akumKosong: RaRow = { ...sasaran, id: 10, q1_realisasi: 0, q2_realisasi: 0, q3_realisasi: 0, q4_realisasi: 0 }

const kunciEkor = (f: CetakFilter) => cetakHeader(f).tail.map(c => c.key)

console.log('\nA. Spesifikasi kolom')
ok('A1 bawaan: Real Akhir → Capaian → Anggaran',
  JSON.stringify(kunciEkor(DEFAULT_CETAK_FILTER)) === JSON.stringify(['akhir', 'capaian', 'anggaran']),
  JSON.stringify(kunciEkor(DEFAULT_CETAK_FILTER)))
ok('A2 sakelar Realisasi saja: Capaian ikut',
  kunciEkor({ ...DEFAULT_CETAK_FILTER, colMode: 'realisasi' }).includes('capaian'))
ok('A3 sakelar Target saja: Real Akhir & Capaian tidak ada (sama dgn layar)',
  !kunciEkor({ ...DEFAULT_CETAK_FILTER, colMode: 'target' }).some(k => k === 'akhir' || k === 'capaian'))
ok('A4 Anggaran disembunyikan: Capaian tetap ada',
  JSON.stringify(kunciEkor({ ...DEFAULT_CETAK_FILTER, showAnggaran: false })) === JSON.stringify(['akhir', 'capaian']))
const kolCapaian = cetakHeader(DEFAULT_CETAK_FILTER).tail.find(c => c.key === 'capaian')
ok('A5 kolom Capaian bertanda persen, judul sama dgn layar', kolCapaian?.persen === true && kolCapaian.header === 'Capaian')
ok('A6 isi kolom = capaianTahunan baris sumbernya',
  kolCapaian?.value({ no: 1, tujuan: '', sasaran: 'S', program: '', kegiatan: '', sub_kegiatan: '', source: program }, semua) === 120)

console.log('\nB. Rumus capaian')
ok('B1 Akumulatif 85 dari 100 = 85', capaianTahunan(sasaran) === 85)
ok('B2 Progres Negatif dibalik: 8 dari 10 = 120', capaianTahunan(program) === 120)
ok('B3 target nol → 0 (seperti layar)', capaianTahunan(tujuan) === 0)
ok('B4 yang sudah berisi = hitungCapaianPct(target_tahunan, realisasi akhir, jenis)',
  semua.filter(r => r !== pnKosong).every(r => capaianTahunan(r) === hitungCapaianPct(r.target_tahunan, realisasiAkhirTahun(r), r.jenis)))
ok('B5 Progres Negatif belum diisi → null, bukan 200', capaianTahunan(pnKosong) === null,
  String(capaianTahunan(pnKosong)))
ok('B6 ...RPJMD-nya juga null', capaianRpjmd(pnKosong) === null)
ok('B7 nol SUNGGUHAN di realisasi bulanan → 200 (capaian terbaik)', capaianTahunan(pnNolNyata) === 200,
  String(capaianTahunan(pnNolNyata)))
ok('B8 bulanan ada tapi kosong semua → null (triwulan lama tidak dipakai, sama dgn realisasiAkhirTahun)',
  capaianTahunan(pnBulanKosong) === null)
ok('B9 jenis lain yang belum diisi tetap ANGKA 0', capaianTahunan(akumKosong) === 0)
ok('B10 per triwulan: TW I berisi dihitung, TW II kosong → null',
  capaianTriwulan(pnSebagian, 1) === hitungCapaianPct(4, 3, 'Progres Negatif') && capaianTriwulan(pnSebagian, 2) === null)
ok('B11 Progres Negatif yang berisi tetap dihitung setahun', capaianTahunan(pnSebagian) === hitungCapaianPct(4, 3, 'Progres Negatif'))

console.log('\nC. Format persen')
ok('C1 85,5 → "85,50%"', tulisPersen(85.5) === '85,50%', tulisPersen(85.5))
ok('C2 nol tetap tertulis "0,00%"', tulisPersen(0) === '0,00%', tulisPersen(0))
ok('C3 ribuan bertitik: 1234,5 → "1.234,50%"', tulisPersen(1234.5) === '1.234,50%', tulisPersen(1234.5))
ok('C4 pembulatan tidak tergelincir: 2,675 → "2,68%"', tulisPersen(2.675) === '2,68%', tulisPersen(2.675))
ok('C5 kosong/NaN → ""', tulisPersen(null) === '' && tulisPersen(Number.NaN) === '')

console.log('\nD. Teks sel PDF')
const kolPolos = cetakHeader(DEFAULT_CETAK_FILTER).lead.find(c => c.key === 'tahunan')!
const kolUang  = cetakHeader(DEFAULT_CETAK_FILTER).tail.find(c => c.key === 'anggaran')!
ok('D1 persen → "33,33%"', tulisSelCetak(kolCapaian!, capaianTahunan(kegiatan)) === '33,33%', tulisSelCetak(kolCapaian!, capaianTahunan(kegiatan)))
ok('D2 uang → ribuan bertitik', tulisSelCetak(kolUang, 1_500_000) === '1.500.000')
ok('D3 angka biasa → koma desimal', tulisSelCetak(kolPolos, 7.5) === '7,5')
ok('D4 null → "" & teks apa adanya', tulisSelCetak(kolPolos, null) === '' && tulisSelCetak(kolPolos, 'abc') === 'abc')
ok('D5 capaian kosong → "—" (layar & PDF lewat tulisCapaian yang sama)',
  tulisSelCetak(kolCapaian!, null) === '—' && tulisCapaian(null) === '—' && tulisCapaian(85.5) === '85,50%')

console.log('\nE. Workbook Excel sungguhan')
const wb = await buatWorkbookGabungan(semua, DEFAULT_CETAK_FILTER)
const ws = wb.worksheets[0]
const judul: string[] = []
ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { judul[i] = String(c.value ?? '') })
const iAkhir = judul.indexOf('Real Akhir'), iCap = judul.indexOf('Capaian'), iAng = judul.indexOf('Anggaran (Rp)')
ok('E1 kepala berkas memuat Capaian', iCap > 0, judul.join(' | '))
ok('E2 urutan kepala = layar (Real Akhir, Capaian, Anggaran)', iAkhir > 0 && iCap === iAkhir + 1 && iAng === iCap + 1)
const iInd = judul.indexOf('Indikator')
const barisData = (indikator: string) => {
  for (let r = 3; r <= ws.rowCount; r++) if (ws.getRow(r).getCell(iInd).value === indikator) return ws.getRow(r)
  return null
}
const selSas = barisData('Persentase Layanan')?.getCell(iCap)
const selKeg = barisData('Dokumen Tersusun')?.getCell(iCap)
ok('E3 persen disimpan sebagai ANGKA pecahan (85% → 0,85)', selSas?.value === 0.85, String(selSas?.value))
ok('E4 berformat persen Excel 0.00%', selSas?.numFmt === '0.00%', String(selSas?.numFmt))
ok('E5 tidak dibulatkan di sel (1/3 utuh)', typeof selKeg?.value === 'number' && Math.abs((selKeg.value as number) - 1 / 3) < 1e-12)
ok('E6 Progres Negatif 120% → 1,2', barisData('Angka Kejadian')?.getCell(iCap).value === 1.2)
ok('E7 Progres Negatif belum diisi → "—", bukan 2 (200%)', barisData('Net Death Rate')?.getCell(iCap).value === '—',
  String(barisData('Net Death Rate')?.getCell(iCap).value))

console.log('\nF. PDF sungguhan')
let pdfTeks = ''
try {
  const doc = await buildCombinedPdf(semua, 2099, DEFAULT_CETAK_FILTER)
  pdfTeks = doc.output()
} catch (e) { ok('F0 PDF bisa dibangun di Node', false, String(e)) }
ok('F1 kepala PDF memuat Capaian', pdfTeks.includes('(Capaian)'))
ok('F2 sel PDF "85,00%"', pdfTeks.includes('(85,00%)'))
ok('F3 sel PDF "120,00%"', pdfTeks.includes('(120,00%)'))
ok('F4 sel PDF "33,33%"', pdfTeks.includes('(33,33%)'))
ok('F5 PDF tidak memuat 200% untuk indikator yang belum diisi', !pdfTeks.includes('(200,00%)'))

console.log('\nG. Layar tidak menjauh dari spesifikasi')
const panel = kode('app/(dashboard)/rencana-aksi/_components/CetakPanel.tsx')
const tabel = badanFungsi(panel, 'function HierarchyTable', 'function PdfPreviewModal')
const judulLayar = [...tabel.matchAll(/<th\b[^>]*>([^<{]+)<\/th>/g)].map(m => m[1].trim()).filter(t => t !== 'T' && t !== 'R')
const hdr = cetakHeader(DEFAULT_CETAK_FILTER)
const judulSpek = [...hdr.lead, ...hdr.tail].map(c => c.header)
ok('G1 judul kolom layar = spesifikasi PDF/Excel (urutan sama)',
  JSON.stringify(judulLayar) === JSON.stringify(judulSpek), `layar: ${judulLayar.join(' | ')}  ·  spek: ${judulSpek.join(' | ')}`)
ok('G2 layar memakai capaianTahunan, bukan rumus sendiri',
  tabel.includes('const capaian = capaianTahunan(r)') && !tabel.includes('hitungCapaianPct('))
ok('G3 layar memakai tulisCapaian, bukan toFixed', tabel.includes('{tulisCapaian(capaian)}') && !/capaian\.toFixed\(/.test(tabel))
const ekspor = kode('app/(dashboard)/rencana-aksi/_lib/exports.ts')
ok('G4 PDF gabungan memformat sel lewat tulisSelCetak',
  badanFungsi(ekspor, 'export async function buildCombinedPdf', 'export async function exportCombinedPdf')
    .includes('hdr.flat.map(c => tulisSelCetak(c, c.value(h, rollup)))'))
// Capaian setahun/RPJMD/triwulan dihitung di tiga layar + unduhan per indikator. Semuanya wajib
// lewat penolong yang sama, kalau tidak satu layar tetap berbunyi 200% "Selesai" (L69).
const dasbor = kode('app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx')
ok('G5 layar Indikator: kartu akhir tahun, RPJMD, dan triwulan lewat penolong',
  dasbor.includes('const nilaiAkhirTahun = capaianTahunan(data)') && dasbor.includes('const nilaiRpjmd      = capaianRpjmd(data)')
    && dasbor.includes('const pct = capaianTriwulan(data, q.id)'))
ok('G6 layar Indikator: kartu menulis "—" untuk null',
  (dasbor.match(/nilai === null \? '—'/g) ?? []).length === 2 && dasbor.includes("Nilai {pct === null ? '—'"))
ok('G7 unduhan per indikator: tak ada hitungCapaianPct tersisa', !ekspor.includes('hitungCapaianPct(')
  && ekspor.includes('const pctTh = capaianTahunan(row)') && ekspor.includes('const pctRp = capaianRpjmd(row)')
  && (ekspor.match(/capaianTriwulan\(row, q\.id\)/g) ?? []).length === 2)
const entri = kode('app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx')
ok('G8 dialog ubah jenis lewat capaianTahunan', !entri.includes('hitungCapaianPct(')
  && entri.includes('const sebelum = capaianTahunan(barisAsli)'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(', ')); process.exit(1) }
