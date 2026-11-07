// scripts/test-lkjip-impor-spasi.mts — spasi berkas Word saat impor (konsep CONCEPT-lkjip-daftar-word.md §12).
//
// A: pewarisan docDefaults → gaya → paragraf     C: atribut per paragraf     E: berkas Word
// B: Pengaturan Dokumen dari yang paling lazim    D: spasi kontekstual        F: sambungan & tempel
//
// Jalankan: npx tsx scripts/test-lkjip-impor-spasi.mts

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { bacaDocxLkjip } from '../lib/lkjip/impor-word'
import { DEFAULT_STYLE, StyleConfigSchema, sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { narasiToXml } from '../lib/lkjip/docgen'
import { tempelDariWord } from '../lib/lkjip/tempel-word'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const PANJANG = 'Kalimat isi yang cukup panjang supaya paragraf ini jadi patokan berkas. '.repeat(4)
const par = (t: string, ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`
const sp = (a: string) => `<w:spacing ${a}/>`
const gayaP = (id: string, nama: string, isi: string, dasar = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${nama}"/>${dasar ? `<w:basedOn w:val="${dasar}"/>` : ''}<w:pPr>${isi}</w:pPr></w:style>`
const gayaUmum = `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style>`
const berkas = (badan: string, o: { gaya?: string; dok?: string; num?: string; normal?: string } = {}): Buffer => {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>')}${badan}<w:sectPr/></w:body></w:document>`)
  if (o.num) z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${WNS}>${o.num}</w:numbering>`)
  const normal = o.normal ? gayaP('Normal', 'Normal', o.normal).replace('w:type="paragraph"', 'w:type="paragraph" w:default="1"') : gayaUmum.split('</w:style>')[0] + '</w:style>'
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}>${o.dok ? `<w:docDefaults><w:pPrDefault><w:pPr>${o.dok}</w:pPr></w:pPrDefault></w:docDefaults>` : ''}${normal}<w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style>${o.gaya ?? ''}</w:styles>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
const baca = (b: Buffer) => bacaDocxLkjip(b)
const narasi = (b: Buffer) => baca(b).bagian[0].blok.map(x => (x.tipe === 'NARASI' ? x.payload.html : `[${x.tipe}]`)).join('')
const dokSpasi = (b: Buffer) => baca(b).spasiBawaan

// ─── A. Pewarisan ─────────────────────────────────────────────────────────────
console.log('A. Pewarisan')
// Patokan: paragraf panjang 1,5 baris & sesudah 6 pt, sehingga yang lain terbaca sebagai selisih.
const DASAR = sp('w:after="120" w:line="360" w:lineRule="auto"')
const denganPatokan = (isi: string, o: Parameters<typeof berkas>[1] = {}) => berkas(par(PANJANG, DASAR) + isi, o)
const a1 = narasi(denganPatokan(par('kecil', sp('w:after="0"'))))
ok('A1 isian paragraf menimpa, atribut lain diwarisi dari yang tertulis', /<p data-ind-[^>]*data-sp-sesudah="0"|<p data-sp-sesudah="0"/.test(a1) || a1.includes('data-sp-sesudah="0"'), a1.slice(-140))
const a2 = narasi(denganPatokan(par('gaya', '<w:pStyle w:val="Rapat"/>'), { gaya: gayaP('Rapat', 'Rapat', sp('w:before="240" w:after="0" w:line="240" w:lineRule="auto"')) }))
ok('A2 dari gaya', a2.includes('data-sp-sebelum="240"') && a2.includes('data-sp-sesudah="0"') && a2.includes('data-sp-baris="240"'), a2.slice(-140))
const a3 = narasi(denganPatokan(par('anak', '<w:pStyle w:val="Anak"/>'), { gaya: gayaP('Induk', 'Induk', sp('w:before="120" w:after="120" w:line="360"')) + gayaP('Anak', 'Anak', sp('w:before="60"'), 'Induk') }))
ok('A3 gaya turunan: atribut diwarisi sendiri-sendiri lewat basedOn', a3.includes('data-sp-sebelum="60"') && !a3.slice(-120).includes('data-sp-sesudah') && !a3.slice(-120).includes('data-sp-baris'), a3.slice(-140))
const a4 = narasi(berkas(par(PANJANG), { dok: sp('w:after="160" w:line="259" w:lineRule="auto"') }))
ok('A4 docDefaults terbaca', a4.includes('data-sp-baris="259"'), a4.slice(0, 80))
const a5 = narasi(denganPatokan(par('timpa', `<w:pStyle w:val="Rapat"/>${sp('w:after="300"')}`), { gaya: gayaP('Rapat', 'Rapat', sp('w:after="0"')) }))
ok('A5 paragraf menimpa gaya', a5.includes('data-sp-sesudah="300"'), a5.slice(-120))
const a6 = narasi(berkas(par(PANJANG, DASAR) + par('normal'), { normal: DASAR }))
ok('A6 tanpa pStyle: gaya bawaan berkas berlaku', !a6.includes('data-sp'), a6.slice(0, 120))
const a7 = narasi(denganPatokan(par('kosong')))
ok('A7 tak ada isian sama sekali = cara Word: rapat, tunggal', a7.slice(-90).includes('data-sp-sesudah="0"') && a7.slice(-90).includes('data-sp-baris="240"'), a7.slice(-120))
const a8 = narasi(denganPatokan(par('otomatis', sp('w:beforeAutospacing="1" w:before="100" w:afterAutospacing="1" w:line="360" w:after="120"'))))
ok('A8 spasi otomatis HTML = 14 pt, menang atas angka', a8.includes('data-sp-sebelum="280"') && a8.includes('data-sp-sesudah="280"'), a8.slice(-120))
const a9 = narasi(denganPatokan(par('mati', sp('w:beforeAutospacing="0" w:before="100" w:after="120" w:line="360"'))))
ok('A9 autospacing 0 tidak berlaku', a9.includes('data-sp-sebelum="100"'), a9.slice(-120))

// ─── B. Pengaturan Dokumen ────────────────────────────────────────────────────
console.log('\nB. Pengaturan Dokumen')
const b1 = dokSpasi(berkas(par(PANJANG, DASAR) + par('x', sp('w:after="0" w:line="240"'))))
ok('B1 yang paling lazim ditimbang panjang teks', b1?.lineSpacing === 1.5 && b1?.spaceAfterPt === 6, JSON.stringify(b1))
const b2 = dokSpasi(berkas(par('a', sp('w:after="0" w:line="240"')) + par('b', sp('w:after="0" w:line="240"')) + par('c', sp('w:after="0" w:line="240"')) + par(PANJANG, DASAR)))
ok('B2 label pendek banyak tidak mengalahkan isi panjang', b2?.lineSpacing === 1.5, JSON.stringify(b2))
const b3 = narasi(berkas(par(PANJANG, DASAR) + par('sama', DASAR)))
ok('B3 yang sama dengan Pengaturan Dokumen tidak membawa atribut', !b3.includes('data-sp'), b3.slice(0, 120))
const b4 = dokSpasi(berkas(par(PANJANG, sp('w:after="120" w:line="276" w:lineRule="auto"'))))
ok('B4 1,15 dikenali', b4?.lineSpacing === 1.15)
const b5 = baca(berkas(par(PANJANG, sp('w:after="120" w:line="259" w:lineRule="auto"'))))
ok('B5 kelipatan di luar pilihan Pengaturan: Pengaturan tetap bawaan, paragrafnya membawa angkanya', b5.spasiBawaan?.lineSpacing === 1.5 && (b5.bagian[0].blok[0].payload as { html: string }).html.includes('data-sp-baris="259"'), JSON.stringify(b5.spasiBawaan))
const b6 = baca(berkas(par(PANJANG, sp('w:after="1000" w:line="360"'))))
ok('B6 sesudah di luar batas Pengaturan (24 pt): Pengaturan bawaan, paragrafnya membawa angkanya', b6.spasiBawaan?.spaceAfterPt === 6 && (b6.bagian[0].blok[0].payload as { html: string }).html.includes('data-sp-sesudah="1000"'), JSON.stringify(b6.spasiBawaan))
ok('B7 berkas tanpa paragraf isi: null, Pengaturan bawaan dipakai', dokSpasi(berkas('')) === null)
const b8 = baca(berkas(par(PANJANG, DASAR) + par('Judul pendek sekali', '<w:pStyle w:val="H1"/>')))
const b7bBadan = par('Sampul panjang sekali. '.repeat(40), sp('w:after="0" w:line="240"')) + par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>') + par('Isi pendek', DASAR)
const b7b = (() => { const z = new PizZip(); z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${b7bBadan}<w:sectPr/></w:body></w:document>`); z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}>${gayaUmum}</w:styles>`); return baca(z.generate({ type: 'nodebuffer' }) as Buffer) })()
ok('B7b halaman depan tidak ikut menimbang: gayanya bukan gaya isi', b7b.spasiBawaan?.lineSpacing === 1.5 && b7b.spasiBawaan?.spaceAfterPt === 6, JSON.stringify(b7b.spasiBawaan))
ok('B8 judul tidak ikut menimbang', b8.spasiBawaan?.lineSpacing === 1.5)
ok('B9 hasilnya diterima skema Pengaturan', (() => { const s = StyleConfigSchema.parse({ ...DEFAULT_STYLE, ...b1 }); return s.lineSpacing === 1.5 && s.spaceAfterPt === 6 })())
const b10 = dokSpasi(berkas(par(PANJANG, sp('w:after="90" w:line="480"'))))
ok('B10 sesudah pecahan pt & spasi ganda', b10?.spaceAfterPt === 4.5 && b10?.lineSpacing === 2, JSON.stringify(b10))

// ─── C. Atribut per paragraf ──────────────────────────────────────────────────
console.log('\nC. Atribut per paragraf')
const lv = (l: number, fmt: string, teks: string) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${teks}"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
const num = `<w:abstractNum w:abstractNumId="1">${lv(0, 'decimal', '%1.')}${lv(1, 'decimal', '%1.%2.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`
const nP = (l = 0) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="1"/></w:numPr>`
const c1 = narasi(denganPatokan(par('butir', nP() + sp('w:after="0" w:line="360"')), { num }))
ok('C1 butir: atribut di <li>', /<li data-sp-sesudah="0"><p>butir<\/p>/.test(c1), c1.slice(-120))
const c2 = narasi(denganPatokan(par('T', nP() + DASAR) + par('penjelas', sp('w:before="60" w:after="120" w:line="360"')) + par('S', nP(1) + DASAR), { num }))
ok('C2 paragraf penjelas di butir membawa spasinya sendiri', /<p[^>]*data-sp-sebelum="60"[^>]*>penjelas<\/p>/.test(c2), c2.slice(-200))
const c3 = narasi(denganPatokan(par('S', nP(1) + sp('w:before="30" w:after="120" w:line="360"')), { num }))
ok('C3 1.1. tanpa induk (jadi teks) tetap membawa spasinya', /<p[^>]*data-sp-sebelum="30"[^>]*>1\.1\. S<\/p>/.test(c3), c3.slice(-160))
const c4 = narasi(denganPatokan(par('tengah', `<w:jc w:val="center"/>${sp('w:before="40" w:after="120" w:line="360"')}`)))
ok('C4 urutan atribut sama dgn penyaring: gaya, indent, spasi', sanitizeNarasiHtml(c4) === c4, c4.slice(-120))
ok('C5 semua bentuk lolos penyaring utuh', [a2, a3, c1, c2, c3].every(h => sanitizeNarasiHtml(h) === h))
const kpBadan = par('KATA PENGANTAR') + par('Isi pengantar panjang sekali.', sp('w:before="77" w:after="120" w:line="360"')) + par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>') + par(PANJANG, DASAR)
const c6 = (() => { const z = new PizZip(); z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${kpBadan}<w:sectPr/></w:body></w:document>`); z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}>${gayaUmum}</w:styles>`); return baca(z.generate({ type: 'nodebuffer' }) as Buffer) })()
ok('C6 Kata Pengantar ikut', c6.kataPengantar.html.includes('data-sp-sebelum="77"'), c6.kataPengantar.html.slice(0, 120))
const c7 = baca(denganPatokan(par('pasti', sp('w:line="300" w:lineRule="exact" w:after="120"')) + par('paling', sp('w:line="300" w:lineRule="atLeast" w:after="120"'))))
const c7h = (c7.bagian[0].blok[0].payload as { html: string }).html
ok('C7 tinggi baris pasti: tidak dibawa, ikut Pengaturan', !c7h.includes('data-sp-baris'), c7h.slice(-160))
ok('C8 tinggi baris pasti: disebut di peringatan', c7.peringatan.some(p => p.startsWith('2 paragraf memakai tinggi baris pasti')), JSON.stringify(c7.peringatan))
const c9 = baca(berkas(par(PANJANG, sp('w:after="120" w:line="300" w:lineRule="exact"'))))
ok('C9 tinggi baris pasti tidak ikut menimbang Pengaturan', c9.spasiBawaan?.lineSpacing === 1.5, JSON.stringify(c9.spasiBawaan))
const c10 = narasi(denganPatokan(par('sisa', sp('w:line="300" w:lineRule="exact" w:after="0"'))))
ok('C10 tinggi baris pasti: spasi sebelum/sesudahnya tetap dibawa', c10.slice(-70).includes('data-sp-sesudah="0"'), c10.slice(-90))

// ─── D. Kontekstual ───────────────────────────────────────────────────────────
console.log('\nD. Spasi kontekstual')
const gayaDaftar = gayaP('LP', 'List Paragraph', `<w:contextualSpacing/>${sp('w:after="200" w:line="360"')}`)
const d1 = narasi(denganPatokan(par('a', '<w:pStyle w:val="LP"/>') + par('b', '<w:pStyle w:val="LP"/>') + par('c', '<w:pStyle w:val="LP"/>') + par('lain', DASAR), { gaya: gayaDaftar }))
const atributDi = (h: string, t: string) => new RegExp(`<p([^>]*)>${t}</p>`).exec(h)?.[1] ?? '(tak ada)'
ok('D1 sesama gaya: spasi di antaranya hilang', atributDi(d1, 'a').includes('data-sp-sesudah="0"') && atributDi(d1, 'b').includes('data-sp-sesudah="0"'), atributDi(d1, 'a'))
ok('D2 paragraf terakhir: tetangganya gaya lain, spasinya berlaku', atributDi(d1, 'c').includes('data-sp-sesudah="200"'), atributDi(d1, 'c'))
const d3 = narasi(denganPatokan(par('x', `<w:pStyle w:val="LS"/>`) + par('y', `<w:pStyle w:val="LS"/>`), { gaya: gayaP('LS', 'LS', `<w:contextualSpacing/>${sp('w:before="100" w:after="120" w:line="360"')}`) }))
ok('D3 sebelum juga hilang bila paragraf sebelumnya sama gaya', atributDi(d3, 'x').includes('data-sp-sebelum="100"') && !atributDi(d3, 'y').includes('data-sp-sebelum'), `${atributDi(d3, 'x')} / ${atributDi(d3, 'y')}`)
const d4 = narasi(denganPatokan(par('m', `<w:pStyle w:val="LP"/><w:contextualSpacing w:val="0"/>`) + par('n', `<w:pStyle w:val="LP"/><w:contextualSpacing w:val="0"/>`), { gaya: gayaDaftar }))
ok('D4 dimatikan di paragraf', atributDi(d4, 'm').includes('data-sp-sesudah="200"'), atributDi(d4, 'm'))
const d5 = narasi(denganPatokan(par('t1', `<w:contextualSpacing/>${DASAR}`) + par('t2', `<w:pStyle w:val="Lain"/><w:contextualSpacing/>${DASAR}`), { gaya: gayaP('Lain', 'Lain', '') }))
ok('D5 beda gaya: tidak dibuang', !atributDi(d5, 't1').includes('data-sp-sesudah="0"'), atributDi(d5, 't1'))
const d6 = narasi(denganPatokan(par('anak1', '<w:pStyle w:val="LT"/>') + par('anak2', '<w:pStyle w:val="LT"/>'), { gaya: gayaDaftar + gayaP('LT', 'LT', '', 'LP') }))
ok('D6 diwarisi lewat basedOn', atributDi(d6, 'anak1').includes('data-sp-sesudah="0"'), atributDi(d6, 'anak1'))

// ─── E. Berkas Word ───────────────────────────────────────────────────────────
console.log('\nE. Berkas Word')
const e1 = narasiToXml(a2, 'Arial', 24, 0)
ok('E1 ekspor menulis angka berkas asal', e1.includes('w:before="240"') && e1.includes('w:after="0"') && e1.includes('w:line="240"'), e1.slice(-200))
ok('E2 butir: urutan skema tetap', /<w:numPr>[\s\S]*?<\/w:numPr><w:spacing w:after="0"\/><w:ind/.test(narasiToXml(c1, 'Arial', 24, 0)) || /<w:numPr>[\s\S]*?<\/w:numPr><w:spacing w:after="0"\/>/.test(narasiToXml(c1, 'Arial', 24, 0)), narasiToXml(c1, 'Arial', 24, 0).slice(-260))

// ─── F. Sambungan ─────────────────────────────────────────────────────────────
console.log('\nF. Sambungan & tempel')
const rt = kode('app/api/lkjip/impor/route.ts')
const im = kode('lib/lkjip/impor-word.ts')
ok('F1 route memakai hasilnya sebelum indent & Kata Pengantar', rt.includes('...DEFAULT_STYLE, ...(hasil.spasiBawaan ?? {}), firstLineIndentCm:'))
ok('F2 cermin nilai bawaan sama dengan DEFAULT_STYLE', new RegExp(`lineSpacing: ${DEFAULT_STYLE.lineSpacing}, spaceAfterPt: ${DEFAULT_STYLE.spaceAfterPt}`).test(im))
ok('F3 Kata Pengantar & badan memakai dasar yang sama', im.includes('htmlNarasi(isi, bawaanDxa, spasiDok)') && im.includes('htmlNarasi(buf, bawaanDxa, spasiDok)'))
const klip = readFileSync('scripts/fixtures/lkjip-papan-klip/word-daftar.html', 'utf8')
ok('F4 tempelan tetap tanpa spasi: Word selalu membawa margin-bottom & line-height', !tempelDariWord(klip).includes('data-sp-'))

console.log(gagal.length ? `\nGAGAL — ${lulus} lulus, ${gagal.length} gagal` : `\n${lulus} lulus, 0 gagal`)
process.exit(gagal.length ? 1 : 0)
