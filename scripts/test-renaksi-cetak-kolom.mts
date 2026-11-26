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
import { capaianTahunan, capaianRpjmd, capaianTriwulan, hitungCapaianPct, realisasiAkhirTahun, anggaranRollup, paguBelumTertaut } from '../app/(dashboard)/rencana-aksi/_lib/types'
import { cetakHeader, lebarKolomPdf, tulisSelCetak, tulisCapaian, DEFAULT_CETAK_FILTER, type CetakFilter } from '../app/(dashboard)/rencana-aksi/_lib/cetak-filter'
import { buatWorkbookGabungan, buildCombinedPdf, buatWorkbookIndikator, buatPdfIndikator, buatPdfList } from '../app/(dashboard)/rencana-aksi/_lib/exports'
import { sanitizeCell } from '../lib/shared/excel-export'
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
  // null = belum diisi (migration-renaksi-realisasi-null); 0 = nol SUNGGUHAN.
  q1_target: 0, q1_realisasi: null, q2_target: 0, q2_realisasi: null,
  q3_target: 0, q3_realisasi: null, q4_target: 0, q4_realisasi: null,
  anggaran_nominal: null, bulan_target: null, bulan_realisasi: null, induk_indikator_id: null, version: 1,
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
// TW I berisi 3, TW II–IV belum diisi.
const pnSebagian: RaRow = { ...pnKosong, id: 9, q1_target: 4, q1_realisasi: 3, q2_target: 4 }
const akumKosong: RaRow = { ...sasaran, id: 10, q1_realisasi: null, q2_realisasi: null, q3_realisasi: null, q4_realisasi: null }
// Kasus yang dulu MUSTAHIL (NOT NULL DEFAULT 0): level tanpa bulanan, realisasi memang 0.
const pnNolTriwulan: RaRow = { ...pnKosong, id: 11, q1_target: 4, q1_realisasi: 3, q2_target: 4, q2_realisasi: 0 }
const akumNolNyata: RaRow = { ...sasaran, id: 12, q1_realisasi: 0, q2_realisasi: null, q3_realisasi: null, q4_realisasi: null }

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
ok('B3 target nol → null (tak ada pembagi, bukan 0% merah)', capaianTahunan(tujuan) === null && capaianTriwulan(sasaran, 1) === null)
ok('B4 yang sudah berisi = hitungCapaianPct(target_tahunan, realisasi akhir, jenis)',
  semua.filter(r => r.target_tahunan > 0 && realisasiAkhirTahun(r) != null)
    .every(r => capaianTahunan(r) === hitungCapaianPct(r.target_tahunan, realisasiAkhirTahun(r)!, r.jenis)))
ok('B5 Progres Negatif belum diisi → null, bukan 200', capaianTahunan(pnKosong) === null,
  String(capaianTahunan(pnKosong)))
ok('B6 ...RPJMD-nya juga null', capaianRpjmd(pnKosong) === null)
ok('B7 nol SUNGGUHAN di realisasi bulanan → 200 (capaian terbaik)', capaianTahunan(pnNolNyata) === 200,
  String(capaianTahunan(pnNolNyata)))
ok('B8 bulanan ada tapi kosong semua → null (triwulan lama tidak dipakai, sama dgn realisasiAkhirTahun)',
  capaianTahunan(pnBulanKosong) === null)
ok('B9 jenis lain yang belum diisi juga null (realisasi "—" tak berdampingan capaian 0)',
  capaianTahunan(akumKosong) === null && capaianTriwulan({ ...akumKosong, q2_target: 5 }, 2) === null)
ok('B9b nol SUNGGUHAN Akumulatif tetap dihitung 0', capaianTriwulan({ ...akumNolNyata, q1_target: 5 }, 1) === 0)
ok('B10 per triwulan: TW I berisi dihitung, TW II kosong → null',
  capaianTriwulan(pnSebagian, 1) === hitungCapaianPct(4, 3, 'Progres Negatif') && capaianTriwulan(pnSebagian, 2) === null)
ok('B11 Progres Negatif yang berisi tetap dihitung setahun', capaianTahunan(pnSebagian) === hitungCapaianPct(4, 3, 'Progres Negatif'))

console.log('\nB2. Nol sungguhan di triwulan (kolom boleh NULL)')
ok('B12 Progres Negatif TW II = 0 nyata → TW II 200 (capaian terbaik), bukan "—"',
  capaianTriwulan(pnNolTriwulan, 2) === 200, String(capaianTriwulan(pnNolTriwulan, 2)))
