// scripts/test-pk-sesuai-pdf.mts — dokumen PK mengikuti format PK Perubahan 2026
//
//   npx tsx --env-file=.env.local scripts/test-pk-sesuai-pdf.mts
//
// Konsep: docs/CONCEPT-pk-halaman-2-sesuai-pdf.md. Bagian A–F tidak menyentuh basis data
// (fungsi murni + dokumen disusun dari templat sungguhan ke buffer). Bagian G menjalankan
// aturan pisah satuan versi SQL (berkas migrasinya sendiri) di tabel SEMENTARA dan
// membandingkannya dengan versi TypeScript; tanpa basis data bagian itu GAGAL, bukan dilewati.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import PizZip from 'pizzip'
import { buangBintangUjung, rapikanIndikator, rapikanNamaEntitas } from '../lib/shared/nama-resmi'
import { angkaTarget, fmtTarget, gabungTargetSatuan, pisahTargetSatuan, satuanTarget } from '../lib/shared/target-renaksi'
import {
  buildAnggaranTableXml, buildLampiranTableXml, escapeXml, kelompokSasaran, nominalAnggaran, targetDanSatuan,
  KOLOM_ANGGARAN, KOLOM_SASARAN, LEBAR_BIDANG, type BarisAnggaranPk, type BarisLampiranPk,
} from '../lib/pk/tabel-word'
import { fmtJabatan, fmtJabatanTtd, namaBerkasPk, rakitPkDocx, templatPk, type PkDokumenForGenerate } from '../lib/pk/docgen'
import { pilihanSasaran, sidikLampiran, sisipLampiran } from '../lib/pk/pilihan-sasaran'
import { rapikanBarisProgram, rapikanBarisSasaran } from '../lib/pk/rapikan-nama'
import { buangProgramKembar } from '../lib/pk/program-kembar'
import { buangBintang } from '../lib/kinerja/master-nama'
import { DokumenCreateBodySchema, SasaranBodySchema } from '../lib/data/pk-schemas'

let lulus = 0
const gagal: string[] = []
function cek(nama: string, syarat: boolean) { if (syarat) lulus++; else gagal.push(nama) }
function sama(nama: string, dapat: unknown, harap: unknown) {
  cek(`${nama} — dapat ${JSON.stringify(dapat)}, harap ${JSON.stringify(harap)}`, JSON.stringify(dapat) === JSON.stringify(harap))
}
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── A. Nama tanpa penanda matriks Renaksi ────────────────────────────────────
sama('A1 bintang di ujung dibuang', rapikanNamaEntitas('PROGRAM X ***'), 'PROGRAM X')
sama('A2 bintang berselang spasi', rapikanNamaEntitas('PROGRAM X  ***  '), 'PROGRAM X')
sama('A3 bintang di tengah tetap', rapikanNamaEntitas('Belanja *khusus* lain'), 'Belanja *khusus* lain')
sama('A4 nama yang isinya hanya bintang tidak dikosongkan', rapikanNamaEntitas(' *** '), '***')
sama('A5 indikator: nomor depan + bintang', rapikanIndikator('(1) Jumlah Dokumen *****'), 'Jumlah Dokumen')
sama('A6 indikator: nomor di ujung tetap', rapikanIndikator('Kelas (3)'), 'Kelas (3)')
sama('A7 indikator: nomor di tengah tetap', rapikanIndikator('Rasio 1:2 (2) baik'), 'Rasio 1:2 (2) baik')
sama('A8 indikator: tiga digit bukan nomor urut', rapikanIndikator('(100) Orang'), '(100) Orang')
sama('A9 indikator: hanya nomor tidak dikosongkan', rapikanIndikator('(1)'), '(1)')
for (const s of ['(1) (2) X ***', 'PROGRAM X ***', '(12)  Jumlah', 'biasa', '***', '(3) *'])
  cek(`A10 idempoten: ${s}`, rapikanIndikator(rapikanIndikator(s)) === rapikanIndikator(s)
    && rapikanNamaEntitas(rapikanNamaEntitas(s)) === rapikanNamaEntitas(s))
