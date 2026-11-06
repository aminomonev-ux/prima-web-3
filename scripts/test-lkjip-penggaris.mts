// scripts/test-lkjip-penggaris.mts — penggaris & indent per paragraf LKJIP.
// Konsep: docs/CONCEPT-lkjip-penggaris-narasi.md
//
// A: geometri halaman (satu sumber angka) · B: membaca & menjepit angka · C: akibat menyeret penanda
// D: bawaan vs isian sendiri · E: penyaring server · F: Word (`w:ind` tiap paragraf) · G: impor Word
// H: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-penggaris.mts

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import {
  CM_TULIS, PX_TULIS, LEBAR_DXA, TWIPS_PER_CM, TEKS_MIN_DXA, PGSZ, PGSZ_MELINTANG, PGMAR, KERTAS, MARGIN,
  indentTwips, pxHuruf, cmTeks, bacaInden, atributInden, jepitInden, indenBawaan, indenBerlaku, keTersimpan,
  xmlInden, snapDxa, geserPenanda, posisiPenanda, bidangBerubah, ringkasInden, dxaDariCss, type Inden,
} from '../lib/lkjip/halaman'
import { narasiToXml, rakitDocx } from '../lib/lkjip/docgen'
import { sanitizeNarasiHtml, NarasiPayloadSchema, DEFAULT_STYLE } from '../lib/lkjip/schemas'
import { bacaDocxLkjip } from '../lib/lkjip/impor-word'
import { buildNumberedTree, type BlockNode, type SectionFlat } from '../lib/lkjip/numbering'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ─── A. Geometri ──────────────────────────────────────────────────────────────
console.log('A. Geometri halaman')
ok('A1 A4 11.907 × 16.839 dxa; margin 1.418 + kiri 1.701', KERTAS.lebar === 11907 && KERTAS.tinggi === 16839 && MARGIN.kiri === 1701 && MARGIN.kanan === 1418)
ok('A2 PGSZ/PGMAR identik dengan yang dipakai docgen sejak dulu',
  PGSZ === '<w:pgSz w:w="11907" w:h="16839"/>' && PGSZ_MELINTANG === '<w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>'
  && PGMAR === '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>', PGMAR)
ok('A3 bidang tulis = kertas − margin = 8.788 dxa = 15,499 cm (BUKAN 15,5)', LEBAR_DXA === KERTAS.lebar - MARGIN.kiri - MARGIN.kanan && CM_TULIS.toFixed(3) === '15.499' && PX_TULIS === 585)
ok('A4 indentTwips: 1,27 → 720 (tepat 0,5 inci) · 3 → 1701; nilai tak masuk akal → 0', indentTwips(1.27) === 720 && indentTwips(3) === 1701 && indentTwips(-1) === 0 && indentTwips('x') === 0 && indentTwips(undefined) === 0)
ok('A5 huruf 12 pt = 16 px', pxHuruf(12) === 16 && pxHuruf(11) === 14.67 && pxHuruf(undefined) === 16)
ok('A6 cmTeks gaya Indonesia: 720 → 1,27 · 567 → 1 · 0 → 0', cmTeks(720) === '1,27' && cmTeks(567) === '1' && cmTeks(0) === '0')

