// Regresi header & pilihan footer LKJIP (konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §2).
// npx tsx scripts/test-lkjip-header-footer.mts — bagian F memakai LibreOffice sungguhan (tidak ada = GAGAL).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import PizZip from 'pizzip'
import { buildFooterXml, buildHeaderXml, rakitDocx, adaKaki, adaKepala } from '../lib/lkjip/docgen'
import { buildNumberedTree, type SectionFlat, type BlockNode } from '../lib/lkjip/numbering'
import { DEFAULT_STYLE, StyleConfigSchema, type StyleConfig } from '../lib/lkjip/schemas'
import { teksKepalaKaki } from '../lib/lkjip/impor-word'
import { cariLibreOffice, ubahKePdf } from '../lib/lkjip/pdf'

let lulus = 0, gagal = 0
const ok = (nama: string, syarat: boolean, info?: unknown) => {
  if (syarat) { lulus++; console.log(`  ✓ ${nama}`) } else { gagal++; console.log(`  ✗ ${nama}${info !== undefined ? `\n      ${typeof info === 'string' ? info.slice(0, 600) : JSON.stringify(info).slice(0, 600)}` : ''}`) }
}
const buangKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const baca = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const gaya = (s: Partial<StyleConfig>): StyleConfig => ({ ...DEFAULT_STYLE, ...s })