sama('A11 nama entitas tidak membuang nomor depan', rapikanNamaEntitas('(1) Program'), '(1) Program')
sama('A12 E-Anggaran memakai aturan yang sama', buangBintang('PROGRAM X ***'), buangBintangUjung('PROGRAM X ***'))
cek('A13 E-Anggaran tidak menyimpan salinan regex', !/replace\(/.test(tanpaKomentar(baca('lib/kinerja/master-nama.ts'))))

// ── B. Target & satuan ───────────────────────────────────────────────────────
const CONTOH_PISAH: Array<[string | null, { target: string; satuan: string } | null]> = [
  ['765 Orang', { target: '765', satuan: 'Orang' }],
  ['3 Laporan Bulanan', { target: '3', satuan: 'Laporan Bulanan' }],
  ['100%', { target: '100', satuan: '%' }],
  ['86,72 %', { target: '86,72', satuan: '%' }],
  ['92 Persen', { target: '92', satuan: '%' }],
  ['1.000 Orang', { target: '1.000', satuan: 'Orang' }],
  ['  5 Unit Kerja ', { target: '5', satuan: 'Unit Kerja' }],
  ['520 Orang/Bulan', { target: '520', satuan: 'Orang/Bulan' }],
  ['0%', { target: '0', satuan: '%' }],
  ['Baik', null],
  ['100', null],
  ['1-2 Kali', null],
  ['10. Laporan', null],
  ['7 ' + 'x'.repeat(51), null],
  ['7 ' + 'x'.repeat(50), { target: '7', satuan: 'x'.repeat(50) }],
  ['', null],
  [null, null],
]
CONTOH_PISAH.forEach(([teks, harap], i) => sama(`B1.${i + 1} pisah ${JSON.stringify(teks?.slice(0, 20) ?? null)}`, pisahTargetSatuan(teks), harap))
sama('B2 angka DECIMAL dari mysql2', angkaTarget('765.00'), '765')
sama('B3 desimal berkoma', angkaTarget('86.72'), '86,72')
sama('B4 bukan angka → kosong', angkaTarget(null), '')
sama('B5 Persen → %', satuanTarget(' Persen '), '%')
sama('B6 satuan lain apa adanya', satuanTarget('Orang/Bulan'), 'Orang/Bulan')
sama('B7 gabung persen', gabungTargetSatuan('37', '%'), '37%')
sama('B8 gabung satuan biasa', gabungTargetSatuan('765', 'Orang'), '765 Orang')
sama('B9 gabung tanpa satuan (dokumen lama)', gabungTargetSatuan('92 Persen', null), '92 Persen')
sama('B10 gabung tanpa target', gabungTargetSatuan('', 'Orang'), '')
sama('B11 fmtTarget IKI tidak berubah', [fmtTarget('765.00', 'Orang'), fmtTarget('37.00', 'Persen'), fmtTarget(null, 'Orang')], ['765 Orang', '37%', ''])
for (const [teks, harap] of CONTOH_PISAH) if (harap)
  cek(`B12 pisah lalu gabung = bentuk baku: ${teks?.slice(0, 20)}`, pisahTargetSatuan(gabungTargetSatuan(harap.target, harap.satuan))?.target === harap.target)

// ── C. Tabel 1 & 2 ───────────────────────────────────────────────────────────
const L = (o: Partial<BarisLampiranPk>): BarisLampiranPk => ({
  uraian: 'S', indikator: null, target: null, satuan: null, level: 'kegiatan', program: 'P', kegiatan: null, subkegiatan: null, ...o,
})
const LAMPIRAN: BarisLampiranPk[] = [
  L({ kegiatan: 'Sasaran A', uraian: 'Sasaran A', indikator: '(1) Indikator A1 ****', target: '5', satuan: 'Dokumen' }),
  L({ kegiatan: 'Sasaran A', uraian: 'Sasaran A', indikator: '(2) Indikator A2 ****', target: '86,72', satuan: '%' }),
  L({ kegiatan: 'Sasaran A', uraian: 'Sasaran A', indikator: '(3) Indikator A3 ****', target: '765 Orang', satuan: null }),
  L({ kegiatan: 'Sasaran B ****', uraian: 'Sasaran B ****', indikator: 'Indikator B', target: null, satuan: null }),
  L({ kegiatan: 'Sasaran A', uraian: 'Sasaran A', indikator: 'Indikator A terpisah', target: 'Baik', satuan: null }),
]
const barisXml = (xml: string) => xml.split('<w:tr>').slice(1)
const teksSel = (tr: string) => tr.split('<w:tc>').slice(1).map(tc => [...tc.matchAll(/<w:t [^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join(''))
const t1 = buildLampiranTableXml(LAMPIRAN)
const r1 = barisXml(t1)

sama('C1 lima kolom', [...t1.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1])), [...KOLOM_SASARAN])
cek('C2 lebar tabel 1 muat di bidang tulis', KOLOM_SASARAN.reduce((a, b) => a + b, 0) <= LEBAR_BIDANG)
// Diukur di Word: "NO" tebal 12 pt ≈ 18 pt; isi sel = lebar kolom − 216 dxa tepi. Di bawah 600 dxa ia patah.
cek('C2a kolom NO cukup lebar untuk "NO" dan "(1)"', KOLOM_SASARAN[0] >= 650 && KOLOM_ANGGARAN[0] >= 650)
cek('C2b lebar tabel 2 muat di bidang tulis', KOLOM_ANGGARAN.reduce((a, b) => a + b, 0) <= LEBAR_BIDANG)
sama('C3 judul kolom mengikuti level', teksSel(r1[0]), ['NO', 'Sasaran Kegiatan', 'Indikator Kinerja', 'Satuan', 'Target'])
sama('C4 penomoran (1)…(5)', teksSel(r1[1]), ['(1)', '(2)', '(3)', '(4)', '(5)'])
sama('C5 baris level', teksSel(r1[2]), ['Kegiatan'])
cek('C6 baris level selebar lima kolom', r1[2].includes('<w:gridSpan w:val="5"/>'))
cek('C7 tiga baris kepala diulang tiap halaman', r1.slice(0, 3).every(r => r.includes('<w:tblHeader/>')) && r1.slice(3).every(r => !r.includes('<w:tblHeader/>')))
cek('C8 kepala tebal, isi tidak', r1.slice(0, 3).every(r => r.includes('<w:b/>')) && r1.slice(3).every(r => !r.includes('<w:b/>')))
sama('C9 sasaran berindikator tiga: baris pertama', teksSel(r1[3]), ['1', 'Sasaran A', 'Indikator A1', 'Dokumen', '5'])
sama('C10 baris kedua: nomor & sasaran kosong', teksSel(r1[4]), ['', '', 'Indikator A2', '%', '86,72'])
sama('C11 satuan lama yang menempel dipisah saat dicetak', teksSel(r1[5]), ['', '', 'Indikator A3', 'Orang', '765'])
cek('C12 sel gabung dibuka sekali per kelompok', (r1[3].match(/<w:vMerge w:val="restart"\/>/g) ?? []).length === 2)
cek('C13 sel gabung diteruskan di dua baris berikutnya', [r1[4], r1[5]].every(r => (r.match(/<w:vMerge\/>/g) ?? []).length === 2))
sama('C14 sasaran berikutnya nomor 2, isi kosong tetap kosong', teksSel(r1[6]), ['2', 'Sasaran B', 'Indikator B', '', ''])
cek('C15 sasaran berindikator satu tanpa sel gabung', !r1[6].includes('<w:vMerge'))
sama('C16 sasaran sama yang TIDAK berurutan bernomor sendiri', teksSel(r1[7]), ['3', 'Sasaran A', 'Indikator A terpisah', '', 'Baik'])
sama('C17 kelompok', kelompokSasaran(LAMPIRAN).map(g => g.baris.length), [3, 1, 1])
cek('C18 tanpa arsiran', !t1.includes('<w:shd'))
cek('C19 huruf 12 pt di semua sel', [...t1.matchAll(/<w:sz w:val="(\d+)"\/>/g)].every(m => m[1] === '24') && t1.includes('<w:sz w:val="24"/>'))
cek('C20 tabel 1 bergaris', r1.every(r => r.includes('w:val="single"')))
sama('C21 level program', teksSel(barisXml(buildLampiranTableXml([L({ level: 'program', program: 'P1', uraian: 'P1' })]))[0])[1], 'Sasaran Program')
sama('C22 level sub kegiatan', teksSel(barisXml(buildLampiranTableXml([L({ level: 'subkegiatan', subkegiatan: 'S1', uraian: 'S1' })]))[2]), ['Sub Kegiatan'])
const kosong1 = barisXml(buildLampiranTableXml([]))
cek('C23 tanpa sasaran: kepala tetap ada + satu baris keterangan', kosong1.length === 4 && teksSel(kosong1[3])[0].includes('Tidak ada sasaran'))
sama('C24 target dan satuan terisi tidak dipisah lagi', targetDanSatuan({ target: '5 Unit', satuan: 'Paket' }), { target: '5 Unit', satuan: 'Paket' })

const ANGGARAN: BarisAnggaranPk[] = [
  { uraian: 'u', keterangan_sumber: 'BLUD', nominal: '3000000000.00', level: 'kegiatan', program: 'PROGRAM A ***', kegiatan: 'Kegiatan A ****', subkegiatan: null },
  { uraian: 'u', keterangan_sumber: 'APBD', nominal: 55500000, level: 'kegiatan', program: 'PROGRAM A ***', kegiatan: 'Kegiatan B', subkegiatan: null },
  { uraian: 'Uraian saja', keterangan_sumber: 'BLUD', nominal: 0, level: 'kegiatan', program: null, kegiatan: null, subkegiatan: null },
]
const t2 = buildAnggaranTableXml(ANGGARAN)
const r2 = barisXml(t2)
sama('D1 empat kolom', [...t2.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1])), [...KOLOM_ANGGARAN])
sama('D2 judul', teksSel(r2[0]), ['NO', 'Kegiatan', 'Anggaran (Rp)', 'Keterangan'])
sama('D3 nominal tanpa Rp, nama tanpa bintang', teksSel(r2[1]), ['1', 'Kegiatan A', '3.000.000.000', 'BLUD'])
sama('D4 baris kedua', teksSel(r2[2]), ['2', 'Kegiatan B', '55.500.000', 'APBD'])
sama('D5 nol ditulis 0', teksSel(r2[3]), ['3', 'Uraian saja', '0', 'BLUD'])
cek('D6 tanpa garis', !t2.includes('w:val="single"') && t2.includes('<w:insideH w:val="nil"/>'))
cek('D7 nominal rata kanan', r2[1].split('<w:tc>')[3].includes('<w:jc w:val="right"/>'))
cek('D8 tanpa arsiran, 12 pt', !t2.includes('<w:shd') && [...t2.matchAll(/<w:sz w:val="(\d+)"\/>/g)].every(m => m[1] === '24'))
cek('D9 didahului paragraf jeda', t2.startsWith('<w:p><w:pPr><w:spacing w:before="240"'))
sama('D10 nominal bukan angka → 0', [nominalAnggaran(null), nominalAnggaran('abc'), nominalAnggaran(1234.4)], ['0', '0', '1.234'])