ok('B13 ...dan setahun memakai triwulan TERAKHIR yang diisi (0), bukan yang terakhir > 0',
  realisasiAkhirTahun(pnNolTriwulan) === 0 && capaianTahunan(pnNolTriwulan) === 200, String(capaianTahunan(pnNolTriwulan)))
ok('B14 Akumulatif: yang belum diisi tidak dijumlah, nol nyata ikut — 0 ≠ kosong',
  realisasiAkhirTahun(akumNolNyata) === 0 && realisasiAkhirTahun(akumKosong) === null)
ok('B15 Akumulatif sebagian: jumlah triwulan yang diisi saja',
  realisasiAkhirTahun({ ...akumKosong, q1_realisasi: 2.5, q3_realisasi: 1 }) === 3.5)

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
const kolAkhir = cetakHeader(DEFAULT_CETAK_FILTER).tail.find(c => c.key === 'akhir')!
const kolTwR = cetakHeader({ ...DEFAULT_CETAK_FILTER, showTw: true }).twQuarters[0].sub.find(c => c.key === 'tw1r')!
ok('D6 realisasi belum diisi → "—" (Real Akhir & TW R), nol tetap "0"',
  tulisSelCetak(kolAkhir, null) === '—' && tulisSelCetak(kolTwR, null) === '—' && tulisSelCetak(kolTwR, 0) === '0',
  `${tulisSelCetak(kolAkhir, null)} ${tulisSelCetak(kolTwR, null)} ${tulisSelCetak(kolTwR, 0)}`)
ok('D7 kolom bukan realisasi tetap kosong untuk null (Tujuan/Sasaran di baris bawah)', tulisSelCetak(kolPolos, null) === '')