// ─── A. XML footer & header ───
console.log('A. XML footer & header')
// Keluaran SEBELUM §2 (disalin dari docgen lama) — bawaan wajib persis sama.
const PAGE = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE \\* MERGEFORMAT </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>'
const fTanpaTeks = buildFooterXml(DEFAULT_STYLE)
ok('A1 bawaan tanpa teks: nomor di tengah, XML sama dgn sebelum §2', fTanpaTeks.includes(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${PAGE}`), fTanpaTeks)
const fTeks = buildFooterXml(gaya({ footerText: 'LKJIP & RS' }))
ok('A2 bawaan dgn teks: teks kiri + tab kanan di tepi bidang tulis, XML sama dgn sebelum §2',
  fTeks.includes('<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="8788"/></w:tabs></w:pPr><w:r><w:rPr>') && fTeks.includes('LKJIP &amp; RS</w:t></w:r><w:r><w:tab/></w:r>' + PAGE), fTeks)
const fMati = buildFooterXml(gaya({ pageNumber: false, footerText: 'Teks saja' }))
ok('A3 nomor halaman mati + teks: teks tampil, TANPA field PAGE (D5)', fMati.includes('Teks saja') && !fMati.includes('PAGE'), fMati)
const fTengah = buildFooterXml(gaya({ footerText: 'T', nomorPosisi: 'tengah' }))
ok('A4 posisi tengah + teks: tab TENGAH di separuh bidang tulis', fTengah.includes('<w:tab w:val="center" w:pos="4394"/>') && !fTengah.includes('w:val="right"'), fTengah)
ok('A5 posisi tengah melintang: separuh bidang tulis melintang', buildFooterXml(gaya({ footerText: 'T', nomorPosisi: 'tengah' }), 13662).includes('w:pos="6831"'))
ok('A6 posisi kanan tanpa teks: nomor rata kanan', buildFooterXml(gaya({ nomorPosisi: 'kanan' })).includes('<w:jc w:val="right"/></w:pPr>' + PAGE))
ok('A7 posisi tengah tanpa teks = tengah', buildFooterXml(gaya({ nomorPosisi: 'tengah' })).includes('<w:jc w:val="center"/></w:pPr>' + PAGE))
const fGaris = buildFooterXml(gaya({ footerText: 'T', footerGaris: true }))
ok('A8 garis footer = batas ATAS paragraf, SEBELUM tabs (urutan skema pPr)', /<w:pPr><w:pBdr><w:top w:val="single"[^>]*\/><\/w:pBdr><w:tabs>/.test(fGaris), fGaris)
const h = buildHeaderXml(gaya({ headerText: '  Laporan <Kinerja>  ', headerRata: 'kanan', headerGaris: true }))
ok('A9 header: rata kanan, garis BAWAH sebelum jc, teks di-trim & di-escape', /<w:hdr [^>]*><w:p><w:pPr><w:pBdr><w:bottom w:val="single"[^>]*\/><\/w:pBdr><w:jc w:val="right"\/><\/w:pPr>/.test(h) && h.includes('>Laporan &lt;Kinerja&gt;</w:t>'), h)
ok('A10 header rata kiri/tengah', buildHeaderXml(gaya({ headerText: 'x', headerRata: 'kiri' })).includes('<w:jc w:val="left"/>') && buildHeaderXml(gaya({ headerText: 'x' })).includes('<w:jc w:val="center"/>'))
ok('A11 adaKepala: spasi saja = tanpa header', !adaKepala(gaya({ headerText: '   ' })) && adaKepala(gaya({ headerText: 'x' })))
ok('A12 adaKaki: nomor ATAU teks', adaKaki(gaya({})) && adaKaki(gaya({ pageNumber: false, footerText: 'x' })) && !adaKaki(gaya({ pageNumber: false, footerText: '  ' })))

// ─── B. Dokumen utuh ───
console.log('\nB. Dokumen utuh (rakitDocx)')
const sec: SectionFlat[] = [
  { id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 },
  { id: 2, parent_id: 1, depth: 1, urutan: 0, judul: 'Latar Belakang', locked: 0 },
  { id: 3, parent_id: null, depth: 0, urutan: 1, judul: 'PENUTUP', locked: 1 },
]
const tabel = (judul: string, extra: Record<string, unknown> = {}) => ({ judul, kolom: ['No', 'Uraian'], headerRows: 1, rows: [[{ v: 'No' }, { v: 'Uraian' }], [{ v: '1' }, { v: 'Satu' }]], ...extra })
const blk = new Map<number, BlockNode[]>([
  [2, [{ id: 21, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Isi latar belakang.</p>' } }, { id: 22, tipe: 'TABEL', urutan: 1, payload: tabel('Tabel mendatar', { melintang: true }) }]],
  [3, [{ id: 31, tipe: 'NARASI', urutan: 0, payload: { html: '<p>Penutup.</p>' } }]],
] as Array<[number, BlockNode[]]>)
const rakit = async (s: Partial<StyleConfig>) => (await rakitDocx({ tree: buildNumberedTree(sec, blk), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: gaya(s) })).buffer
const bongkar = (buf: Buffer) => { const z = new PizZip(buf); return { z, doc: z.file('word/document.xml')!.asText(), sect: z.file('word/document.xml')!.asText().match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g) ?? [] } }

const tanpaHeader = bongkar(await rakit({}))
ok('B1 tanpa header: tidak ada header.xml, rel, maupun headerReference (dokumen lama persis sama)',
  !tanpaHeader.z.file('word/header.xml') && !tanpaHeader.z.file('word/_rels/document.xml.rels')!.asText().includes('header') && !tanpaHeader.doc.includes('headerReference'))
const dgnHeader = bongkar(await rakit({ headerText: 'LKJIP 2099' }))
ok('B2 ada header: header.xml + rel rId6 + content type', !!dgnHeader.z.file('word/header.xml') && dgnHeader.z.file('word/_rels/document.xml.rels')!.asText().includes('Id="rId6"') && dgnHeader.z.file('[Content_Types].xml')!.asText().includes('/word/header.xml'))
ok('B3 sampul (section pertama) tanpa header & footer', !/Reference/.test(dgnHeader.sect[0] ?? 'Reference'), dgnHeader.sect[0])
ok('B4 halaman daftar (romawi) & semua section isi memakai header', dgnHeader.sect.slice(1).every(s => s.includes('<w:headerReference r:id="rId6" w:type="default"/>')) && dgnHeader.sect.length >= 4, dgnHeader.sect.map(s => s.slice(0, 120)))
ok('B5 section melintang: header rId6 + footer melintang rId5', dgnHeader.sect.some(s => s.includes('rId6') && s.includes('<w:footerReference r:id="rId5"')))
ok('B6 headerReference sebelum footerReference (urutan skema sectPr)', dgnHeader.sect.slice(1).every(s => s.indexOf('headerReference') < s.indexOf('footerReference')))
const tanpaNomorTeks = bongkar(await rakit({ pageNumber: false, footerText: 'LKJIP RSJD' }))
ok('B7 nomor mati + teks footer: section isi memakai footer, TANPA pgNumType', tanpaNomorTeks.sect.slice(1).every(s => s.includes('footerReference') && !s.includes('pgNumType')), tanpaNomorTeks.sect)
ok('B8 nomor mati + teks: sampul tetap section sendiri tanpa footer', tanpaNomorTeks.sect.length >= 2 && !/Reference/.test(tanpaNomorTeks.sect[0] ?? 'Reference'))
const polosSemua = bongkar(await rakit({ pageNumber: false }))
ok('B9 nomor mati, tanpa teks, tanpa header: tidak ada rujukan header/footer sama sekali', !/Reference/.test(polosSemua.doc))
const hanyaHeader = bongkar(await rakit({ pageNumber: false, headerText: 'H' }))
ok('B10 hanya header (nomor mati): sampul dipisah section supaya tidak ikut ber-header', !/Reference/.test(hanyaHeader.sect[0] ?? 'Reference') && hanyaHeader.sect.slice(1).every(s => s.includes('headerReference') && !s.includes('footerReference')), hanyaHeader.sect)
const arabHeader = bongkar(await rakit({ romanFront: false, headerText: 'H' }))
ok('B11 tanpa romawi: daftar berbagi section dgn isi, tetap ber-header; sampul tidak', !/Reference/.test(arabHeader.sect[0] ?? 'Reference') && arabHeader.sect.slice(1).every(s => s.includes('headerReference')))

// ─── C. Skema ───
console.log('\nC. Skema')
const lama = StyleConfigSchema.parse({ fontFamily: 'Arial', pageNumber: true, footerText: 'x' })
ok('C1 setelan lama tanpa kunci baru → bawaan = perilaku lama', lama.headerText === '' && lama.headerRata === 'tengah' && !lama.headerGaris && !lama.footerGaris && lama.nomorPosisi === 'otomatis')
ok('C2 kunci baru TIDAK dibuang Zod', StyleConfigSchema.parse({ headerText: 'H', headerRata: 'kiri', headerGaris: true, footerGaris: true, nomorPosisi: 'kanan' }).nomorPosisi === 'kanan')
ok('C3 pilihan di luar daftar ditolak', !StyleConfigSchema.safeParse({ headerRata: 'atas' }).success && !StyleConfigSchema.safeParse({ nomorPosisi: 'kiri' }).success && !StyleConfigSchema.safeParse({ headerText: 'x'.repeat(121) }).success)
ok('C4 DEFAULT_STYLE memuat semua kunci baru', ['headerText', 'headerRata', 'headerGaris', 'footerGaris', 'nomorPosisi'].every(k => k in DEFAULT_STYLE))

// ─── D. Impor Word ───
console.log('\nD. Impor Word')
const rels = new Map([['rH1', { target: 'header1.xml', luar: false }], ['rF1', { target: 'footer1.xml', luar: false }], ['rF2', { target: 'footer2.xml', luar: false }], ['rX', { target: 'http://x', luar: true }]])
const berkas: Record<string, string> = {
  'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Laporan</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Kinerja &amp; Anggaran</w:t></w:r></w:p></w:hdr>',
  'word/footer1.xml': '<w:ftr><w:p><w:r><w:t>LKJIP RSJD</w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>7</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:fldSimple w:instr="DATE"><w:r><w:t>1/1/2026</w:t></w:r></w:fldSimple></w:p></w:ftr>',
  'word/footer2.xml': '<w:ftr><w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>3</w:t></w:r></w:fldSimple></w:p></w:ftr>',
}
const ambil = (n: string) => berkas[n] ?? null
const doc = (...sect: string[]) => `<w:body>${sect.map(s => `<w:p><w:pPr><w:sectPr>${s}</w:sectPr></w:pPr></w:p>`).join('')}</w:body>`
const kk1 = teksKepalaKaki(doc('<w:headerReference w:type="default" r:id="rH1"/><w:footerReference w:type="default" r:id="rF1"/>'), rels, ambil)
ok('D1 teks polos: tab → spasi, entitas didekode, hasil field (PAGE "7", DATE) dibuang', kk1.header === 'Laporan Kinerja & Anggaran' && kk1.footer === 'LKJIP RSJD', kk1)
const kk2 = teksKepalaKaki(doc('<w:footerReference w:type="default" r:id="rF1"/>', '<w:pgSz/>'), rels, ambil)
ok('D2 section terakhir tanpa rujukan MEWARISI dari section sebelumnya (aturan Word)', kk2.footer === 'LKJIP RSJD' && kk2.header === '', kk2)
const kk3 = teksKepalaKaki(doc('<w:footerReference w:type="default" r:id="rF1"/>', '<w:footerReference w:type="first" r:id="rF1"/><w:footerReference w:type="default" r:id="rF2"/>'), rels, ambil)
ok('D3 yang terdekat menang; footer berisi field saja → kosong; type first diabaikan', kk3.footer === '', kk3)
berkas['word/http://x'] = '<w:hdr><w:p><w:r><w:t>DARI LUAR</w:t></w:r></w:p></w:hdr>'   // seandainya ada: tetap tidak boleh dibaca
ok('D4 rujukan luar (TargetMode External) tidak dibaca', teksKepalaKaki(doc('<w:headerReference w:type="default" r:id="rX"/>'), rels, ambil).header === '')
berkas['word/header1.xml'] = `<w:hdr><w:p><w:r><w:t>${'a'.repeat(200)}</w:t></w:r></w:p></w:hdr>`
ok('D5 dipotong 120 huruf (batas skema)', teksKepalaKaki(doc('<w:headerReference w:type="default" r:id="rH1"/>'), rels, ambil).header.length === 120)
const rute = buangKomentar(baca('app/api/lkjip/impor/route.ts'))
ok('D6 route impor membawa header & footer ke style_config', /headerText: hasil\.kepalaKaki\.header, footerText: hasil\.kepalaKaki\.footer/.test(rute))

// ─── E. Layar ───
console.log('\nE. Layar ⚙ Pengaturan')
const ed = buangKomentar(baca('app/(dashboard)/lkjip/[id]/editor-client.tsx'))
const isianFooter = /<input type="text" value=\{styleForm\.footerText\}[^\n]*/.exec(ed)?.[0] ?? ''
ok('E1 teks footer TIDAK lagi mati saat nomor halaman mati (D5)', isianFooter !== '' && !isianFooter.includes('disabled'), isianFooter)
ok('E2 isian header, rata, garis, letak nomor ada', ['styleForm.headerText', 'styleForm.headerRata', 'styleForm.headerGaris', 'styleForm.footerGaris', 'styleForm.nomorPosisi'].every(k => ed.includes(`value={${k}`) || ed.includes(`value={${k} ?`)))
ok('E3 letak nomor mati bila nomor halaman mati; rata & garis header mati bila teks header kosong',
  /value=\{styleForm\.nomorPosisi\} disabled=\{!styleForm\.pageNumber\}/.test(ed) && /value=\{styleForm\.headerRata\} disabled=\{!styleForm\.headerText\.trim\(\)\}/.test(ed) && /value=\{styleForm\.headerGaris \? '1' : '0'\} disabled=\{!styleForm\.headerText\.trim\(\)\}/.test(ed))

// ─── F. PDF sungguhan ───
console.log('\nF. PDF (LibreOffice)')
ok('F0 LibreOffice terpasang', cariLibreOffice() !== null, 'Pasang LibreOffice — bagian ini tidak boleh dilewati.')
if (cariLibreOffice()) {
  const req = createRequire(import.meta.url)
  const pdfjs = await import('file:///' + req.resolve('pdfjs-dist/legacy/build/pdf.mjs').replace(/\\/g, '/'))
  type Teks = { s: string; x: number; y: number; w: number; lebar: number }
  const halaman = async (buf: Buffer): Promise<Teks[][]> => {
    const d = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise
    const out: Teks[][] = []
    for (let i = 1; i <= d.numPages; i++) {
      const p = await d.getPage(i); const vp = p.getViewport({ scale: 1 })
      const t = await p.getTextContent()
      out.push((t.items as Array<{ str: string; transform: number[]; width: number }>).filter(x => x.str.trim()).map(x => ({ s: x.str.trim(), x: x.transform[4], y: x.transform[5], w: x.width, lebar: vp.width })))
    }
    return out
  }
  const pdfH = await halaman(await ubahKePdf(await rakit({ headerText: 'HEADER-UJI-2099', headerRata: 'kanan', nomorPosisi: 'kanan' })))
  const punyaHeader = pdfH.map(h => h.some(t => t.s === 'HEADER-UJI-2099'))
  ok('F1 header tampil di semua halaman KECUALI sampul', !punyaHeader[0] && punyaHeader.slice(1).every(Boolean), punyaHeader)
  const hdr = pdfH[1].find(t => t.s === 'HEADER-UJI-2099')!
  const tertinggi = Math.max(...pdfH[1].map(t => t.y))
  ok('F2 header di atas halaman, rata kanan', hdr.y === tertinggi && hdr.x + hdr.w > hdr.lebar * 0.75, { hdr, tertinggi })
  const nomorKanan = pdfH[pdfH.length - 1].reduce((a, t) => t.y < a.y ? t : a)
  ok('F3 letak nomor "kanan": angka di kaki halaman dekat tepi kanan', /^\d+$/.test(nomorKanan.s) && nomorKanan.x > nomorKanan.lebar * 0.75, nomorKanan)
  const pdfT = await halaman(await ubahKePdf(await rakit({ nomorPosisi: 'tengah' })))
  const nomorTengah = pdfT[pdfT.length - 1].reduce((a, t) => t.y < a.y ? t : a)
  const tengah = nomorTengah.x + nomorTengah.w / 2
  ok('F4 letak nomor "tengah": angka di tengah kaki halaman', /^\d+$/.test(nomorTengah.s) && Math.abs(tengah - nomorTengah.lebar * 0.55) < nomorTengah.lebar * 0.1, nomorTengah)
  const pdfM = await halaman(await ubahKePdf(await rakit({ pageNumber: false, footerText: 'KAKI-TANPA-NOMOR' })))
  const kaki = pdfM.map(h => h.some(t => t.s === 'KAKI-TANPA-NOMOR'))
  ok('F5 nomor halaman mati + teks footer: teks tampil di halaman daftar & isi, bukan sampul (D5)', !kaki[0] && kaki.slice(1).every(Boolean), kaki)
  ok('F6 nomor halaman mati: tidak ada angka di kaki halaman', pdfM.slice(1).every(h => !/^\d+$/.test(h.reduce((a, t) => t.y < a.y ? t : a).s)))
}

console.log(`\n${lulus} lulus, ${gagal} gagal`)
process.exit(gagal ? 1 : 0)