sama('E1 teks berbahaya di-escape', escapeXml(`a<b>&"c'`), 'a&lt;b&gt;&amp;&quot;c&apos;')
sama('E2 karakter kendali dibuang, tab & baris baru jadi spasi', escapeXml('a\u0000b\u000Bc\td\ne￾'), 'abc d e')
cek('E3 tabel memakai escape', buildLampiranTableXml([L({ kegiatan: 'A & <B>', uraian: 'A & <B>' })]).includes('A &amp; &lt;B&gt;'))

// ── F. Dokumen utuh dari templat sungguhan ───────────────────────────────────
const DATA: PkDokumenForGenerate = {
  id: 1, tahun: '2026', tanggal_dokumen: '2026-11-06', jenis_pk: 'PERUBAHAN',
  unit_pertama: 'Wakil Direktur Pelayanan', nama_pertama: 'dr. RETNO WURYAN', jabatan_pertama: 'Plt. WAKIL DIREKTUR PELAYANAN',
  pangkat_pertama: 'Pembina', nip_pertama: '111',
  unit_kedua: 'Direktur', nama_kedua: 'NAMA DIREKTUR', jabatan_kedua: 'DIREKTUR', pangkat_kedua: 'Pembina Utama', nip_kedua: '222',
  lampiran: LAMPIRAN, anggaran: ANGGARAN,
}
// Keputusan pemilik 11 Nov 2026: jabatan & Plt. tetap bentuk PRIMA, bukan bentuk PDF.
sama('F1 jabatan halaman 1', fmtJabatan('Plt. WAKIL DIREKTUR PELAYANAN'), 'Plt. Wakil Direktur Pelayanan RSJD Dr. Amino Gondohutomo')
sama('F2 jabatan atasan', fmtJabatan('DIREKTUR'), 'Direktur RSJD Dr. Amino Gondohutomo')
sama('F3 jabatan tanda tangan', fmtJabatanTtd('Plt. WAKIL DIREKTUR PELAYANAN'), 'Plt. WAKIL DIREKTUR PELAYANAN')
sama('F4 nama berkas', namaBerkasPk(DATA), 'PK-2026-Wakil-Direktur-Pelayanan-PERUBAHAN.docx')