// ─── B. Membaca & menjepit ────────────────────────────────────────────────────
console.log('\nB. Membaca & menjepit angka')
ok('B1 bacaInden: hanya atribut yang ada; gantung bertanda minus', sama(bacaInden('<p data-ind-kiri="720" data-ind-pertama="-360" style="x">'), { kiri: 720, pertama: -360 }))
ok('B2 bacaInden menolak selain angka bulat & tidak tertipu nama mirip', sama(bacaInden('<p data-ind-kiri="abc" data-ind-pertama="1.5" xdata-ind-kanan="9" data-ind-kanan-lain="9">'), {}))
ok('B3 nilai raksasa dijepit ke bidang tulis, kiri/kanan tidak negatif', sama(bacaInden('<p data-ind-kiri="99999" data-ind-kanan="-5" data-ind-pertama="-99999">'), { kiri: LEBAR_DXA, kanan: 0, pertama: -LEBAR_DXA }))
ok('B4 atributInden dibentuk dari angka; urutan tetap', atributInden({ pertama: 360, kiri: 720 }) === ' data-ind-kiri="720" data-ind-pertama="360"' && atributInden({}) === '')
const jp = (i: Inden, j: 'paragraf' | 'judul' | 'butir' = 'paragraf') => jepitInden(i, j)
ok('B5 baris pertama tidak boleh keluar margin kiri: kiri 100, gantung 500 → gantung 100', jp({ kiri: 100, kanan: 0, pertama: -500 }).pertama === -100)
ok('B6 teks minimal 1 cm: kiri + kanan tak boleh melewati lebar', (() => { const i = jp({ kiri: 8000, kanan: 8000, pertama: 0 }); return LEBAR_DXA - i.kiri - i.kanan >= TEKS_MIN_DXA })())
ok('B7 butir daftar hanya boleh gantung, baris-pertama-positif jadi 0', jp({ kiri: 720, kanan: 0, pertama: 300 }, 'butir').pertama === 0 && jp({ kiri: 720, kanan: 0, pertama: 300 }).pertama === 300)
ok('B8 dxaDariCss: tempelan Word .5in · -.25in · 36pt · 1.27cm · 48px; selain panjang = null',
  dxaDariCss('.5in') === 720 && dxaDariCss('-.25in') === -360 && dxaDariCss('36.0pt') === 720 && dxaDariCss('1.27cm') === 720 && dxaDariCss('48px') === 720 && dxaDariCss('0') === 0
  && dxaDariCss('') === null && dxaDariCss('auto') === null && dxaDariCss('5') === null)
ok('B9 snap: kisi 0,05 cm; 720 bisa dicapai persis walau bukan di kisi', snapDxa(725) === 720 && snapDxa(737) === Math.round(1.3 * TWIPS_PER_CM) && snapDxa(0) === 0 && snapDxa(3) === 0 && snapDxa(360) === 360)

// ─── C. Menyeret penanda (perilaku penggaris Word) ───────────────────────────
console.log('\nC. Akibat menyeret penanda')
const P: Inden = { kiri: 1134, kanan: 0, pertama: 720 } // kiri 2 cm, baris pertama +1,27 → mulai di 1.854
ok('C1 ▽ baris pertama: hanya baris pertama pindah, kiri tetap', sama(geserPenanda(P, 'pertama', 1440, 'paragraf'), { kiri: 1134, kanan: 0, pertama: 306 }), JSON.stringify(geserPenanda(P, 'pertama', 1440, 'paragraf')))
ok('C2 ▽ ditarik ke kiri melewati teks → jadi gantung (negatif)', geserPenanda(P, 'pertama', 720, 'paragraf').pertama === -414)
const g = geserPenanda(P, 'gantung', 720, 'paragraf')
ok('C3 △ gantung: baris berikutnya pindah, baris pertama TETAP di tempatnya', g.kiri === 720 && g.kiri + g.pertama === P.kiri + P.pertama, JSON.stringify(g))
const k = geserPenanda(P, 'kiri', 1440, 'paragraf')
ok('C4 ▭ kiri: baris pertama & berikutnya pindah bersama (selisihnya tetap)', k.kiri === 1440 && k.pertama === P.pertama, JSON.stringify(k))
const r = geserPenanda(P, 'kanan', LEBAR_DXA - 720, 'paragraf')
ok('C5 △ kanan: x dihitung dari kiri, disimpan sebagai jarak dari kanan', r.kanan === 720 && r.kiri === P.kiri && r.pertama === P.pertama, JSON.stringify(r))
ok('C6 posisiPenanda kebalikan geserPenanda di keempat penanda', (['pertama', 'gantung', 'kiri', 'kanan'] as const).every(p => {
  // 10 cm: di kisi bagi yang dihitung dari kiri; yang dari kanan bisa meleset 1 dxa karena pembulatan.
  const h = geserPenanda(P, p, 5670, 'paragraf')
  return Math.abs(posisiPenanda(h, p) - 5670) <= 1
}))
ok('C7 tidak bisa diseret keluar halaman ke kiri / melewati batas kanan', geserPenanda(P, 'pertama', -500, 'paragraf').kiri + geserPenanda(P, 'pertama', -500, 'paragraf').pertama === 0
  && geserPenanda(P, 'kiri', 99999, 'paragraf').kiri + 720 <= LEBAR_DXA - TEKS_MIN_DXA
  && LEBAR_DXA - geserPenanda(P, 'kanan', 0, 'paragraf').kanan >= P.kiri + P.pertama + TEKS_MIN_DXA)
