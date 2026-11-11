// scripts/test-renaksi-penanda.mts — penanda matriks Renaksi dihitung, bukan disimpan
//
//   npx tsx scripts/test-renaksi-penanda.mts
//
// Konsep: docs/CONCEPT-renaksi-bersihkan-nama.md §12. Tanpa basis data.
// Data tersimpan tidak pernah ditulis ulang: yang diuji di sini seluruhnya TAMPILAN —
// Cetak & unduhan bersih (penanda lewat sakelar), layar kerja berpenanda hasil hitungan,
// IKI bersih saat ditarik dan saat dicetak.

import { readFileSync } from 'node:fs'
import {
  bintangLevel, nomorIndikator, nomorTersimpan, rapikanIndikator, tampilIndikator, tampilNama,
} from '../lib/shared/nama-resmi'
import { buildCetakRows, cetakHeader, DEFAULT_CETAK_FILTER } from '../app/(dashboard)/rencana-aksi/_lib/cetak-filter'
import type { RaRow } from '../app/(dashboard)/rencana-aksi/_lib/types'
import { buildIkiGrid } from '../lib/iki/layout'
import { susunKisiCetak, tabelSeperti } from '../lib/iki/custom'
import { cocokkanInduk, selaraskanImpor, type BarisTersimpan } from '../lib/renaksi/induk-impor'
import type { CommitRow } from '../lib/renaksi/import-data'

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) { if (syarat) lulus++; else gagal.push(nama) }
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, JSON.stringify(dapat) === JSON.stringify(harap))
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── A. Aturan ────────────────────────────────────────────────────────────────
sama('A1 bintang per tingkat', (['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan'] as const).map(bintangLevel), ['*', '**', '***', '****', '*****'])
sama('A2 nomor tersimpan', [nomorTersimpan('(2) Jumlah'), nomorTersimpan('Jumlah (2)'), nomorTersimpan('(100) x'), nomorTersimpan('Jumlah')], [2, null, null, null])
sama('A3 nama bersih', tampilNama('PROGRAM X ***', 'program', false), 'PROGRAM X')
sama('A4 nama berpenanda dihitung dari tingkat, bukan dari teksnya', tampilNama('PROGRAM X *', 'program', true), 'PROGRAM X ***')
sama('A5 nama ketikan tangan dapat penanda yang sama', tampilNama('PROGRAM X', 'program', true), 'PROGRAM X ***')
sama('A6 indikator bersih', tampilIndikator('(2) Jumlah Dokumen *****', 'sub-kegiatan', 2, false), 'Jumlah Dokumen')
sama('A7 indikator berpenanda', tampilIndikator('Jumlah Dokumen', 'sub-kegiatan', 2, true), '(2) Jumlah Dokumen *****')
sama('A8 tanpa nomor: bintang saja', tampilIndikator('Jumlah Dokumen', 'kegiatan', null, true), 'Jumlah Dokumen ****')
for (const [teks, n] of [['(1) A ***', 1], ['B', 2], ['(3) C', 3]] as const) {
  const sekali = tampilIndikator(teks, 'program', n, true)
  cek(`A9 tempel berulang tidak menumpuk: ${teks}`, tampilIndikator(sekali, 'program', n, true) === sekali && rapikanIndikator(sekali) === rapikanIndikator(teks))
}
sama('A10 nama kosong tetap kosong', tampilNama('', 'program', true), '')

const B = (id: number, level: RaRow['level'], program: string, kegiatan: string | null, sub: string | null, indikator: string) =>
  ({ id, level, program, kegiatan, sub_kegiatan: sub, indikator })