for (const jenis of ['MURNI', 'PERUBAHAN'] as const) {
  const templat = readFileSync(new URL(`../lib/pk/templates/${templatPk(jenis)}`, import.meta.url))
  const buf = await rakitPkDocx({ ...DATA, jenis_pk: jenis }, templat)
  const xml = new PizZip(buf).file('word/document.xml')!.asText()
  const teks = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(m => m[1]).join('¦')
  cek(`F5 ${jenis}: tidak ada placeholder tersisa`, !/\{[@a-z_]+\}/.test(teks))
  cek(`F6 ${jenis}: tabel sasaran ikut utuh`, xml.includes(t1))
  cek(`F7 ${jenis}: tabel anggaran ikut utuh`, xml.includes(t2))
  sama(`F8 ${jenis}: semua section A4 tegak`, [...xml.matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/g)].map(m => `${m[1]}x${m[2]}`), ['11907x16839', '11907x16839'])
  const mar = [...xml.matchAll(/<w:pgMar [^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/g)].map(m => 11907 - Number(m[1]) - Number(m[2]))
  cek(`F9 ${jenis}: tabel muat di bidang tulis halaman 2 (${mar[1]} dxa)`, KOLOM_SASARAN.reduce((a, b) => a + b, 0) <= mar[1])
  cek(`F10 ${jenis}: baris Unit Kerja bentuk PRIMA`, teks.includes('Plt. Wakil Direktur Pelayanan RSJD Dr. Amino Gondohutomo'))
  cek(`F11 ${jenis}: tanda tangan bentuk PRIMA`, teks.includes('Plt. WAKIL DIREKTUR PELAYANAN') && teks.includes('dr. RETNO WURYAN') && !teks.includes('Plt. dr.'))
  cek(`F12 ${jenis}: tanpa arsiran di seluruh dokumen`, !xml.includes('<w:shd'))
  cek(`F13 ${jenis}: tanggal Indonesia`, teks.includes('6 November 2026'))
}