const B: Inden = { kiri: 720, kanan: 0, pertama: -360 }
ok('C8 butir: ▽ nomor tidak bisa melewati teks ke kanan; △ teks tidak bisa melewati nomor ke kiri',
  geserPenanda(B, 'pertama', 1000, 'butir').pertama === 0 && geserPenanda(B, 'gantung', 100, 'butir').kiri === 360)
ok('C10 ringkasan terbaca: gantung & baris pertama', ringkasInden({ kiri: 720, kanan: 0, pertama: -360 }) === 'Kiri 1,27 · Kanan 0 · Gantung 0,63 cm' && ringkasInden({ kiri: 0, kanan: 567, pertama: 720 }) === 'Kiri 0 · Kanan 1 · Baris pertama 1,27 cm', ringkasInden({ kiri: 720, kanan: 0, pertama: -360 }))
ok('C9 bidangBerubah hanya menyebut yang bergeser; tanpa perubahan = kosong', sama(bidangBerubah(P, { ...P, kanan: 5 }), { kanan: 5 }) && sama(bidangBerubah(P, P), {}))

// ─── D. Bawaan vs isian ───────────────────────────────────────────────────────
console.log('\nD. Bawaan vs isian sendiri')
ok('D1 paragraf tanpa isian ikut setelan dokumen; judul & butir tidak', sama(indenBawaan('paragraf', 720), { kiri: 0, kanan: 0, pertama: 720 }) && sama(indenBawaan('judul', 720), { kiri: 0, kanan: 0, pertama: 0 }) && sama(indenBawaan('butir', 720), { kiri: 720, kanan: 0, pertama: -360 }))
ok('D2 butir bersarang: teks 1,27 cm per tingkat', indenBawaan('butir', 0, 3).kiri === 2160)
ok('D3 isian sebagian: sisanya ikut bawaan', sama(indenBerlaku({ kiri: 567 }, 'paragraf', 720), { kiri: 567, kanan: 0, pertama: 720 }))
ok('D4 keTersimpan hanya menyimpan yang beda; kembali ke bawaan = kosong (ikut setelan dokumen lagi)',
  sama(keTersimpan({ kiri: 567, kanan: 0, pertama: 720 }, 'paragraf', 720), { kiri: 567 }) && sama(keTersimpan({ kiri: 0, kanan: 0, pertama: 720 }, 'paragraf', 720), {}))
ok('D5 "tanpa indent" pada dokumen ber-bawaan 1,27 tersimpan sebagai 0, tidak hilang', sama(keTersimpan({ kiri: 0, kanan: 0, pertama: 0 }, 'paragraf', 720), { pertama: 0 }))

// ─── E. Penyaring server ──────────────────────────────────────────────────────
console.log('\nE. Penyaring narasi')
ok('E1 data-ind-* bertahan di <p>, <h2>, <li>; bentuknya dibangun ulang',
  sanitizeNarasiHtml('<p data-ind-kiri="720" onclick="x()" class="a">t</p><h2 data-ind-pertama="-360">j</h2><ul><li data-ind-kanan="100"><p>b</p></li></ul>')
  === '<p data-ind-kiri="720">t</p><h2 data-ind-pertama="-360">j</h2><ul><li data-ind-kanan="100"><p>b</p></li></ul>',
  sanitizeNarasiHtml('<p data-ind-kiri="720" onclick="x()" class="a">t</p><h2 data-ind-pertama="-360">j</h2><ul><li data-ind-kanan="100"><p>b</p></li></ul>'))
ok('E2 text-align & indent berdampingan; gaya lain (margin, --i-*) dibuang', sanitizeNarasiHtml('<p style="text-align:center;margin-left:9in;--i-kiri:720" data-ind-kiri="720">t</p>') === '<p style="text-align:center" data-ind-kiri="720">t</p>')
ok('E3 nilai jahat tidak bisa menyelinap: yang bukan angka utuh hilang, atribut tidak digemakan', sanitizeNarasiHtml('<p data-ind-kiri="1&quot; onmouseover=&quot;x" data-ind-pertama=" onload=y">t</p>') === '<p>t</p>', sanitizeNarasiHtml('<p data-ind-kiri="1&quot; onmouseover=&quot;x" data-ind-pertama=" onload=y">t</p>'))
ok('E4 lewat skema NARASI (jalur Simpan blok) tetap utuh', NarasiPayloadSchema.parse({ html: '<p data-ind-pertama="0">t</p>' }).html === '<p data-ind-pertama="0">t</p>')