const nomor = nomorIndikator([
  B(1, 'program', 'P ***', null, null, '(1) Alfa ***'),
  B(2, 'program', 'P ***', null, null, '(2) Beta ***'),
  B(3, 'program', 'P', null, null, 'Gama'),               // ketikan tangan di program yang sama
  B(4, 'program', 'P', null, null, 'Delta'),
  B(5, 'program', 'Q', null, null, 'Tunggal'),
  B(6, 'program', 'R', null, null, '(1) Tunggal bernomor'),
  B(7, 'kegiatan', 'P', 'K', null, 'Zeta'),
  B(8, 'kegiatan', 'P', 'K ****', null, 'Eta'),
  B(9, 'kegiatan', 'P', 'K2', null, 'Zeta lain'),
])
sama('B1 nomor tersimpan dipertahankan', [nomor.get(1), nomor.get(2)], [1, 2])
sama('B2 ketikan tangan dapat nomor kosong berikutnya, urut abjad', [nomor.get(4), nomor.get(3)], [3, 4])
sama('B3 indikator tunggal tidak dinomori', nomor.get(5), null)
sama('B4 tunggal tapi tersimpan bernomor: dipertahankan', nomor.get(6), 1)
sama('B5 bintang di nama tidak memecah kelompok', [nomor.get(8), nomor.get(7)], [1, 2])
sama('B6 kegiatan lain kelompok sendiri', nomor.get(9), null)
const celah = nomorIndikator([B(1, 'program', 'P', null, null, '(2) B'), B(2, 'program', 'P', null, null, 'A'), B(3, 'program', 'P', null, null, 'C')])
sama('B7 nomor yang sudah terpakai dilompati', [celah.get(2), celah.get(1), celah.get(3)], [1, 2, 3])

// ── C. Cetak: satu penyusun untuk layar, PDF, Excel, dan tabel LKJIP ─────────
const R = (o: Partial<RaRow> & Pick<RaRow, 'id' | 'level' | 'program' | 'indikator'>): RaRow => ({
  tahun: 2099, kode: null, kegiatan: null, sub_kegiatan: null, jenis: 'Akumulatif', sasaran: null, tujuan: null,
  outcome_program: null, outcome_kegiatan: null, outcome_sub_kegiatan: null, version: 0, satuan: 'Dokumen',
  target_rpjmd: 0, target_tahunan: 4, q1_target: 1, q1_realisasi: null, q2_target: 1, q2_realisasi: null,
  q3_target: 1, q3_realisasi: null, q4_target: 1, q4_realisasi: null, anggaran_nominal: null,
  bulan_target: null, bulan_realisasi: null, ...o,
} as RaRow)
const DATA: RaRow[] = [
  R({ id: 1, level: 'tujuan', program: 'Tujuan T *', indikator: 'Indikator T *' }),
  R({ id: 2, level: 'sasaran', program: 'Sasaran S **', tujuan: 'Tujuan T *', indikator: 'Indikator S **' }),
  R({ id: 3, level: 'program', program: 'PROGRAM P ***', sasaran: 'Sasaran S **', indikator: '(1) Indikator P1 ***' }),
  R({ id: 4, level: 'program', program: 'PROGRAM P ***', sasaran: 'Sasaran S **', indikator: '(2) Indikator P2 ***' }),
  R({ id: 5, level: 'kegiatan', program: 'PROGRAM P ***', kegiatan: 'Kegiatan K', indikator: 'Indikator K ketikan tangan' }),
  R({ id: 6, level: 'sub-kegiatan', program: 'PROGRAM P ***', kegiatan: 'Kegiatan K', sub_kegiatan: 'Sub S *****', indikator: 'Indikator Sub *****' }),
]
const kolom = cetakHeader(DEFAULT_CETAK_FILTER).flat
const nilai = (f: typeof DEFAULT_CETAK_FILTER, kunci: string) => buildCetakRows(DATA, f).map(h => kolom.find(c => c.key === kunci)!.value(h, DATA))
const bersih = DEFAULT_CETAK_FILTER
const berpenanda = { ...DEFAULT_CETAK_FILTER, penanda: true }

cek('C1 bawaan Cetak: tanpa penanda', bersih.penanda !== true)
sama('C2 pohon tetap tersambung walau nama tersimpan berbintang', buildCetakRows(DATA, bersih).map(h => h.source.id), [1, 2, 3, 5, 6, 4])
cek('C2b tidak ada baris yatim', buildCetakRows(DATA, bersih).every(h => !h.isOrphan))
sama('C3 bersih: indikator', nilai(bersih, 'indikator'), ['Indikator T', 'Indikator S', 'Indikator P1', 'Indikator K ketikan tangan', 'Indikator Sub', 'Indikator P2'])
sama('C4 bersih: nama per kolom', [nilai(bersih, 'tujuan')[0], nilai(bersih, 'sasaran')[1], nilai(bersih, 'program')[2], nilai(bersih, 'kegiatan')[3], nilai(bersih, 'sub_kegiatan')[4]],
  ['Tujuan T', 'Sasaran S', 'PROGRAM P', 'Kegiatan K', 'Sub S'])