// ── G. Pilihan sasaran di form, Rapikan Nama, Master Program ─────────────────
const MASTER = [
  { program: 'P', indikator_program: 'IP ***', target_program: '10', satuan_program: '%', kegiatan: 'K1', indikator_kegiatan: '(1) IK1 ****', target_kegiatan: '4 Dokumen', satuan_kegiatan: null, subkegiatan: 'S1', indikator_subkegiatan: 'IS1', target_subkegiatan: '1', satuan_subkegiatan: 'Paket' },
  { program: 'P', indikator_program: 'IP ***', target_program: '10', satuan_program: '%', kegiatan: 'K1', indikator_kegiatan: '(2) IK2 ****', target_kegiatan: '5', satuan_kegiatan: 'Unit', subkegiatan: 'S2', indikator_subkegiatan: 'IS2', target_subkegiatan: '2', satuan_subkegiatan: 'Paket' },
  { program: 'P', indikator_program: 'IP2', target_program: '3', satuan_program: 'Laporan', kegiatan: 'K1', indikator_kegiatan: 'IK1', target_kegiatan: '4', satuan_kegiatan: 'Dokumen', subkegiatan: 'S1', indikator_subkegiatan: 'IS1', target_subkegiatan: '1', satuan_subkegiatan: 'Paket' },
  { program: 'P', indikator_program: 'IP ***', target_program: '10', satuan_program: '%', kegiatan: 'K2', indikator_kegiatan: null, target_kegiatan: null, satuan_kegiatan: null, subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null, satuan_subkegiatan: null },
  { program: 'Q', indikator_program: 'IQ', target_program: '1', satuan_program: 'Unit', kegiatan: 'K1', indikator_kegiatan: 'IK lain', target_kegiatan: '9', satuan_kegiatan: 'Unit', subkegiatan: null, indikator_subkegiatan: null, target_subkegiatan: null, satuan_subkegiatan: null, _deleted: true },
]
const pk = pilihanSasaran(MASTER, 'kegiatan')
sama('G1 satu pilihan per sasaran', pk.map(p => p.label), ['K1', 'K2'])
sama('G2 semua indikator ikut; master lama & hasil tarik baru = satu indikator', pk[0].indikator,
  [{ indikator: 'IK1', target: '4', satuan: 'Dokumen' }, { indikator: 'IK2', target: '5', satuan: 'Unit' }])