// ─── F. Word ─────────────────────────────────────────────────────────────────
console.log('\nF. Word — `w:ind` tiap paragraf')
const pPr = (xml: string, teks: string) => (xml.match(/<w:p>[\s\S]*?<\/w:p>/g) ?? []).find(p => p.includes(`>${teks}<`))?.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/)?.[1] ?? ''
const xmlF = narasiToXml([
  '<p>biasa</p>',
  '<p data-ind-kiri="567" data-ind-kanan="284" data-ind-pertama="283">kiri</p>',
  '<p data-ind-kiri="720" data-ind-pertama="-360">gantung</p>',
  '<p data-ind-pertama="0">tanpa</p>',
  '<p style="text-align:center" data-ind-kiri="567">tengah</p>',
  '<h2 data-ind-kiri="360">judul</h2><h2>polos</h2>',
  '<ol><li><p>butir</p></li><li data-ind-kiri="360" data-ind-pertama="-360"><p>rapat</p></li><li data-ind-kiri="1440"><p>jauh</p></li></ol>',
].join(''), 'Arial', 24, 720)
ok('F1 tanpa isian → bawaan dokumen (string lama persis)', pPr(xmlF, 'biasa') === '<w:ind w:firstLine="720"/>', pPr(xmlF, 'biasa'))
ok('F2 isian sendiri: left/right/firstLine', pPr(xmlF, 'kiri') === '<w:ind w:left="567" w:right="284" w:firstLine="283"/>', pPr(xmlF, 'kiri'))
ok('F3 gantung → w:hanging positif', pPr(xmlF, 'gantung') === '<w:ind w:left="720" w:hanging="360"/>', pPr(xmlF, 'gantung'))
ok('F4 "tanpa indent" mengalahkan bawaan: tidak ada w:ind sama sekali', pPr(xmlF, 'tanpa') === '', pPr(xmlF, 'tanpa'))
ok('F5 urutan CT_PPr: ind sebelum jc (kalau terbalik Word menolak berkasnya)', pPr(xmlF, 'tengah') === '<w:ind w:left="567" w:firstLine="720"/><w:jc w:val="center"/>', pPr(xmlF, 'tengah'))
ok('F6 judul memakai isiannya, judul polos tanpa w:ind (bawaan dokumen tidak ikut)', pPr(xmlF, 'judul') === '<w:ind w:left="360"/>' && pPr(xmlF, 'polos') === '', `${pPr(xmlF, 'judul')} | ${pPr(xmlF, 'polos')}`)
ok('F7 butir tanpa isian ikut tingkat daftar (numPr saja)', !pPr(xmlF, 'butir').includes('w:ind'), pPr(xmlF, 'butir'))
ok('F8 butir berisian: numPr → ind; hanging selalu tertulis', /^<w:numPr>.*<\/w:numPr><w:ind w:left="360" w:hanging="360"\/>$/.test(pPr(xmlF, 'rapat')) && pPr(xmlF, 'jauh').includes('<w:ind w:left="1440" w:hanging="360"/>'), pPr(xmlF, 'rapat'))
ok('F9 tanpa bawaan & tanpa isian: tidak ada w:ind', pPr(narasiToXml('<p>x</p>', 'Arial', 24, 0), 'x') === '')
ok('F10 xmlInden: butir kosong → "" ; butir hanging 0 tetap ditulis supaya gantung tingkatnya tidak berlaku',
  xmlInden({}, 'butir') === '' && xmlInden({ pertama: 0 }, 'butir') === '<w:ind w:left="720" w:hanging="0"/>')
const liGaya = narasiToXml('<ol><li><p style="text-align:center">c</p></li></ol>', 'Arial', 24, 0)
ok('F11 perataan butir daftar ikut ke Word (dulu hilang)', pPr(liGaya, 'c').endsWith('<w:jc w:val="center"/>'), pPr(liGaya, 'c'))
const xmlLanjut = narasiToXml('<ol><li data-ind-kiri="1000" data-ind-pertama="-300"><p>a</p><p>kedua</p></li></ol>', 'Arial', 24, 0)
ok('F12 paragraf kedua butir rata dengan teks butirnya, tanpa nomor', pPr(xmlLanjut, 'kedua') === '<w:ind w:left="1000"/>', pPr(xmlLanjut, 'kedua'))