cek('C5 bersih: tidak ada bintang atau nomor di sel mana pun', ['tujuan', 'sasaran', 'program', 'kegiatan', 'sub_kegiatan', 'indikator'].every(k => nilai(bersih, k).every(v => !/\*|^\(\d+\)/.test(String(v)))))
sama('C6 berpenanda: indikator (impor & ketikan tangan seragam)', nilai(berpenanda, 'indikator'),
  ['Indikator T *', 'Indikator S **', '(1) Indikator P1 ***', 'Indikator K ketikan tangan ****', 'Indikator Sub *****', '(2) Indikator P2 ***'])
sama('C7 berpenanda: nama', [nilai(berpenanda, 'tujuan')[0], nilai(berpenanda, 'program')[2], nilai(berpenanda, 'kegiatan')[3], nilai(berpenanda, 'sub_kegiatan')[4]],
  ['Tujuan T *', 'PROGRAM P ***', 'Kegiatan K ****', 'Sub S *****'])
cek('C8 data sumber tidak diubah', DATA[2].indikator === '(1) Indikator P1 ***' && buildCetakRows(DATA, bersih)[2].source.indikator === '(1) Indikator P1 ***' && buildCetakRows(DATA, bersih)[5].source.id === 4)
const fokus = buildCetakRows(DATA, { ...bersih, fProgram: 'PROGRAM P ***' })
cek('C9 fokus program tetap memakai nama tersimpan', fokus.some(h => h.source.id === 5) && fokus.every(h => !/\*/.test(h.program)))
sama('C10 mode flat ikut bersih', buildCetakRows(DATA, { ...bersih, mode: 'flat' }).map(h => h.indikator).sort(), nilai(bersih, 'indikator').map(String).sort())

const panel = tanpaKomentar(baca('app/(dashboard)/rencana-aksi/_components/CetakPanel.tsx'))
cek('C11 layar Cetak memakai teks indikator dari penyusun', panel.includes('{h.indikator ?? r.indikator}'))
cek('C12 sakelar Penanda matriks ada dan ikut menentukan "bawaan"', panel.includes('setF({ penanda: !filter.penanda })') && panel.includes('!filter.penanda &&'))
const ekspor = tanpaKomentar(baca('app/(dashboard)/rencana-aksi/_lib/exports.ts'))
cek('C13 PDF & Excel gabungan lewat penyusun yang sama', (ekspor.match(/buildCetakRows\(allRows, filter\)/g) ?? []).length === 2)
sama('C14 lima unduhan lain dibersihkan', (ekspor.match(/mentah\.map\(barisBersih\)|barisBersih\(mentah\)/g) ?? []).length, 5)
cek('C15 tabel LKJIP memakai penyusun yang sama', baca('lib/lkjip/sumber/renaksi-cetak.ts').includes('buildCetakRows(semua, filter)'))