sama('G3 sasaran tanpa indikator tetap jadi pilihan', pk[1].indikator, [])
sama('G4 level program: dua indikator berbeda', pilihanSasaran(MASTER, 'program')[0].indikator.map(i => i.indikator), ['IP', 'IP2'])
sama('G5 level sub: induknya terbawa', pilihanSasaran(MASTER, 'subkegiatan').map(p => [p.program, p.kegiatan, p.subkegiatan]), [['P', 'K1', 'S1'], ['P', 'K1', 'S2']])
cek('G6 baris bertanda hapus tidak ikut', !pilihanSasaran(MASTER, 'program').some(p => p.program === 'Q'))
cek('G7 sidik mengabaikan bintang & nomor', sidikLampiran('K1 ****', '(1) IK1 ****') === sidikLampiran('K1', 'IK1'))
const lama = [{ uraian: 'A', n: 1 }, { uraian: 'B', n: 2 }, { uraian: 'A ***', n: 3, _deleted: true }]
sama('G8 indikator baru disisipkan tepat sesudah sasaran yang sama', sisipLampiran(lama, [{ uraian: 'A', n: 9 }]).map(r => r.n), [1, 9, 2, 3])
sama('G9 sasaran baru di ujung', sisipLampiran(lama, [{ uraian: 'C', n: 9 }]).map(r => r.n), [1, 2, 3, 9])

const rapi = rapikanBarisSasaran(MASTER)
sama('G10 Rapikan: jumlah baris berubah', rapi.berubah, 3)
sama('G11 Rapikan: nama, nomor, satuan', [rapi.rows[0].indikator_program, rapi.rows[0].indikator_kegiatan, rapi.rows[0].target_kegiatan, rapi.rows[0].satuan_kegiatan], ['IP', 'IK1', '4', 'Dokumen'])
cek('G12 Rapikan: baris yang sudah bersih identitasnya tetap', rapi.rows[2] === MASTER[2])
sama('G13 Rapikan dua kali tidak mengubah lagi', rapikanBarisSasaran(rapi.rows).berubah, 0)
const prog = rapikanBarisProgram([
  { program: 'PROGRAM X ***', kegiatan: null, subkegiatan: null },
  { program: 'PROGRAM X', kegiatan: null, subkegiatan: null },
  { program: 'PROGRAM X ***', kegiatan: 'Kegiatan Y ****', subkegiatan: null },
  { program: 'program x', kegiatan: 'KEGIATAN Y', subkegiatan: '' },
])
sama('G14 Master Program: dirapikan + kembar digabung', [prog.rows.length, prog.berubah, prog.kembar], [2, 2, 2])
sama('G15 kembar: yang pertama dipertahankan', buangProgramKembar([{ program: 'A', kegiatan: 'k' }, { program: 'a ', kegiatan: 'K' }, { program: 'B' }]).unik.map(r => r.program), ['A', 'B'])

// ── H. Pintu tulis & baca membawa satuan (L69) ───────────────────────────────
const pkData = baca('lib/data/pk.ts')
cek('H1 penulis isi dokumen menulis satuan', /'pk_dokumen_lampiran',\s*\[[^\]]*'target','satuan'/.test(pkData)
  && pkData.includes('l.target ?? null, l.satuan || null,'))
