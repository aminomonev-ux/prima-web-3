// scripts/test-lkjip-impor-word.mts — Impor LKJIP dari Word (docs/CONCEPT-lkjip-impor-word.md).
//
//   npx tsx --env-file=.env.local scripts/test-lkjip-impor-word.mts [berkas-kalibrasi.docx]
//
// A. Pembaca pada docx buatan uji: bab dua baris, sub-bab bergaya Normal, keterangan terpecah,
//    judul dari Daftar Tabel, grid berserpih + gabungan, daftar terpotong (start), romawi, gambar,
//    grafik bergambar, melintang, tabel tidak muat, LAMPIRAN kosong, Kata Pengantar + tanda tangan.
// B. Koreksi pratinjau. C. Variasi berkas (tanpa Judul 1, keterangan di bawah, .doc, bukan zip).
// D. Penyaring & Word: <ol start> bertahan dan jadi startOverride; ekspor LKJIP → impor balik.
// E. Tulis sungguhan lewat createDokumen (MySQL, tahun kotak pasir 2099), dihapus sesudahnya.
// F. Kalibrasi bila berkas pemilik diberikan (tidak pernah disalin ke repo).

import { readFileSync, existsSync } from 'node:fs'
import PizZip from 'pizzip'
import mysql from 'mysql2/promise'
import { bacaDocxLkjip, ImporWordError, type HasilImporWord, type BagianImpor, type BarisPratinjau } from '../lib/lkjip/impor-word'
import { parseBlockPayload, sanitizeNarasiHtml, DEFAULT_STYLE, type BlockTipe } from '../lib/lkjip/schemas'
import { buildNumberedTree, flattenTree, type SectionFlat, type BlockNode } from '../lib/lkjip/numbering'
import { rakitDocx } from '../lib/lkjip/docgen'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}