// ── D. Layar kerja: penanda hasil hitungan ───────────────────────────────────
const K = 'app/(dashboard)/rencana-aksi/'
cek('D1 penyedia dipasang di akar Renaksi', baca(K + 'ra-client.tsx').includes('<PenandaProvider rows={rows}>'))
const utama = tanpaKomentar(baca(K + '_components/MainDashboard.tsx'))
sama('D2 semua pemilih berlabel penanda', [(utama.match(/<Selector label="/g) ?? []).length, (utama.match(/<Selector label="[^"]+" labelOf=\{/g) ?? []).length], [14, 14])
cek('D3 nilai pemilih tetap teks tersimpan', utama.includes('({ value: o, label: labelOf ? labelOf(o) : o })'))
const entri = tanpaKomentar(baca(K + '_components/DataEntryForm.tsx'))
cek('D4 daftar Data Entry memakai penanda', entri.includes('{penanda.indikator(row)}') && !entri.includes('{row.program}') && (entri.match(/penanda\.nama\(row\.program, '/g) ?? []).length === 5)
cek('D5 isian form tetap teks tersimpan', entri.includes('setIndikator(row.indikator)'))
cek('D6 Matriks Bulanan memakai penanda', tanpaKomentar(baca(K + '_components/MatrixBulananModal.tsx')).includes('{penanda.indikator(r)}'))
const modal = tanpaKomentar(baca(K + '_components/Modals.tsx'))
cek('D7 modal detail & reset memakai penanda', (modal.match(/penanda\.indikator\(row\)/g) ?? []).length === 2 && modal.includes('penanda.nama(row.program, levelKolomProgram(row.level))'))
cek('D8 layar kerja selalu berpenanda (tanpa sakelar)', (baca(K + '_lib/penanda.tsx').match(/, true\)/g) ?? []).length >= 5)

// ── E. IKI ───────────────────────────────────────────────────────────────────
const ruteIki = tanpaKomentar(baca('app/api/iki/import-renaksi/route.ts'))
cek('E1 tarik Renaksi: RHK, nama, induk, indikator dibersihkan', ruteIki.includes('rhk: rapikanNamaEntitas(outcome ?? nama)') && ruteIki.includes('indikator: rapikanIndikator(r.indikator)')
  && ruteIki.includes('parent: rapikanNamaEntitas(parent)') && ruteIki.includes('nama: rapikanNamaEntitas(nama)'))
cek('E2 pemeta kartu memakai hasil tarik apa adanya', baca('app/(dashboard)/iki/_lib/isi-renaksi.ts').includes('indikator: r.indikator'))
const tw = [1, 2, 3, 4].map(t => ({ triwulan: t, rencana_aksi: 'Aksi', target: '1' }))
const dok = {
  varian: 'STANDAR', jenis: 'MURNI', tahun: 2099, nama: 'N', nip: '1', jabatan: 'J', pangkat: 'P', unit_kerja: 'U',
  atasan_nama: 'A', atasan_nip: '2', atasan_jabatan: 'AJ', atasan_pangkat: 'AP', tanggal: '2099-01-02', tabel_custom: null,
  rhk: [{ no_urut: 1, rhk_intervensi: 'Sasaran atasan **', rhk: 'Meningkatnya mutu ***', aspek_a: 'Kuantitas', indikator: '(1) Jumlah dokumen ***',
    aspek_b: 'Akumulatif', target_tahunan: '4 Dokumen', formulasi: '', triwulan: tw }],
}
let teksGrid = ''
try { teksGrid = JSON.stringify(buildIkiGrid(dok as never)) } catch (e) { gagal.push('E3 buildIkiGrid melempar: ' + (e as Error).message) }
cek('E3 cetak IKI: dokumen lama dibersihkan', teksGrid.includes('Meningkatnya mutu') && teksGrid.includes('Jumlah dokumen') && teksGrid.includes('Sasaran atasan'))
cek('E4 cetak IKI: tidak ada bintang atau nomor tersisa', teksGrid !== '' && !/\*\*|\(1\) Jumlah/.test(teksGrid))
cek('E5 data dokumen IKI tidak diubah', dok.rhk[0].indikator === '(1) Jumlah dokumen ***')

const tc = tabelSeperti('STANDAR')
const bd = tc.headerRows
const isi = (kol: number | undefined, v: string) => { tc.rows[bd][kol!] = { ...tc.rows[bd][kol!], v } }
isi(tc.peran.rhk_intervensi, 'Sasaran atasan **'); isi(tc.peran.rhk, 'Meningkatnya mutu ***'); isi(tc.peran.indikator, '(1) Jumlah dokumen ***')
isi(tc.peran.target_tahunan, '(1) 4 Dokumen ***')
tc.rows[0][tc.peran.rhk!] = { ...tc.rows[0][tc.peran.rhk!], v: 'Kepala ***' }
const kisi = susunKisiCetak(tc)
const selC = (r: number, k: number | undefined) => kisi.baris[r][k!]?.teks
sama('E6 cetak IKI CUSTOM: kolom berperan RHK/indikator dibersihkan',
  [selC(bd, tc.peran.rhk_intervensi), selC(bd, tc.peran.rhk), selC(bd, tc.peran.indikator)], ['Sasaran atasan', 'Meningkatnya mutu', 'Jumlah dokumen'])
sama('E7 …kolom lain dan baris kepala apa adanya', [selC(bd, tc.peran.target_tahunan), selC(0, tc.peran.rhk)], ['(1) 4 Dokumen ***', 'Kepala ***'])
cek('E8 …isi tabel tersimpan tidak diubah', tc.rows[bd][tc.peran.indikator!].v === '(1) Jumlah dokumen ***')
const polos = { ...tc, peran: {} }
cek('E9 tabel tanpa peran kolom: sel bebas tidak disentuh', susunKisiCetak(polos).baris[bd][tc.peran.indikator!]?.teks === '(1) Jumlah dokumen ***')

// ── F. Impor ke tahun yang datanya berpenanda (konsep §11.2) ───────────────────
const db = (level: BarisTersimpan['level'], program: string, kegiatan: string | null, sub: string | null, indikator: string): BarisTersimpan =>
  ({ level, program, kegiatan, sub_kegiatan: sub, indikator })
const TERSIMPAN: BarisTersimpan[] = [
  db('tujuan', 'Tujuan T *', null, null, 'Ind T *'),
  db('sasaran', 'Sasaran S **', null, null, 'Ind S **'),
  db('program', 'Program P ***', null, null, '(1) Ind P1 ***'),
  db('program', 'Program P ***', null, null, '(2) Ind P2 ***'),
  db('kegiatan', 'Program P ***', 'Kegiatan K ****', null, 'Ind K ****'),
]
const br = (level: CommitRow['level'], nama: string, indikator: string, induk: Partial<CommitRow> = {}): CommitRow => ({
  level, kode: null, nama, indikator, satuan: 'Dok', jenis: 'Akumulatif', target_tahunan: 1, q: [0, 0, 0, 1], bulan: null, anggaran: null,
  outcome: null, induk_tujuan: null, induk_sasaran: null, induk_program: null, induk_kegiatan: null, ...induk,
})
sama('F1 induk sama persis: apa adanya', cocokkanInduk('program p ***', [], ['Program P ***'], false), { nama: 'program p ***' })
sama('F2 induk beda penanda: ejaan tersimpan', cocokkanInduk('Program P', ['Program P *'], ['Program P ***'], false), { nama: 'Program P ***' })
sama('F3 …level sedang diganti: ejaan berkas', cocokkanInduk('Program P', ['Program P *'], ['Program P ***'], true), { nama: 'Program P *' })
sama('F4 dua nama tersimpan hanya beda penanda: ganda', cocokkanInduk('Program P', [], ['Program P ***', 'Program P *'], false), { nama: null, ganda: ['Program P ***', 'Program P *'] })
sama('F5 tidak ada', cocokkanInduk('Program Q', ['Program P'], ['Program P ***'], false), { nama: null, ganda: [] })

const bersihF = [
  br('program', 'Program P', 'Ind P1', { induk_sasaran: 'Sasaran S' }),
  br('kegiatan', 'Kegiatan K', 'Ind K', { induk_program: 'Program P' }),
  br('kegiatan', 'Kegiatan Baru', 'Ind KB', { induk_program: 'Program P' }),
  br('sub-kegiatan', 'Sub Baru', 'Ind Sub', { induk_program: 'Program P', induk_kegiatan: 'Kegiatan K' }),
]
const hF = selaraskanImpor(bersihF, TERSIMPAN, 2099, false)
cek('F6 berkas bersih ke tahun berbintang: tidak ada yang ditahan', hF.ditahan.length === 0 && hF.layak.length === 4)
sama('F7 nama entitas yang sudah ada mengikuti ejaan tersimpan', hF.layak.map(r => r.nama), ['Program P ***', 'Kegiatan K ****', 'Kegiatan Baru', 'Sub Baru'])
sama('F8 induk disambung ke ejaan tersimpan', [hF.layak[0].induk_sasaran, hF.layak[1].induk_program, hF.layak[2].induk_program, hF.layak[3].induk_program, hF.layak[3].induk_kegiatan],
  ['Sasaran S **', 'Program P ***', 'Program P ***', 'Program P ***', 'Kegiatan K ****'])
sama('F9 indikator mengenai baris lamanya (calon tunggal)', [hF.layak[0].indikator, hF.layak[1].indikator, hF.layak[2].indikator], ['(1) Ind P1 ***', 'Ind K ****', 'Ind KB'])
cek('F10 jumlah yang disesuaikan dilaporkan; masukan tidak diubah', hF.disesuaikan === 4 && bersihF[0].nama === 'Program P')
const kembar = selaraskanImpor([br('program', 'Program P', '(2) Ind P1', { induk_sasaran: 'Sasaran S' })], TERSIMPAN, 2099, false)
cek('F11 nomor bertentangan: indikator tidak ditempelkan ke kembarannya', kembar.layak[0].indikator === '(2) Ind P1')
const rebut = selaraskanImpor([br('program', 'Program P', 'Ind P1', { induk_sasaran: 'Sasaran S' }), br('program', 'Program P', 'Ind P1 *', { induk_sasaran: 'Sasaran S' })], TERSIMPAN, 2099, false)
sama('F12 dua baris berkas memperebutkan satu indikator: keduanya apa adanya', rebut.layak.map(r => r.indikator), ['Ind P1', 'Ind P1 *'])
const lain = selaraskanImpor([br('program', 'Program Lain', 'Ind P1', { induk_sasaran: 'Sasaran S' })], TERSIMPAN, 2099, false)
cek('F13 indikator senama milik entitas lain tidak disentuh', lain.layak[0].indikator === 'Ind P1' && lain.layak[0].nama === 'Program Lain')
const gF = selaraskanImpor(bersihF, TERSIMPAN, 2099, true)
sama('F14 mode ganti: level di berkas memakai ejaan berkas', [gF.layak[0].nama, gF.layak[0].indikator, gF.layak[1].induk_program, gF.layak[0].induk_sasaran], ['Program P', 'Ind P1', 'Program P', 'Sasaran S **'])
sama('F14b berkas berbintang ke data bersih: tetap tersambung', cocokkanInduk('Program P ***', [], ['Program P'], false), { nama: 'Program P' })
const gF2 = selaraskanImpor([br('program', 'Program P *', 'Ind P1', { induk_sasaran: 'Sasaran S' }), br('kegiatan', 'Kegiatan K', 'Ind K', { induk_program: 'Program P' })], TERSIMPAN, 2099, true)
cek('F14c mode ganti: anak disambung ke induk yang ditulis berkas, bukan yang dihapus', gF2.layak[1].induk_program === 'Program P *')
const tahan = selaraskanImpor([br('kegiatan', 'K', 'I', { induk_program: 'Program Q' }), br('kegiatan', 'K2', 'I2'), br('sub-kegiatan', 'S', 'I3', { induk_kegiatan: 'Kegiatan K' })], TERSIMPAN, 2099, false)
cek('F15 induk tak dikenal, kosong, dan sub tanpa program tetap ditahan', tahan.layak.length === 0 && tahan.ditahan.length === 3
  && tahan.ditahan[0].alasan.includes('belum ada di tahun 2099') && tahan.ditahan[2].alasan === 'Program induk belum ditentukan.')
const gandaF = selaraskanImpor([br('kegiatan', 'K', 'I', { induk_program: 'Program P' })], [...TERSIMPAN, db('program', 'Program P *', null, null, 'Ind lain')], 2099, false)
cek('F16 induk ganda ditahan dengan sebabnya', gandaF.layak.length === 0 && gandaF.ditahan[0].alasan.includes('hanya berbeda penanda'))
const impor = tanpaKomentar(baca('lib/renaksi/import-data.ts'))
cek('F17 commit impor lewat penyelaras, tanpa pencocok kedua', impor.includes("selaraskanImpor(rows, tersimpan, tahun, mode === 'ganti')") && !impor.includes('PARENT_OF') && !/\bnorm\(/.test(impor))

console.log(`\n${lulus + gagal.length} pemeriksaan · ${lulus} lulus · ${gagal.length} gagal`)
if (gagal.length) { console.log('\nGAGAL:'); for (const g of gagal) console.log('  ✗ ' + g); process.exit(1) }