console.log('\nE. Workbook Excel sungguhan')
const wb = await buatWorkbookGabungan(semua, DEFAULT_CETAK_FILTER)
const ws = wb.worksheets[0]
const judul: string[] = []
// Gaya resmi bersama: kop 1–6, kepala baris 7, nomor kolom (1)(2)… baris 8, data mulai 9.
ws.getRow(7).eachCell({ includeEmpty: true }, (c, i) => { judul[i] = String(c.value ?? '') })
const iAkhir = judul.indexOf('Real Akhir'), iCap = judul.indexOf('Capaian'), iAng = judul.indexOf('Anggaran (Rp)')
ok('E1 kepala berkas memuat Capaian', iCap > 0, judul.join(' | '))
ok('E2 urutan kepala = layar (Real Akhir, Capaian, Anggaran)', iAkhir > 0 && iCap === iAkhir + 1 && iAng === iCap + 1)
const iInd = judul.indexOf('Indikator')
const barisData = (indikator: string) => {
  for (let r = 9; r <= ws.rowCount; r++) if (ws.getRow(r).getCell(iInd).value === indikator) return ws.getRow(r)
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
ok('E8 Real Akhir belum diisi → "—"; yang berisi tetap ANGKA',
  barisData('Net Death Rate')?.getCell(iAkhir).value === '—' && barisData('Angka Kejadian')?.getCell(iAkhir).value === 8,
  `${barisData('Net Death Rate')?.getCell(iAkhir).value} / ${barisData('Angka Kejadian')?.getCell(iAkhir).value}`)

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
// Kode layar memuat SEMUA <th> bersyarat, jadi pembandingnya spesifikasi dengan semua kolom pilihan menyala.
const hdr = cetakHeader({ ...DEFAULT_CETAK_FILTER, showSumberAnggaran: true })
const judulSpek = [...hdr.lead, ...hdr.tail].map(c => c.header)
ok('G1 judul kolom layar = spesifikasi PDF/Excel (urutan sama)',
  JSON.stringify(judulLayar) === JSON.stringify(judulSpek), `layar: ${judulLayar.join(' | ')}  ·  spek: ${judulSpek.join(' | ')}`)
ok('G2 layar memakai capaianTahunan, bukan rumus sendiri',
  tabel.includes('const capaian = capaianTahunan(r)') && !tabel.includes('hitungCapaianPct('))
ok('G3 layar memakai tulisCapaian, bukan toFixed', tabel.includes('{tulisCapaian(capaian)}') && !/capaian\.toFixed\(/.test(tabel))
const ekspor = kode('app/(dashboard)/rencana-aksi/_lib/exports.ts')
// Gaya resmi bersama: sel PDF = teksPdf kolom dokGabungan (tulisSelCetak), dirangkai teksSelPdf.
ok('G4 PDF gabungan memformat sel lewat tulisSelCetak',
  badanFungsi(ekspor, 'export function dokGabungan', 'export async function buildCombinedPdf').includes('teksPdf: (v: number) => tulisSelCetak(c, v)')
  && badanFungsi(ekspor, 'export function dokGabungan', 'export async function buildCombinedPdf').includes('const v = c.value(h, rollup);')
  && badanFungsi(ekspor, 'export async function buildCombinedPdf', 'export async function exportCombinedPdf').includes('teksSelPdf(k, b.sel[i])'))
// Capaian setahun/RPJMD/triwulan dihitung di tiga layar + unduhan per indikator. Semuanya wajib
// lewat penolong yang sama, kalau tidak satu layar tetap berbunyi 200% "Selesai" (L69).
const dasbor = kode('app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx')
ok('G5 layar Indikator: kartu akhir tahun, RPJMD, dan triwulan lewat penolong',
  dasbor.includes('const nilaiAkhirTahun = capaianTahunan(data)') && dasbor.includes('const nilaiRpjmd      = capaianRpjmd(data)')
    && dasbor.includes('const pct = capaianTriwulan(data, q.id)'))
ok('G6 layar Indikator: kartu menulis "—" untuk null',
  (dasbor.match(/nilai === null \? '—'/g) ?? []).length === 2 && dasbor.includes("Nilai {pct === null ? '—'"))
// PDF & Excel per indikator kini satu dokIndikator → capaian triwulan dihitung sekali.
ok('G7 unduhan per indikator: tak ada hitungCapaianPct tersisa', !ekspor.includes('hitungCapaianPct(')
  && ekspor.includes('persenTeks(capaianTahunan(row))') && ekspor.includes('persenTeks(capaianRpjmd(row))')
  && (ekspor.match(/capaianTriwulan\(row, q\.id\)/g) ?? []).length === 1)
const entri = kode('app/(dashboard)/rencana-aksi/_components/DataEntryForm.tsx')
ok('G8 dialog ubah jenis lewat capaianTahunan', !entri.includes('hitungCapaianPct(')
  && entri.includes('const sebelum = capaianTahunan(barisAsli)'))

console.log('\nH. Lebar kolom PDF gabungan (kata tidak patah di tengah)')
{
  const flat = cetakHeader({ ...DEFAULT_CETAK_FILTER, showSumberAnggaran: true }).flat
  const idx = (k: string) => flat.findIndex(c => c.key === k)
  const minKata = flat.map((_, i) => (i === idx('program') ? 24 : 8))
  const l = lebarKolomPdf(flat, 277, minKata)
  const jumlah = l.reduce((s, v) => s + v, 0)
  ok('H1 total lebar tidak melebihi halaman', jumlah <= 277 + 1e-9, String(jumlah))
  ok('H2 kolom teks tidak di bawah kata terpanjangnya selama muat', l[idx('program')] >= 24, String(l[idx('program')]))
  ok('H3 kolom angka selebar isinya (tidak ikut dibagi sisa)', l[idx('tw1t')] === Math.max(6, 8) && l[idx('anggaran')] === 8)
  ok('H4 sisa lebar terbanyak ke Indikator', l[idx('indikator')] > l[idx('outcome')] && l[idx('outcome')] > l[idx('kegiatan')])
  const sesak = lebarKolomPdf(flat, 100, flat.map(() => 20))
  ok('H5 kolom terlalu banyak: disusutkan sebanding, tetap muat', Math.abs(sesak.reduce((s, v) => s + v, 0) - 100) < 1e-9)
  // Tanpa batas, kata 999 mm merebut ± 80% halaman dan kolom lain disusutkan sampai patah.
  ok('H6 satu kata sepanjang tautan dibatasi', lebarKolomPdf(flat, 300, flat.map((_, i) => (i === idx('indikator') ? 999 : 8)))[idx('indikator')] < 150)

  const panjang = semua.map((r, i) => i === 0 ? { ...r, indikator: 'Penyelenggaraan Pemberdayaan Kemitraan Peningkatan Gondohutomo' } : r)
  const doc = await buildCombinedPdf(panjang, 2099, { ...DEFAULT_CETAK_FILTER, showSumberAnggaran: true })
  const t = (doc as unknown as { lastAutoTable: { body: { cells: Record<string, { text: string[]; raw: unknown }> }[] } }).lastAutoTable
  let patah = 0
  for (const r of t.body) for (const cell of Object.values(r.cells)) {
    const asli = String(cell.raw ?? '').replace(/\s+/g, ' ')
    for (let k = 0; k + 1 < cell.text.length; k++) {
      const ujung = cell.text[k].trimEnd().split(' ').pop() ?? '', awal = cell.text[k + 1].trimStart().split(' ')[0] ?? ''
      if (/\p{L}$/u.test(ujung) && /^\p{L}/u.test(awal) && asli.includes(ujung + awal) && !asli.includes(`${ujung} ${awal}`)) patah++
    }
  }
  ok('H7 PDF sungguhan: tidak ada kata yang patah di tengah', patah === 0, `${patah} kata patah`)
  ok('H8 lebar kolom lewat lebarKolomPdf + minKata', /lebarKolomPdf\(hdr\.flat, .*, minKata\);/.test(ekspor)
    && /lebarKolom: lebar \}/.test(ekspor))
}

console.log('\nI. Unduhan per indikator & Data Entry (laporan pemakai 2026-11-17: "\'-", capaian 0 di samping "—")')
{
  // TW I kosong, TW II target 0 berisi 20, TW III 12 dari 8, TW IV kosong — persis tangkapan layar pemakai.
  const r: RaRow = { ...dasar, id: 30, level: 'program', program: 'Program Uji', indikator: 'Cakupan', target_tahunan: 10,
    q1_target: 5, q1_realisasi: null, q2_target: 0, q2_realisasi: 20, q3_target: 8, q3_realisasi: 12, q4_target: 10, q4_realisasi: null }
  const wb = await buatWorkbookIndikator(r)
  const sel = new Map<string, unknown[]>()
  wb.worksheets[0].eachRow(b => { const v = (b.values as unknown[]).slice(1); sel.set(String(v[0]), v) })
  ok('I1 Excel: realisasi kosong → capaian "—", bukan 0', JSON.stringify(sel.get('TW 1')) === JSON.stringify(['TW 1', 5, '—', '—']), JSON.stringify(sel.get('TW 1')))
  ok('I2 Excel: target 0 → capaian "—", bukan 0', sel.get('TW 2')?.[3] === '—', JSON.stringify(sel.get('TW 2')))
  ok('I3 Excel: yang bisa dihitung tetap ANGKA 150', sel.get('TW 3')?.[3] === 150, JSON.stringify(sel.get('TW 3')))
  ok('I4 Excel: Kegiatan kosong "—", tanpa petik', sel.get('Kegiatan')?.[1] === '—', JSON.stringify(sel.get('Kegiatan')))
  const isiPdf = (d: unknown) => (d as { lastAutoTable: { body: { cells: Record<string, { raw: unknown }> }[] } }).lastAutoTable.body
    .map(b => Object.values(b.cells).map(c => String(c.raw)))
  const tw = isiPdf(await buatPdfIndikator(r))
  ok('I5 PDF: kolom capaian = Excel ("—", "—", angka berkoma, "—")',
    JSON.stringify(tw.map(b => b[3])) === JSON.stringify(['—', '—', '150,00%', '—']), JSON.stringify(tw.map(b => b[3])))
  const ringkas = isiPdf(await buatPdfIndikator({ ...r, q1_realisasi: 2.5 }))
  ok('I5b PDF: capaian tahunan berkoma, bukan "…%" bertitik', !ringkas.flat().some(t => /\d\.\d+%/.test(t)), JSON.stringify(ringkas.flat().filter(t => t.includes('%'))))
  const daftar = isiPdf(await buatPdfList([r], 2099, 'program'))[0]
  ok('I6 PDF Data Entry: realisasi kosong "—/5", bukan "0/5"', daftar[10] === '—/5' && daftar[11] === '20/0', JSON.stringify(daftar.slice(10)))
  ok('I7 sanitizeCell: tanda kosong "-" tidak diberi petik', sanitizeCell('-') === '-' && sanitizeCell(' -- ') === ' -- ')
  ok('I8 ...rumus tetap dijinakkan', sanitizeCell('-1+2') === "'-1+2" && sanitizeCell('=SUM(A1)') === "'=SUM(A1)")
}

console.log('\nJ. Kartu Anggaran menu Realisasi (laporan pemakai 2026-11-17: pagu sub tak naik ke kegiatan/program)')
{
  const rantai = [program, kegiatan, sub]
  ok('J1 kegiatan dapat pagu sub di bawahnya', anggaranRollup('kegiatan', kegiatan, rantai) === 1_500_000, String(anggaranRollup('kegiatan', kegiatan, rantai)))
  ok('J2 program ikut naik', anggaranRollup('program', program, rantai) === 1_500_000, String(anggaranRollup('program', program, rantai)))
  ok('J3 muatan lama (program + sub saja) memutus rantai — inilah cacatnya',
    anggaranRollup('program', program, [program, sub]) === null && anggaranRollup('kegiatan', kegiatan, [program, sub]) === null)
  const ra = kode('app/(dashboard)/rencana-aksi/ra-client.tsx')
  ok('J4 layar memuat KELIMA level untuk rollup', /ALL_LEVELS\.map\(lv => apiList\(tahun, lv\)\)/.test(ra) && !/apiList\(tahun, 'program'\)/.test(ra))
  // Kegiatan berindikator dua, sub belum memilih induk: pagu tidak dibagi (konsep renaksi-pagu-rko §6c) — tapi disebut.
  const kegiatan2: RaRow = { ...kegiatan, id: 40, indikator: 'Dokumen Kedua' }
  const dua = [program, kegiatan, kegiatan2, sub]
  ok('J5 berindikator dua & belum tertaut: tak ada indikator yang dapat', anggaranRollup('kegiatan', kegiatan, dua) === null && anggaranRollup('kegiatan', kegiatan2, dua) === null)
  ok('J6 ...jumlahnya disebut di kartu', paguBelumTertaut(kegiatan, dua) === 1_500_000 && paguBelumTertaut(kegiatan2, dua) === 1_500_000)
  ok('J7 sesudah ditautkan: masuk ke indikator itu, catatan hilang',
    anggaranRollup('kegiatan', kegiatan2, [program, kegiatan, kegiatan2, { ...sub, induk_indikator_id: 40 }]) === 1_500_000
      && paguBelumTertaut(kegiatan2, [program, kegiatan, kegiatan2, { ...sub, induk_indikator_id: 40 }]) === 0)
  ok('J8 sub kegiatan tak pernah bercatatan', paguBelumTertaut(sub, dua) === 0)
  // Tautan putus SATU tingkat di bawah (di kegiatan): program tampil Rp 0 — dulu tanpa catatan apa pun.
  ok('J10 putus di tingkat bawah ikut disebut di atasnya', (anggaranRollup('program', program, dua) ?? 0) === 0
    && paguBelumTertaut(program, dua) === 1_500_000, String(paguBelumTertaut(program, dua)))
  ok('J11 rantai utuh: tak ada catatan di tingkat mana pun', [program, kegiatan].every(r => paguBelumTertaut(r, rantai) === 0))
  const tertautSatu = [program, kegiatan, kegiatan2, { ...sub, induk_indikator_id: 40 }, { ...sub, id: 41, sub_kegiatan: 'Sub Dua', anggaran_nominal: 500_000 }]
  ok('J12 sebagian tertaut: hanya sisanya yang disebut', paguBelumTertaut(kegiatan, tertautSatu) === 500_000
    && anggaranRollup('kegiatan', kegiatan2, tertautSatu) === 1_500_000, String(paguBelumTertaut(kegiatan, tertautSatu)))
  ok('J9 kartu menerima catatannya', /anggaranBelumTertaut=\{anggaranBelumTertaut\}/.test(ra)
    && /anggaranBelumTertaut > 0 &&/.test(kode('app/(dashboard)/rencana-aksi/_components/MainDashboard.tsx')))
}

console.log('\nK. Widget Realisasi Kinerja /dashboard (realisasi kosong tidak lagi 0%)')
{
  const { ringkasCapaian } = await import('../lib/data/dashboard')
  const kosong = ringkasCapaian([akumKosong, { ...akumKosong, id: 50 }])
  ok('K1 belum ada yang diisi: capaian null ("—"), bukan 0%', kosong.pct === null && kosong.dinilai === 0, JSON.stringify(kosong))
  ok('K2 ...dan disebut sebagai "belum diisi", bukan "belum tercapai"', kosong.belumDiisi === 2 && kosong.belum === 0)
  const campur = ringkasCapaian([sasaran, akumKosong, tujuan])
  ok('K3 campuran: yang diisi dinilai, kosong disebut, target 0 tidak dihitung di mana pun',
    campur.dinilai === 1 && campur.pct === 85 && campur.belum === 1 && campur.belumDiisi === 1, JSON.stringify(campur))
  const dash = kode('app/(dashboard)/dashboard/dashboard-client.tsx')
  ok('K4 widget menulis "—" saat null dan menampilkan Belum Diisi',
    /rk\.pct_capaian_total == null \? '—'/.test(dash) && /rk\.belum_diisi/.test(dash))
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(', ')); process.exit(1) }