const sec: SectionFlat[] = [{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'BAB', locked: 0 }]
const blk: BlockNode = { id: 1, tipe: 'NARASI', urutan: 0, payload: { html: '<p data-ind-kiri="567">isi kiri</p><p>isi bawaan</p>' } }
const dokumen = new PizZip((await rakitDocx({ tree: buildNumberedTree(sec, new Map([[1, [blk]]])), judul: 'U', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })).buffer).file('word/document.xml')!.asText()
ok('F13 dokumen utuh: setelan dokumen & isian paragraf berdampingan', pPr(dokumen, 'isi kiri') === '<w:ind w:left="567" w:firstLine="720"/>' && pPr(dokumen, 'isi bawaan') === '<w:ind w:firstLine="720"/>', pPr(dokumen, 'isi kiri'))

// ─── G. Impor Word ────────────────────────────────────────────────────────────
console.log('\nG. Impor Word')
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const par = (t: string, ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`
const panjang = 'Paragraf isi yang cukup panjang supaya menentukan setelan dokumen lewat bobot teksnya'
function berkas(badan: string, numbering = '', styles = ''): Buffer {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${badan}<w:sectPr/></w:body></w:document>`)
  if (numbering) z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${WNS}>${numbering}</w:numbering>`)
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style>${styles}</w:styles>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
const judul = par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>')
const ind = (a: string) => `<w:ind ${a}/>`
const htmlDari = (d: Buffer) => { const h = bacaDocxLkjip(d); return { h, html: h.bagian[0].blok.map(b => b.tipe === 'NARASI' ? b.payload.html : '').join('') } }
const g1 = htmlDari(berkas(judul + par(panjang + ' A', ind('w:firstLine="720"')) + par(panjang + ' B', ind('w:firstLine="720"')) + par('Khusus', ind('w:left="567" w:right="284" w:hanging="283"')) + par('Rata', ind('w:firstLine="0"'))))
ok('G1 setelan dokumen = indent paling lazim (1,27), paragraf lazim polos', g1.h.indenBawaanCm === 1.27 && g1.html.includes(`<p>${panjang} A</p>`), `${g1.h.indenBawaanCm} ${g1.html.slice(0, 160)}`)
ok('G2 paragraf berbeda membawa angkanya sendiri, termasuk "tanpa indent"', g1.html.includes('<p data-ind-kiri="567" data-ind-kanan="284" data-ind-pertama="-283">Khusus</p>') && g1.html.includes('<p data-ind-pertama="0">Rata</p>'), g1.html)
const g2 = htmlDari(berkas(judul + par(panjang)))
ok('G3 berkas tanpa indent: setelan dokumen 0, tidak mendadak menjorok 1,27 cm', g2.h.indenBawaanCm === 0 && g2.html === `<p>${panjang}</p>`, `${g2.h.indenBawaanCm} ${g2.html}`)
const lvl = (l: number, kiri: number, gt: number) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${l + 1}."/><w:pPr><w:ind w:left="${kiri}" w:hanging="${gt}"/></w:pPr></w:lvl>`
const numG = `<w:abstractNum w:abstractNumId="1">${lvl(0, 720, 360)}${lvl(1, 1080, 360)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`
const numPr = (l: number) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="1"/></w:numPr>`
const g3 = htmlDari(berkas(judul + par('satu', numPr(0)) + par('dalam', numPr(1)) + par('geser', numPr(0) + ind('w:left="1440"')), numG))
ok('G4 tingkat daftar di numbering terbaca; tingkat 1 bawaan polos, tingkat 2 bersarang & membawa kirinya', g3.html.includes('<li><p>satu</p><ol><li data-ind-kiri="1080"><p>dalam</p></li></ol></li>'), g3.html)
ok('G5 isian paragraf menimpa tingkat per atribut: left 1440, hanging tetap warisan', g3.html.includes('<li data-ind-kiri="1440"><p>geser</p></li>'), g3.html)
const styleInd = '<w:style w:type="paragraph" w:styleId="Dasar"><w:name w:val="Dasar"/><w:pPr><w:ind w:left="400"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Turunan"><w:name w:val="Turunan"/><w:basedOn w:val="Dasar"/><w:pPr><w:ind w:firstLine="200"/></w:pPr></w:style>'
const g4 = htmlDari(berkas(judul + par(panjang) + par('warisan', '<w:pStyle w:val="Turunan"/>') + par('timpa', `<w:pStyle w:val="Turunan"/>${ind('w:left="100"')}`), '', styleInd))
ok('G6 gaya berantai diwarisi per atribut; paragraf menimpa yang ditulisnya saja', g4.html.includes('<p data-ind-kiri="400" data-ind-pertama="200">warisan</p>') && g4.html.includes('<p data-ind-kiri="100" data-ind-pertama="200">timpa</p>'), g4.html)
// Aturan nomor Word 2026-11-06: num sebabstrak berbagi hitungan; override hanya menyetel pada pemakaian pertama.
const numN = `<w:abstractNum w:abstractNumId="1">${lvl(0, 720, 360)}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>` +
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num><w:num w:numId="3"><w:abstractNumId w:val="1"/></w:num>'
const nPr = (id: number) => `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`
const g5 = htmlDari(berkas(judul + par('A1', nPr(1)) + par('A2', nPr(1)) + par('B1', nPr(2)) + par('B2', nPr(2)) + par('C1', nPr(3)) + par('A3', nPr(1)), numN))
ok('G7 nomor seperti Word: 1,2 → override 5,6 → num lain lanjut 7,8 (bukan 3)',
  g5.html === '<ol><li><p>A1</p></li><li><p>A2</p></li></ol><ol start="5"><li><p>B1</p></li><li><p>B2</p></li><li><p>C1</p></li><li><p>A3</p></li></ol>', g5.html)

// ─── H. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nH. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const pg = kode('app/(dashboard)/lkjip/[id]/PenggarisNarasi.tsx')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const dg = kode('lib/lkjip/docgen.ts')
ok('H1 atribut indent terpasang di paragraf, judul, DAN butir daftar', tt.includes("types: ['paragraph', 'heading', 'listItem']") && /RujukTaut, LanjutDaftar, IndenParagraf\]/.test(tt))
ok('H2 penggaris mengubah PARAGRAF lewat transaksi editor, tidak lagi menulis setelan dokumen',
  tt.includes('tr.setNodeMarkup(s.pos, undefined') && !ed.includes('saveIndent') && !ed.includes('onGaya') && !tt.includes('onIndentCommit'))
ok('H3 keempat penanda ada & slider berlabel', ["'pertama'", "'gantung'", "'kiri'", "'kanan'"].every(p => pg.includes(`penanda(${p}`)) && pg.includes('role="slider"') && pg.includes('aria-valuetext'))
ok('H4 garis skala tidak dijepit 3 cm lagi (dulu 3,5–15 cm bertumpuk di satu titik)', !pg.includes('jepitIndentCm') && pg.includes('(cm / CM_TULIS) * 100'))
ok('H5 tampilan tersembunyi tetap membawa CSS-nya, pilihan bersama semua blok', /lk-pg-sembunyi[\s\S]{0,60}<style>\{PG_CSS\}<\/style>/.test(pg) && pg.includes('useSyncExternalStore'))
ok('H6 selama menyeret teks tidak berubah: penerapan hanya saat dilepas (satu langkah Undo)', /const lepasSeret = \(\) => \{[\s\S]*?onUbah\(ubah\)/.test(pg) && !/const gerakSeret[^}]*onUbah/.test(pg))
ok('H7 CSS: indent bersumber satu satuan kolom, butir bersarang mutlak', tt.includes('container-type: inline-size') && tt.includes('--lk-dxa: calc(100cqw / ${LEBAR_DXA})') && tt.includes('var(--i-pertama, var(--lk-indent-dxa, 0))'))
ok('H8 jarak paragraf ikut setelan (dulu 8px dipatok walau setelan 0/12 pt)', tt.includes("'--lk-after'") && tt.includes('margin: 0 0 var(--lk-after, 8px)'))
ok('H9 penanda tidak memakai ::before (milik tooltip global [data-tooltip])', pg.includes('lk-pg-bentuk') && !/\.lk-pg-p[^{]*::before/.test(pg))
ok('H10 isian bawaan di modal memakai ragam desimal, bukan type=number (mengetik "1,35" menghapus isi)', ed.includes('<PrimaNumberField desimal={2} min={0} max={BATAS_INDENT_CM}') && !ed.includes('type="number" min={0} max={3}'))
ok('H11 docgen & impor memakai satu modul angka', dg.includes("from './halaman'") && !dg.includes('w:pgSz w:w="11907"') && kode('lib/lkjip/impor-word.ts').includes("from './halaman'"))
ok('H12 Simpan tidak muncul bila nilainya sama', /a\.indKiri === \(s\.node\.attrs\.indKiri \?\? null\)[\s\S]{0,180}continue;/.test(tt))

console.log(`\n${gagal.length ? 'GAGAL' : 'LULUS'} — ${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { for (const x of gagal) console.log(`  · ${x}`); process.exit(1) }