// ── Penyusun docx uji ────────────────────────────────────────────────────────
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r = (t: string, o: { b?: boolean; u?: boolean; i?: boolean } = {}) =>
  `<w:r>${o.b || o.u || o.i ? `<w:rPr>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`
const tab = '<w:r><w:tab/></w:r>'
const sect = (melintang = false) => `<w:sectPr><w:pgSz w:w="${melintang ? 16839 : 11907}" w:h="${melintang ? 11907 : 16839}"${melintang ? ' w:orient="landscape"' : ''}/></w:sectPr>`
interface OpsiP { gaya?: string; num?: [number, number]; jc?: string; sect?: boolean | 'melintang'; pb?: boolean }
const p = (isi: string, o: OpsiP = {}) => {
  const pPr = `${o.gaya ? `<w:pStyle w:val="${o.gaya}"/>` : ''}${o.num ? `<w:numPr><w:ilvl w:val="${o.num[1]}"/><w:numId w:val="${o.num[0]}"/></w:numPr>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}${o.sect ? sect(o.sect === 'melintang') : ''}`
  const badan = isi.startsWith('<w:r') ? isi : isi ? r(isi) : ''
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${o.pb ? '<w:r><w:br w:type="page"/></w:r>' : ''}${badan}</w:p>`
}
const gbr = (rid: string) => `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
interface Sel { t: string; span?: number; vm?: 'restart' | 'continue'; b?: boolean; jc?: string; w?: number }
const tc = (s: Sel) => `<w:tc><w:tcPr>${s.w ? `<w:tcW w:w="${s.w}" w:type="dxa"/>` : ''}${s.span ? `<w:gridSpan w:val="${s.span}"/>` : ''}${s.vm ? `<w:vMerge${s.vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}</w:tcPr>${p(s.t ? r(s.t, { b: s.b }) : '', { jc: s.jc })}</w:tc>`
const tbl = (grid: number[], baris: { hdr?: boolean; sel: Sel[] }[]) =>
  `<w:tbl><w:tblPr/>${grid.length ? `<w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>` : ''}${baris.map(b => `<w:tr>${b.hdr ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${b.sel.map(tc).join('')}</w:tr>`).join('')}</w:tbl>`

const STYLES = `<?xml version="1.0" encoding="UTF-8"?><w:styles ${NS}>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="JudulKu"><w:name w:val="Judul Kustom"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
</w:styles>`
// Indent bawaan daftar LKJIP: butir tanpa isian sendiri = `<li>` polos (indent per paragraf diuji di test-lkjip-penggaris).
const lvl = (i: number, fmt: string, start = 1) => `<w:lvl w:ilvl="${i}"><w:start w:val="${start}"/><w:numFmt w:val="${fmt}"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>`
const NUMBERING = `<?xml version="1.0" encoding="UTF-8"?><w:numbering ${NS}>
  <w:abstractNum w:abstractNumId="10">${lvl(0, 'decimal')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="11">${lvl(0, 'lowerLetter')}${lvl(1, 'decimal')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="12">${lvl(0, 'bullet')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="13">${lvl(0, 'lowerRoman')}</w:abstractNum>
  <w:abstractNum w:abstractNumId="14">${lvl(0, 'decimal', 2)}</w:abstractNum>
  <w:abstractNum w:abstractNumId="15">${lvl(0, 'decimal')}</w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="11"/></w:num>
  <w:num w:numId="3"><w:abstractNumId w:val="12"/></w:num>
  <w:num w:numId="4"><w:abstractNumId w:val="13"/></w:num>
  <w:num w:numId="5"><w:abstractNumId w:val="14"/></w:num>
  <w:num w:numId="7"><w:abstractNumId w:val="15"/></w:num>
  <w:num w:numId="8"><w:abstractNumId w:val="11"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>
</w:numbering>`
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex')
const JPG = Buffer.from('FFD8FFE000104A46494600010100000100010000FFD9', 'hex')
const EMF = Buffer.from('0100000088000000', 'hex')

function buatDocx(body: string, opsi: { media?: Record<string, Buffer>; rels?: Record<string, string>; styles?: string | null; numbering?: string | null; judul?: string } = {}): Buffer {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}${sect()}</w:body></w:document>`)
  if (opsi.styles !== null) zip.file('word/styles.xml', opsi.styles ?? STYLES)
  if (opsi.numbering !== null) zip.file('word/numbering.xml', opsi.numbering ?? NUMBERING)
  const rels = Object.entries(opsi.rels ?? {}).map(([id, t]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${t}"/>`).join('')
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`)
  for (const [nama, isi] of Object.entries(opsi.media ?? {})) zip.file(`word/media/${nama}`, isi)
  if (opsi.judul) zip.file('docProps/core.xml', `<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(opsi.judul)}</dc:title></cp:coreProperties>`)
  return zip.generate({ type: 'nodebuffer' }) as Buffer
}

const tabelA = tbl([1000, 50, 1500, 40, 2000, 30], [
  { hdr: true, sel: [{ t: 'No', span: 2, vm: 'restart' }, { t: 'Rincian', span: 4, jc: 'center' }] },
  { hdr: true, sel: [{ t: '', span: 2, vm: 'continue' }, { t: 'Uraian', span: 2 }, { t: 'Nilai', span: 2 }] },
  { sel: [{ t: '1', span: 2 }, { t: 'Gaji', span: 2 }, { t: '=bukan rumus', span: 2 }] },
  { sel: [{ t: '2', span: 2 }, { t: 'Lain', span: 2, b: true }, { t: '1.250.000', span: 2, jc: 'right' }] },
])
const tabelB = tbl([], [
  { sel: [{ t: 'Kolom A', w: 3000 }, { t: 'Kolom B', w: 1500 }] },
  { sel: [{ t: 'x', w: 3000 }, { t: 'y', w: 1500 }] },
])
const tabelC = tbl(Array.from({ length: 13 }, () => 600), [{ sel: Array.from({ length: 13 }, (_, i) => ({ t: `K${i + 1}` })) }])
const tabelE = tbl([1500, 1000, 1000], [
  { sel: [{ t: 'Ruang', vm: 'restart' }, { t: 'Kelas', span: 2 }] },
  { sel: [{ t: '', vm: 'continue' }, { t: 'VIP' }, { t: 'I' }] },
  { sel: [{ t: 'Psikiatri' }, { t: '6' }, { t: '12' }] },
])
const tabelD = tbl([2000, 2000, 2000, 2000], [{ sel: ['A', 'B', 'C', 'D'].map(t => ({ t })) }, { sel: ['1', '2', '3', '4'].map(t => ({ t })) }])

const BODY = [
  p('LAPORAN KINERJA', { jc: 'center', sect: true }),
  p('DAFTAR TABEL', { jc: 'center' }),
  p(`${r('Tabel 1 Judul Daftar Satu')}${tab}${r('3')}`),
  p(r('Tabel 2 Judul Dari Daftar Yang')),
  p(`${r('   Terpecah Dua Baris')}${tab}${r('4')}`, { sect: true }),
  p('KATA PENGANTAR', { jc: 'center' }),
  p(`${r('Puji syukur ')}${r('ke hadirat', { b: true })}${r(' Tuhan.')}`, { jc: 'both' }),
  p('Demikian kata pengantar ini.', { jc: 'both' }),
  p(''),
  p('Semarang, 20 Februari 2026', { jc: 'center' }),
  p('DIREKTUR RSJD UJI', { jc: 'center' }),
  p('PROVINSI JAWA TENGAH', { jc: 'center' }),
  p(''), p(''),
  p('dr. Nama Uji, M.Kes', { jc: 'center' }),
  p('Pembina Utama Muda', { jc: 'center' }),
  p('NIP. 19690211 200701 1 007', { jc: 'center', sect: true }),
  // ── BAB I ──
  p('BAB I', { gaya: 'Heading1', jc: 'center' }),
  p('PENDAHULUAN', { gaya: 'Heading1', jc: 'center' }),
  p('LATAR BELAKANG', { gaya: 'Heading2', num: [1, 0] }),
  p(`${r('Paragraf dengan ')}${r('tebal', { b: true })}${r(' dan ')}${r('garis', { u: true })}${r('.')}`, { jc: 'both' }),
  p('Visi Organisasi', { num: [2, 0] }),
  p('Penjelasan visi.'),
  p('Misi Organisasi', { num: [2, 0] }),
  p('Misi satu', { num: [2, 1] }),
  p('Misi dua', { num: [2, 1] }),
  p('Tujuan Organisasi', { num: [2, 0] }),
  p('Sasaran satu', { num: [2, 1] }),
  p('Butir romawi', { num: [4, 0] }),
  p('Butir bulat', { num: [3, 0] }),
  p('Butir mulai dua', { num: [5, 0] }),
  p('Daftar mulai ulang', { num: [8, 0] }),
  p('Tabel 1', { gaya: 'Heading3' }),
  p('Judul tabel satu', { gaya: 'Heading3' }),
  p('baris kedua judul', { gaya: 'Heading3' }),
  tabelA,
  p('', { gaya: 'Heading2' }),
  p('Landasan Hukum', { gaya: 'Heading2', num: [2, 0] }),
  p('DUKUNGAN SUMBER DAYA', { gaya: 'Heading2', num: [1, 0] }),
  p('Tabel 2', { jc: 'center' }),
  p('', { jc: 'center' }),
  tabelB,
  p('Gambar 1', { jc: 'center' }),
  p('Foto gedung', { jc: 'center' }),
  p(gbr('rIdPng'), { jc: 'center' }),
  p('Grafik 1 Grafik pendapatan', { gaya: 'Heading3' }),
  p(gbr('rIdJpg')),
  p(gbr('rIdPng')),
  p(gbr('rIdEmf')),
  p('Tabel 3 menunjukkan bahwa kinerja meningkat dibanding tahun lalu.', { jc: 'both' }),
  // ── BAB II ──
  p('BAB II PERENCANAAN KINERJA', { gaya: 'Heading1' }),
  p('Sub Dua', { gaya: 'Heading2', num: [7, 0] }),
  p('Isi sub dua.'),
  p('INOVASI', { num: [7, 0] }),
  p('Isi inovasi.', { sect: true }),
  p('Tabel 4 Tabel lebar', { gaya: 'Heading3' }),
  tabelD,
  p('Tabel 5 Tabel kebesaran', { gaya: 'Heading3' }),
  tabelC,
  p('', { sect: 'melintang' }),
  p('Gambar 2', { jc: 'center' }),
  p('Piagam', { jc: 'center' }),
  p(gbr('rIdPng'), { gaya: 'Heading1', pb: true }),
  // ── BAB III & IV ──
  p('BAB III', { gaya: 'Heading1' }),
  p('AKUNTABILITAS KINERJA', { gaya: 'Heading1' }),
  p('A. Capaian Kinerja', { gaya: 'JudulKu' }),
  p('Isi capaian.'),
  p('Tabel 6 Kapasitas', { gaya: 'Heading3' }),
  tabelE,
  p('BAB IV', { gaya: 'Heading1' }),
  p('PENUTUP', { gaya: 'Heading1' }),
  p('Kesimpulan', { gaya: 'Heading2' }),
  p('Isi kesimpulan.'),
  p('Tabel 7 Ringkasan anggaran'),
  p('Penjelasan sebelum tabel.', { jc: 'both' }),
  tabelD,
  p('LAMPIRAN', { gaya: 'Heading3' }),
].join('')
const MEDIA = { 'image1.png': PNG, 'image2.jpg': JPG, 'image3.emf': EMF }
const RELS = { rIdPng: 'media/image1.png', rIdJpg: 'media/image2.jpg', rIdEmf: 'media/image3.emf' }
const docx = buatDocx(BODY, { media: MEDIA, rels: RELS, judul: 'LKJIP Uji 2025' })

const semuaBagian = (bs: BagianImpor[]): BagianImpor[] => bs.flatMap(b => [b, ...semuaBagian(b.anak)])
const semuaBlok = (h: HasilImporWord) => semuaBagian(h.bagian).flatMap(b => b.blok)
const narasiDi = (b: BagianImpor) => b.blok.filter(x => x.tipe === 'NARASI').map(x => (x.payload as { html: string }).html).join('')
const penanda = (h: HasilImporWord, teks: string) => h.baris.find((b): b is Extract<BarisPratinjau, { jenis: 'penanda' }> => b.jenis === 'penanda' && b.teks.includes(teks))

console.log('\nA. Pembaca — docx buatan uji')
const h = bacaDocxLkjip(docx)
ok('A1 empat bab, judul tanpa "BAB n", semuanya dikunci (D4)',
  h.bagian.map(b => b.judul).join('|') === 'PENDAHULUAN|PERENCANAAN KINERJA|AKUNTABILITAS KINERJA|PENUTUP' && h.bagian.every(b => b.locked),
  h.bagian.map(b => `${b.judul}${b.locked ? '🔒' : ''}`).join('|'))
const subI = h.bagian[0].anak.map(b => b.judul)
ok('A2 sub-bab BAB I: Judul 2 + judul kosong dibuang', subI.join('|') === 'LATAR BELAKANG|Landasan Hukum|DUKUNGAN SUMBER DAYA', subI.join('|'))
ok('A3 INOVASI bergaya Normal, bernomor di daftar Judul 2 bab itu → sub-bab', h.bagian[1].anak.map(b => b.judul).join('|') === 'Sub Dua|INOVASI', h.bagian[1].anak.map(b => b.judul).join('|'))
ok('A4 gaya kustom ber-outlineLvl 1 = sub-bab, nomor ketikan "A. " dibuang', h.bagian[2].anak[0]?.judul === 'Capaian Kinerja', h.bagian[2].anak[0]?.judul)
ok('A5 Judul 2 bernomor di daftar lain diperingatkan', h.peringatan.some(x => x.includes('"Landasan Hukum" bergaya Judul 2')))
ok('A6 judul kosong dihitung', h.peringatan.includes('1 judul kosong dibuang.'), h.peringatan.join(' / '))
const nLB = narasiDi(h.bagian[0].anak[0])
ok('A7 tebal & garis bawah dibawa', nLB.includes('<strong>tebal</strong>') && nLB.includes('<u>garis</u>'), nLB.slice(0, 200))
ok('A8 daftar terpotong paragraf melanjutkan nomornya: Misi = <ol type="a" start="2">', nLB.includes('<ol type="a" start="2"><li><p>Misi Organisasi</p></li></ol>'), nLB)
ok('A9 butir tingkat 2 = daftar angka tersendiri, lalu Tujuan start=3', nLB.includes('<ol><li><p>Misi satu</p></li><li><p>Misi dua</p></li></ol><ol type="a" start="3"><li><p>Tujuan Organisasi</p></li></ol><ol><li><p>Sasaran satu</p></li></ol>'), nLB)
ok('A10 bullet → <ul>, mulai dari abstrak start=2 → <ol start="2">', nLB.includes('<ul><li><p>Butir bulat</p></li></ul>') && nLB.includes('<ol start="2"><li><p>Butir mulai dua</p></li></ol>'), nLB)
ok('A11 startOverride memulai hitungan sendiri (bukan lanjut dari num sebabstrak)', nLB.includes('<ol type="a"><li><p>Daftar mulai ulang</p></li></ol>'), nLB)
ok('A12 romawi jadi angka + diperingatkan (D2)', nLB.includes('<ol><li><p>Butir romawi</p></li></ol>') && h.peringatan.some(x => x.startsWith('1 butir daftar bernomor romawi')))

const tA = h.bagian[0].anak[0].blok.find(x => x.tipe === 'TABEL')
const pA = tA?.tipe === 'TABEL' ? tA.payload : null
ok('A13 keterangan Judul 3 terpecah tiga baris → satu judul', pA?.judul === 'Judul tabel satu baris kedua judul', pA?.judul)
ok('A14 grid 6 berserpih → 3 kolom nyata', pA?.kolom.join('|') === 'No|Uraian|Nilai', pA?.kolom.join('|'))
ok('A15 kepala = 2 baris "ulangi sebagai judul"', pA?.headerRows === 2)
ok('A16 gabungan tegak (vMerge) & mendatar (gridSpan)', pA?.rows[0][0].rs === 2 && pA?.rows[0][1].cs === 2 && pA?.rows[1][0].h === true && pA?.rows[0][2].h === true, JSON.stringify(pA?.rows.slice(0, 2)))
ok('A17 sel "=…" ditulis "＝…" supaya tidak jadi rumus', pA?.rows[2][2].v === '＝bukan rumus' && h.peringatan.some(x => x.startsWith('1 sel tabel diawali')))
ok('A18 tebal & rata per sel', pA?.rows[3][1].b === true && pA?.rows[3][2].al === 'right' && pA?.rows[0][1].al === 'center')
ok('A19 lebar kolom dari gridCol yang digabung (dxa/15)', JSON.stringify(pA?.colWidths) === '[70,103,135]', JSON.stringify(pA?.colWidths))
const dukung = h.bagian[0].anak[2]
const tB = dukung.blok.find(x => x.tipe === 'TABEL')
ok('A20 judul kosong diambil dari Daftar Tabel (entri terpecah dua baris, dipotong di tab)', tB?.tipe === 'TABEL' && tB.payload.judul === 'Judul Dari Daftar Yang Terpecah Dua Baris', tB?.tipe === 'TABEL' ? tB.payload.judul : '')
ok('A21 tabel tanpa gridCol: lebar dari tcW, kepala 1 baris', tB?.tipe === 'TABEL' && JSON.stringify(tB.payload.colWidths) === '[200,100]' && tB.payload.headerRows === 1)
const objekDukung = dukung.blok.filter(x => x.tipe !== 'NARASI')
ok('A22 "Gambar 1" + baris tengah → GAMBAR berjudul', objekDukung[1]?.tipe === 'GAMBAR' && (objekDukung[1].payload as { judul: string }).judul === 'Foto gedung')
ok('A23 "Grafik 1" bergambar → blok GRAFIK sumber gambar (D1)', objekDukung[2]?.tipe === 'GRAFIK' && (objekDukung[2].payload as { source: string }).source === 'gambar' && (objekDukung[2].payload as { judul: string }).judul === 'Grafik pendapatan')
ok('A24 gambar tanpa keterangan → GAMBAR tanpa judul; berkas yang sama diunggah sekali', objekDukung[3]?.tipe === 'GAMBAR' && (objekDukung[3].payload as { judul: string }).judul === '' && Object.keys(h.gambar).length === 2, Object.keys(h.gambar).join(','))
ok('A25 EMF dilewati + diperingatkan', !objekDukung[4] && h.ringkasan.gambarDilewati === 1 && h.peringatan.some(x => x.startsWith('1 gambar berformat selain')))
ok('A26 "Tabel 3 menunjukkan …" di narasi rata kiri-kanan TIDAK dianggap keterangan', narasiDi(dukung).includes('Tabel 3 menunjukkan bahwa'))
const b2 = h.bagian[1]
const tD = semuaBagian([b2]).flatMap(b => b.blok).find(x => x.tipe === 'TABEL')
ok('A27 tabel di section melintang → melintang: true', tD?.tipe === 'TABEL' && tD.payload.melintang === true && tD.payload.judul === 'Tabel lebar')
ok('A28 tabel 13 kolom tidak diimpor: penanda di narasi + peringatan', h.ringkasan.tabelDitolak === 1 && narasiDi(b2.anak[1]).includes('[Tabel 5 Tabel kebesaran tidak muat') && h.peringatan.some(x => x.startsWith('Tabel 5 tidak diimpor: 13 kolom')))
const gbrBab = semuaBagian([b2]).flatMap(b => b.blok).find(x => x.tipe === 'GAMBAR')
ok('A29 gambar di paragraf Judul 1 kosong tetap gambar (bukan judul kosong), berjudul dari keterangannya', gbrBab?.tipe === 'GAMBAR' && (gbrBab.payload as { judul: string }).judul === 'Piagam')
ok('A30 LAMPIRAN tanpa isi tidak dibuat + diperingatkan', !semuaBagian(h.bagian).some(b => /LAMPIRAN/.test(b.judul)) && h.peringatan.some(x => x.startsWith('LAMPIRAN tidak berisi')))
ok('A31 Kata Pengantar: isi tanpa baris tanda tangan', h.kataPengantar.paragraf === 2 && h.kataPengantar.html === '<p>Puji syukur <strong>ke hadirat</strong> Tuhan.</p><p>Demikian kata pengantar ini.</p>', h.kataPengantar.html)
ok('A32 tanda tangan: tempat-tanggal, jabatan 2 baris, nama, pangkat, NIP',
  JSON.stringify(h.kataPengantar.ttd) === JSON.stringify({ tempatTanggal: 'Semarang, 20 Februari 2026', jabatan: 'DIREKTUR RSJD UJI\nPROVINSI JAWA TENGAH', nama: 'dr. Nama Uji, M.Kes', pangkat: 'Pembina Utama Muda', nip: 'NIP. 19690211 200701 1 007' }),
  JSON.stringify(h.kataPengantar.ttd))
ok('A33 sampul & daftar tidak jadi isi; tidak ada bagian berjudul "Tabel n"', !semuaBagian(h.bagian).some(b => /^(Tabel|Gambar|Grafik)\s+\d/.test(b.judul) || /DAFTAR|LAPORAN KINERJA/.test(b.judul)))
ok('A34 judul berkas & tebakan tahun', h.judulBerkas === 'LKJIP Uji 2025' && h.tahunTebakan === null)
const tidakSah = semuaBlok(h).flatMap(b => { try { parseBlockPayload(b.tipe as BlockTipe, b.payload); return [] } catch (e) { return [`${b.tipe}: ${(e as Error).message.slice(0, 120)}`] } })
ok('A35 semua payload lolos skema editor (parseBlockPayload)', tidakSah.length === 0, tidakSah.join(' / '))
const ulang = bacaDocxLkjip(docx)
const tE = h.bagian[2].anak[0]?.blok.find(x => x.tipe === 'TABEL')
ok('A37 tanpa tanda "ulangi judul": kepala diperpanjang sejauh gabungan tegak baris pertama', tE?.tipe === 'TABEL' && tE.payload.headerRows === 2 && tE.payload.rows[0][0].rs === 2 && tE.payload.kolom.join('|') === 'Ruang|VIP|I',
  tE?.tipe === 'TABEL' ? `${tE.payload.headerRows} ${tE.payload.kolom.join('|')}` : 'tanpa tabel')
const kesimpulan = h.bagian[3].anak[0]
const tF = kesimpulan?.blok.find(x => x.tipe === 'TABEL')
ok('A38 keterangan rata kiri tidak menelan paragraf narasi di antaranya: tabel tanpa judul, keduanya tetap narasi',
  tF?.tipe === 'TABEL' && tF.payload.judul === '' && narasiDi(kesimpulan).includes('<p>Tabel 7 Ringkasan anggaran</p><p>Penjelasan sebelum tabel.</p>'),
  tF?.tipe === 'TABEL' ? `judul=${tF.payload.judul} · ${narasiDi(kesimpulan)}` : 'tanpa tabel')
ok('A36 dua kali baca = nomor penanda sama (koreksi menempel ke berkas yang sama)', JSON.stringify(ulang.baris) === JSON.stringify(h.baris))

console.log('\nB. Koreksi pratinjau')
const idLB = penanda(h, 'LATAR BELAKANG')!.id
const kNarasi = bacaDocxLkjip(docx, { [idLB]: 'narasi' })
ok('B1 sub-bab → narasi: bagiannya hilang, teksnya masuk narasi bab', kNarasi.bagian[0].anak.length === 2 && narasiDi(kNarasi.bagian[0]).includes('<p>LATAR BELAKANG</p>') && penanda(kNarasi, 'LATAR BELAKANG')?.kedalaman === null)
const idT1 = h.baris.find((b): b is Extract<BarisPratinjau, { jenis: 'objek' }> => b.jenis === 'objek' && b.judul.startsWith('Judul tabel satu'))!.penanda!
const kKet = bacaDocxLkjip(docx, { [idT1]: 'narasi' })
const tAk = kKet.bagian[0].anak[0].blok.find(x => x.tipe === 'TABEL')
ok('B2 judul objek → narasi: tabel tanpa judul, ketiga barisnya jadi narasi',
  tAk?.tipe === 'TABEL' && tAk.payload.judul === '' && narasiDi(kKet.bagian[0].anak[0]).includes('<p>Tabel 1</p><p>Judul tabel satu</p><p>baris kedua judul</p>'), narasiDi(kKet.bagian[0].anak[0]).slice(-200))
const kBuang = bacaDocxLkjip(docx, { [idT1]: 'buang' })
ok('B3 judul objek → buang: baris lanjutannya ikut dibuang', !narasiDi(kBuang.bagian[0].anak[0]).includes('baris kedua judul'))
const idBab3 = penanda(h, 'AKUNTABILITAS KINERJA')!.id
const kSub = bacaDocxLkjip(docx, { [idBab3]: 'sub' })
ok('B4 bab → sub-bab: pindah ke bab sebelumnya, bab sesudahnya tetap', kSub.bagian.length === 3 && kSub.bagian[1].anak.some(b => b.judul === 'AKUNTABILITAS KINERJA'), kSub.bagian.map(b => b.judul).join('|'))
ok('B5 bab ke-4 tidak lagi PENUTUP di posisinya → PENUTUP tetap dikunci (posisi 3)', kSub.bagian[2].judul === 'PENUTUP' && kSub.bagian[2].locked)
const idLandasan = penanda(h, 'Landasan Hukum')!.id
const kJudul = bacaDocxLkjip(docx, { [idLandasan]: 'judul' })
ok('B6 jadi judul objek tanpa objek sesudahnya → narasi + diperingatkan', kJudul.peringatan.some(x => x.includes('"Landasan Hukum" dijadikan judul objek')) && narasiDi(kJudul.bagian[0].anak[0]).includes('Landasan Hukum'))
const idSub2 = penanda(h, 'Sub Dua')!.id
ok('B7 koreksi pada nomor yang bukan penanda diabaikan', JSON.stringify(bacaDocxLkjip(docx, { 99999: 'bab', 3: 'bab' }).ringkasan) === JSON.stringify(h.ringkasan))
const kBab = bacaDocxLkjip(docx, { [idSub2]: 'bab' })
ok('B8 sub-bab → bab: jadi bab tak terkunci', kBab.bagian.some(b => b.judul === 'Sub Dua' && !b.locked) && kBab.bagian.length === 5)

console.log('\nC. Variasi berkas')
const tanpaJudul = buatDocx([
  p('BAB I PENDAHULUAN', { jc: 'center' }), p('Isi pertama.'),
  p('BAB II', { jc: 'center' }), p('PERENCANAAN KINERJA', { jc: 'center' }), p('Isi kedua.'),
].join(''))
const hTJ = bacaDocxLkjip(tanpaJudul)
ok('C1 tanpa gaya Judul: baris "BAB I …" jadi bab, judul baris berikut yang di tengah ikut', hTJ.bagian.map(b => b.judul).join('|') === 'PENDAHULUAN|PERENCANAAN KINERJA', hTJ.bagian.map(b => b.judul).join('|'))
const bawah = buatDocx([
  p('BAB I', { gaya: 'Heading1' }), p('PENDAHULUAN', { gaya: 'Heading1' }),
  p(gbr('rIdPng')), p('Gambar 1 Pertama', { gaya: 'Caption', jc: 'center' }),
  p(gbr('rIdJpg')), p('Gambar 2 Kedua', { gaya: 'Caption', jc: 'center' }),
].join(''), { media: MEDIA, rels: RELS })
const hBw = bacaDocxLkjip(bawah)
const gb = hBw.bagian[0].blok.filter(x => x.tipe === 'GAMBAR').map(x => (x.payload as { judul: string }).judul)
ok('C2 keterangan DI BAWAH gambar: arah mengikuti kebiasaan berkas, tidak menempel ke gambar berikutnya', gb.join('|') === 'Pertama|Kedua', gb.join('|'))
const tanpaJeda = buatDocx([
  p('KATA PENGANTAR'), p('Isi.'), p('Semarang, 1 Maret 2026'), p('KEPALA DINAS'), p('Nama Kepala'), p('Pembina'), p('NIP 123', { sect: true }),
  p('BAB I', { gaya: 'Heading1' }), p('PENDAHULUAN', { gaya: 'Heading1' }), p('x'),
].join(''))
const hTj = bacaDocxLkjip(tanpaJeda)
ok('C3 tanda tangan tanpa jeda kosong: dua baris terbawah = nama + pangkat, diperingatkan',
  hTj.kataPengantar.ttd.nama === 'Nama Kepala' && hTj.kataPengantar.ttd.pangkat === 'Pembina' && hTj.kataPengantar.ttd.jabatan === 'KEPALA DINAS' && hTj.peringatan.some(x => x.includes('tanpa jeda')),
  JSON.stringify(hTj.kataPengantar.ttd))
const tolakJadi = (data: Uint8Array) => { try { bacaDocxLkjip(data); return '' } catch (e) { return e instanceof ImporWordError ? e.message : `BUKAN ImporWordError: ${e}` } }
ok('C4 berkas .doc lama ditolak dengan petunjuk Simpan Sebagai', tolakJadi(Buffer.from('D0CF11E0A1B11AE1000000', 'hex')).includes('.doc'))
ok('C5 bukan zip ditolak', tolakJadi(Buffer.from('bukan berkas word sama sekali')).includes('bukan dokumen Word'))
const zipLain = new PizZip(); zipLain.file('a.txt', 'x')
ok('C6 zip tanpa word/document.xml ditolak', tolakJadi(zipLain.generate({ type: 'nodebuffer' }) as Buffer).includes('document.xml'))
ok('C7 tanpa styles.xml & numbering.xml tetap terbaca (Judul dikenali lewat outlineLvl paragraf)',
  bacaDocxLkjip(buatDocx(`<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr>${r('BAB I PENDAHULUAN')}</w:p>${p('Isi.')}`, { styles: null, numbering: null })).bagian[0]?.judul === 'PENDAHULUAN')

console.log('\nD. Penyaring narasi & Word')
ok('D1 penyaring mempertahankan start (angka saja), ol huruf juga', sanitizeNarasiHtml('<ol type="a" start="3" onclick="x"><li><p>a</p></li></ol><ol start="1"><li>b</li></ol><ol start="x9">')
  === '<ol type="a" start="3"><li><p>a</p></li></ol><ol><li>b</li></ol><ol>', sanitizeNarasiHtml('<ol type="a" start="3" onclick="x"><li><p>a</p></li></ol><ol start="1"><li>b</li></ol><ol start="x9">'))
ok('D2 bentuk keluaran Tiptap (start sebelum type + style) tetap dikenali', sanitizeNarasiHtml('<ol start="4" type="a" style="list-style-type: lower-alpha"><li><p>x</p></li></ol>') === '<ol type="a" start="4"><li><p>x</p></li></ol>')
const sec: SectionFlat[] = [{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 }]
const blk = new Map<number, BlockNode[]>([[1, [{ id: 11, tipe: 'NARASI', urutan: 0, payload: { html: '<ol start="3"><li><p>tiga</p></li></ol><ol type="a" start="2"><li><p>b</p></li></ol><ol><li><p>satu</p></li></ol>' } }]]])
const word = new PizZip((await rakitDocx({ tree: buildNumberedTree(sec, blk), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })).buffer)
const numXml = word.file('word/numbering.xml')!.asText()
ok('D3 Word: <ol start="3"> → startOverride 3, <ol type="a" start="2"> → startOverride 2', numXml.includes('<w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="3"/></w:lvlOverride>') && numXml.includes('<w:abstractNumId w:val="2"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="2"/></w:lvlOverride>'), numXml.slice(-500))
ok('D4 Word: daftar tanpa start tetap diberi startOverride 1 (tanpa itu Word menyambung daftar sebelumnya)', /<w:num w:numId="3"><w:abstractNumId w:val="1"\/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"\/><\/w:lvlOverride><\/w:num>/.test(numXml), numXml.slice(-300))
// Ekspor LKJIP → impor balik: struktur, tabel, dan nomor daftar kembali sama.
const secRt: SectionFlat[] = [
  { id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 },
  { id: 2, parent_id: 1, depth: 1, urutan: 0, judul: 'Latar Belakang', locked: 0 },
  { id: 3, parent_id: null, depth: 0, urutan: 1, judul: 'PENUTUP', locked: 1 },
  { id: 4, parent_id: 3, depth: 1, urutan: 0, judul: 'Kesimpulan', locked: 0 },
]
const tabelRt = { judul: 'Tabel bolak balik', kolom: ['No', 'Uraian'], headerRows: 1, rows: [[{ v: 'No' }, { v: 'Uraian' }], [{ v: '1' }, { v: 'Satu' }], [{ v: '2' }, { v: 'Dua', b: true }]] }
const blkRt = new Map<number, BlockNode[]>([
  [2, [{ id: 21, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Pembuka.</p><ol start="3"><li><p>tiga</p></li><li><p>empat</p></li></ol>' } }, { id: 22, tipe: 'TABEL', urutan: 1, payload: tabelRt }]],
  [4, [{ id: 41, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Penutup.</p>' } }]],
])
const hRt = bacaDocxLkjip((await rakitDocx({ tree: buildNumberedTree(secRt, blkRt), judul: 'Bolak balik', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })).buffer)
ok('D5 ekspor LKJIP → impor: bab & sub-bab kembali (nomor "1.1" di judul dibuang)', semuaBagian(hRt.bagian).map(b => b.judul).join('|') === 'PENDAHULUAN|Latar Belakang|PENUTUP|Kesimpulan', semuaBagian(hRt.bagian).map(b => b.judul).join('|'))
const tRt = hRt.bagian[0]?.anak[0]?.blok.find(x => x.tipe === 'TABEL')
ok('D6 ekspor → impor: tabel + judulnya kembali', tRt?.tipe === 'TABEL' && tRt.payload.judul === 'Tabel bolak balik' && tRt.payload.rows.map(rw => rw.map(c => c.v).join('/')).join('|') === 'No/Uraian|1/Satu|2/Dua' && tRt.payload.rows[2][1].b === true,
  tRt?.tipe === 'TABEL' ? JSON.stringify(tRt.payload.rows) : 'tanpa tabel')
ok('D7 ekspor → impor: daftar mulai 3 tetap mulai 3', narasiDi(hRt.bagian[0].anak[0]).includes('<ol start="3"><li><p>tiga</p></li><li><p>empat</p></li></ol>'), narasiDi(hRt.bagian[0].anak[0]))

console.log('\nE. Tulis sungguhan (MySQL, tahun 2099)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE })
} catch (e) { console.log(`DILEWATI bagian E: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e}) — jalankan dengan --env-file=.env.local`) }
const JUDUL_UJI = 'UJI impor word — dokumen sementara'
if (c) {
  const k = c
  const L = await import('../lib/lkjip/data')
  await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
  try {
    const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
    const tulis = (bs: BagianImpor[]): import('../lib/lkjip/data').BagianTulis[] => bs.map(b => ({
      judul: b.judul, locked: b.locked, anak: tulis(b.anak),
      blok: b.blok.map(bl => bl.tipe === 'GAMBAR' ? { tipe: bl.tipe, payload: { ...bl.payload, fileId: 'fileUjiGambar1234567' } }
        : bl.tipe === 'GRAFIK' ? { tipe: bl.tipe, payload: { ...bl.payload, imageFileId: 'fileUjiGrafik1234567' } } : { tipe: bl.tipe, payload: bl.payload }),
    }))
    const style = { ...DEFAULT_STYLE, kataPengantarHtml: h.kataPengantar.html, ttdNama: h.kataPengantar.ttd.nama, ttdNip: h.kataPengantar.ttd.nip, ttdJabatan: h.kataPengantar.ttd.jabatan }
    const { id, canonical_id } = await L.createDokumen(2099, JUDUL_UJI, Number(u[0].id), 'kosong', { style, bagian: tulis(h.bagian) })
    const d = (await L.getDokumenDetail(id))!
    const flat = flattenTree(d.tree)
    ok('E1 dokumen DRAFT baru ber-canonical', d.status === 'DRAFT' && /^LKJIP-\d{6}$/.test(canonical_id))
    ok('E2 pohon tertulis utuh: judul, urutan, kedalaman', JSON.stringify(d.tree.map(b => [b.judul, b.locked, b.children.map(s => s.judul)])) === JSON.stringify(h.bagian.map(b => [b.judul, b.locked ? 1 : 0, b.anak.map(s => s.judul)])),
      JSON.stringify(d.tree.map(b => [b.judul, b.locked, b.children.map(s => s.judul)])))
    const [jml] = await k.query(`SELECT COUNT(*) AS n FROM lkjip_block b JOIN lkjip_section s ON s.id = b.section_id WHERE s.dokumen_id = ?`, [id]) as [Array<{ n: number }>, unknown]
    ok('E3 jumlah blok sama dengan hasil baca', Number(jml[0].n) === semuaBlok(h).length, `${jml[0].n} vs ${semuaBlok(h).length}`)
    const blokDukung = d.tree[0].children[2].blocks.map(b => b.tipe).join(',')
    ok('E4 urutan blok dalam bagian terjaga', blokDukung === semuaBagian(h.bagian)[3].blok.map(b => b.tipe).join(','), blokDukung)
    const gr = d.tree[0].children[2].blocks.find(b => b.tipe === 'GRAFIK')?.payload as { source?: string; imageFileId?: string }
    ok('E5 GRAFIK sumber gambar lolos skema & tersimpan dengan fileId-nya', gr?.source === 'gambar' && gr.imageFileId === 'fileUjiGrafik1234567')
    ok('E6 Kata Pengantar & tanda tangan ke style_config', d.style_config.ttdNama === 'dr. Nama Uji, M.Kes' && d.style_config.kataPengantarHtml.includes('Puji syukur') && d.style_config.ttdJabatan.includes('\n'))
    const narasiStart = flat.flatMap(n => n.blocks).some(b => String((b.payload as { html?: string }).html ?? '').includes('start="2"'))
    ok('E7 <ol start> bertahan sampai DB (lewat penyaring)', narasiStart)
    // Payload rusak membatalkan SELURUH dokumen (satu transaksi), bukan dokumen setengah jadi.
    const [sebelum] = await k.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI]) as [Array<{ n: number }>, unknown]
    let ditolak = false
    try { await L.createDokumen(2099, JUDUL_UJI, Number(u[0].id), 'kosong', { style, bagian: [{ judul: 'X', locked: false, anak: [], blok: [{ tipe: 'TABEL', payload: { kolom: [] } }] }] }) } catch { ditolak = true }
    const [sesudah] = await k.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI]) as [Array<{ n: number }>, unknown]
    ok('E8 payload tak lolos skema → seluruh transaksi batal, tidak ada dokumen setengah jadi', ditolak && Number(sesudah[0].n) === Number(sebelum[0].n))
  } finally {
    await k.query('DELETE FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI])
    const [sisa] = await k.query('SELECT COUNT(*) AS n FROM lkjip_dokumen WHERE judul = ?', [JUDUL_UJI]) as [Array<{ n: number }>, unknown]
    ok('E9 dokumen uji dibersihkan', Number(sisa[0].n) === 0)
    await k.end()
  }
}

const kalibrasi = process.argv[2]
if (kalibrasi) {
  console.log('\nF. Kalibrasi berkas pemilik')
  if (!existsSync(kalibrasi)) ok('F0 berkas kalibrasi ada', false, kalibrasi)
  else {
    const t0 = Date.now()
    const hk = bacaDocxLkjip(readFileSync(kalibrasi))
    const dt = Date.now() - t0
    const flat = semuaBagian(hk.bagian)
    const tabel = semuaBlok(hk).filter(b => b.tipe === 'TABEL')
    const grafik = semuaBlok(hk).filter(b => b.tipe === 'GRAFIK')
    ok('F1 4 bab, semuanya BAB wajib terkunci', hk.bagian.length === 4 && hk.bagian.every(b => b.locked), hk.bagian.map(b => b.judul).join('|'))
    ok('F2 19 sub-bab (INOVASI & PENGHARGAAN ikut)', hk.ringkasan.sub === 19 && flat.some(b => b.judul === 'INOVASI') && flat.some(b => b.judul === 'PENGHARGAAN'), String(hk.ringkasan.sub))
    ok('F3 29 tabel, 0 ditolak, kolom nyata ≤ 12', tabel.length === 29 && hk.ringkasan.tabelDitolak === 0 && tabel.every(t => t.tipe === 'TABEL' && t.payload.kolom.length <= 12))
    ok('F4 9 gambar + 8 grafik bergambar', hk.ringkasan.gambar === 9 && grafik.length === 8 && grafik.every(g => (g.payload as { source: string }).source === 'gambar'), JSON.stringify(hk.ringkasan))
    ok('F5 semua tabel & grafik berjudul', tabel.every(t => t.tipe === 'TABEL' && t.payload.judul) && grafik.every(g => (g.payload as { judul: string }).judul))
    ok('F6 tidak ada judul objek yang jadi bagian', !flat.some(b => /^(Tabel|Gambar|Grafik)\s+\d/.test(b.judul)))
    ok('F7 Kata Pengantar + tanda tangan lengkap', hk.kataPengantar.paragraf > 0 && !!hk.kataPengantar.ttd.nama && /^NIP/.test(hk.kataPengantar.ttd.nip) && !!hk.kataPengantar.ttd.jabatan)
    const rusak = semuaBlok(hk).flatMap(b => { try { parseBlockPayload(b.tipe as BlockTipe, b.payload); return [] } catch (e) { return [`${b.tipe}: ${(e as Error).message.slice(0, 80)}`] } })
    ok('F8 semua payload lolos skema editor', rusak.length === 0, rusak.slice(0, 3).join(' / '))
    ok('F9 tabel melintang dikenali', tabel.some(t => t.tipe === 'TABEL' && t.payload.melintang))
    ok('F10 daftar terpotong paragraf melanjutkan nomornya ("Pernyataan Misi" = b.)', semuaBlok(hk).some(b => b.tipe === 'NARASI' && /<ol type="a" start="2"><li[^>]*><p>Pernyataan Misi Organisasi<\/p><\/li><\/ol>/.test(b.payload.html)))
    ok(`F11 dibaca < 2 detik (${dt} ms)`, dt < 2000)
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal${gagal.length ? ': ' + gagal.join(', ') : ''}`)
process.exit(gagal.length ? 1 : 0)