cek('H2 PATCH memakai penulis yang sama', /gantiIsiDokumen[\s\S]*?await tulisIsiDokumen\(conn, id, d\)/.test(pkData))
const rutePost = tanpaKomentar(baca('app/api/perjanjian-kinerja/dokumen/route.ts'))
cek('H3 POST memakai penulis yang sama, tanpa daftar kolom sendiri', rutePost.includes('await tulisIsiDokumen(conn, id, d)') && !rutePost.includes('bulkInsert('))
cek('H4 nama disimpan tanpa penanda', pkData.includes('rapikanNamaEntitas(l.uraian), rapikanIndikatorAtauNull(l.indikator)') && pkData.includes('rapikanNamaEntitas(a.uraian)'))
cek('H5 GET dokumen membaca satuan', /SELECT id, unit_kerja, level, program, kegiatan, subkegiatan, uraian, indikator, target, satuan, urutan/.test(baca('app/api/perjanjian-kinerja/dokumen/[id]/route.ts')))
cek('H6 pembuat Word membaca satuan', /SELECT uraian, indikator, target, satuan, level/.test(baca('lib/pk/docgen.ts')))
const ruteSasaran = baca('app/api/perjanjian-kinerja/sasaran/route.ts')
for (const t of ['program', 'kegiatan', 'subkegiatan']) {
  cek(`H7 Master Sasaran membaca satuan_${t}`, new RegExp(`target_${t}, satuan_${t}`).test(ruteSasaran))
  cek(`H8 Master Sasaran menulis satuan_${t}`, ruteSasaran.includes(`'target_${t}','satuan_${t}'`) && ruteSasaran.includes(`r.satuan_${t} || null`))
}
// Penyusun baris tarik Renaksi tinggal di lib (dipakai juga pembanding "Rencana Aksi berubah").
const ruteTarik = tanpaKomentar(baca('lib/pk/selaras-renaksi.ts'))
cek('H9 tarik Renaksi: target angka saja + satuan sendiri', (ruteTarik.match(/angkaTarget\(String\(r\.target_tahunan\)\)/g) ?? []).length === 3 && (ruteTarik.match(/satuanTarget\(r\.satuan\) \|\| null/g) ?? []).length === 3)
cek('H10 tarik Renaksi: nama & indikator dibersihkan', (ruteTarik.match(/rapikanIndikator\(r\.indikator\)/g) ?? []).length === 3 && (ruteTarik.match(/rapikanNamaEntitas\(/g) ?? []).length === 3)
cek('H11 tarik Master Program dibersihkan', (tanpaKomentar(baca('app/api/perjanjian-kinerja/program/import-renaksi/route.ts')).match(/rapikanNamaEntitas\(r\.(program|kegiatan|sub_kegiatan) \?\? ''\)/g) ?? []).length === 3)
const ruteProgram = tanpaKomentar(baca('app/api/perjanjian-kinerja/program/route.ts'))
cek('H12 Master Program: kembar digabung sebelum ditulis', ruteProgram.includes('buangProgramKembar(parsed.data.rows)') && ruteProgram.includes("'ER_DUP_ENTRY'"))
const formKlien = baca('app/(dashboard)/perjanjian-kinerja/form/form-client.tsx')
cek('H13 form memuat & mengirim satuan', formKlien.includes('satuan: (l.satuan as string) ?? null') && formKlien.includes('target: l.target, satuan: l.satuan,'))
cek('H14 LKJIP tetap menampilkan target + satuan', baca('lib/lkjip/sumber/pk.ts').includes('sel.target = gabungTargetSatuan(r.target, r.satuan)'))

const sasaranLebar = { unit_kerja: 'U', level: 'subkegiatan', uraian: 'x'.repeat(500), subkegiatan: 'x'.repeat(500), satuan: 'Orang', urutan: 0 }
const dok = { tahun: '2099', tanggal_dokumen: '2099-01-01', jenis_pk: 'MURNI', unit_pertama: 'a', nama_pertama: 'a', jabatan_pertama: 'a', unit_kedua: 'b', nama_kedua: 'b', jabatan_kedua: 'b', anggaran: [] }
cek('H15 sasaran 500 huruf diterima dokumen', DokumenCreateBodySchema.safeParse({ ...dok, lampiran: [sasaranLebar] }).success)
cek('H16 sasaran 501 huruf ditolak', !DokumenCreateBodySchema.safeParse({ ...dok, lampiran: [{ ...sasaranLebar, uraian: 'x'.repeat(501) }] }).success)
cek('H17 satuan 51 huruf ditolak', !DokumenCreateBodySchema.safeParse({ ...dok, lampiran: [{ ...sasaranLebar, satuan: 'x'.repeat(51) }] }).success)
const zs = SasaranBodySchema.safeParse({ tahun: '2099', rows: [{ program: 'P', target_program: '5', satuan_program: ' Orang ' }] })
cek('H18 skema Master Sasaran membawa satuan', zs.success && zs.data.rows[0].satuan_program === 'Orang')
const skema = baca('docs/schema-mysql.sql')
cek('H19 skema acuan memuat keempat kolom satuan', ['satuan_program', 'satuan_kegiatan', 'satuan_subkegiatan'].every(k => skema.includes(k)) && /target\s+VARCHAR\(255\),\s+satuan\s+VARCHAR\(50\)/.test(skema))

// ── I. Aturan pisah versi SQL = versi TypeScript (tabel sementara) ───────────
const migrasi = baca('docs/migrations/migration-pk-satuan.sql')
const perintah = migrasi.split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n').split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean)
const pisahSql = perintah.filter(p => p.startsWith('UPDATE'))
sama('I1 migrasi: tiga UPDATE master + satu lampiran', pisahSql.map(p => /UPDATE (\w+)/.exec(p)?.[1]), ['pk_sasaran', 'pk_sasaran', 'pk_sasaran', 'pk_dokumen_lampiran'])
cek('I2 migrasi: dokumen FINAL tidak disentuh', pisahSql[3].includes("WHERE status = 'DRAFT'"))
cek('I3 migrasi: satuan dibaca sebelum target ditimpa', pisahSql.every(p => p.indexOf('satuan') < p.indexOf('REGEXP_SUBSTR')))
try {
  const mysql = createRequire(import.meta.url)('mysql2/promise') as typeof import('mysql2/promise')
  const c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, connectTimeout: 8000,
  })
  try {
    await c.query('CREATE TEMPORARY TABLE uji_pk_pisah_satuan (id INT AUTO_INCREMENT PRIMARY KEY, target_program VARCHAR(255), satuan_program VARCHAR(50), updated_at DATETIME DEFAULT CURRENT_TIMESTAMP) COLLATE utf8mb4_unicode_ci')
    for (const [teks] of CONTOH_PISAH) await c.query('INSERT INTO uji_pk_pisah_satuan (target_program) VALUES (?)', [teks])
    const sql = pisahSql[0].replace(/pk_sasaran/g, 'uji_pk_pisah_satuan')
    await c.query(sql)
    const [ulang] = await c.query(sql) as unknown as [{ affectedRows: number }]
    sama('I4 SQL: diulang tidak mengubah apa pun', ulang.affectedRows, 0)
    const [rows] = await c.query('SELECT target_program AS t, satuan_program AS s FROM uji_pk_pisah_satuan ORDER BY id') as unknown as [Array<{ t: string | null; s: string | null }>]
    CONTOH_PISAH.forEach(([teks, harap], i) => sama(`I5.${i + 1} SQL = TS untuk ${JSON.stringify(teks?.slice(0, 20) ?? null)}`,
      [rows[i].t, rows[i].s], harap ? [harap.target, harap.satuan] : [teks, null]))
  } finally { await c.end() }
} catch (e) {
  gagal.push(`I basis data tidak terjangkau (${(e as { code?: string }).code ?? (e as Error).message}) — jalankan dengan --env-file=.env.local`)
}

console.log(`\n${lulus + gagal.length} pemeriksaan · ${lulus} lulus · ${gagal.length} gagal`)
if (gagal.length) { console.log('\nGAGAL:'); for (const g of gagal) console.log('  ✗ ' + g); process.exit(1) }
