// scripts/test-lkjip-narasi-sedang.mts — paket sedang narasi LKJIP (konsep CONCEPT-lkjip-daftar-word.md §10):
// nomor 1.1. saat impor, Tab di paragraf, dialog Paragraf (spasi), kuas format, tempel daftar dari Word.
//
// A: aturan spasi & indent lanjutan (halaman.ts)   D: perintah editor dgn skema ProseMirror sungguhan
// B: penyaring HTML                                E: impor Word
// C: berkas Word                                   F: tempel dari Word (papan klip asli)
//                                                  G: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-narasi-sedang.mts

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  atributSpasi, bacaSpasi, bidangBerubah, indenBawaan, indenBerlaku, jepitSpasi, keTersimpan, spasiBawaan, spasiKeTersimpan, xmlInden, xmlSpasi,
} from '../lib/lkjip/halaman'
import { sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { DEFAULT_STYLE } from '../lib/lkjip/schemas'
import { narasiToXml, rakitDocx } from '../lib/lkjip/docgen'
import { bacaDocxLkjip } from '../lib/lkjip/impor-word'
import { susunNarasi } from '../lib/lkjip/susun-daftar'
import { tempelDariWord } from '../lib/lkjip/tempel-word'
import { lanjutanDaftar } from '../lib/lkjip/lanjut-daftar'
import { cssGayaDaftar } from '../lib/lkjip/gaya-daftar'
import type { BlockNode, SectionNode } from '../lib/lkjip/numbering'
import {
  ambilFormat, dalamLanjutan, enterLanjutan, hapusFormat, posisiDaftar, sasaranParagraf, simpananInden, simpananSpasi, sisipTab, tekanTab, terapkanFormat, type Perintah,
} from '../lib/lkjip/perintah-narasi'
import { GayaDaftar, SpasiParagraf, Stabilo, Subskrip, Superskrip, TabNarasi, pecahTab } from '../lib/lkjip/ekstensi-narasi'

// tsx memuat berkas .ts proyek sebagai CJS: Tiptap & ProseMirror di sini WAJIB ikut CJS (lihat test-lkjip-daftar-word).
const muat = createRequire(import.meta.url)
const { Extension, Mark, getSchema } = muat('@tiptap/core') as typeof import('@tiptap/core')
const StarterKit = (muat('@tiptap/starter-kit') as { default: typeof import('@tiptap/starter-kit').default }).default
const { EditorState, TextSelection } = muat('@tiptap/pm/state') as typeof import('@tiptap/pm/state')
const { Fragment } = muat('@tiptap/pm/model') as typeof import('@tiptap/pm/model')
type EditorState = import('@tiptap/pm/state').EditorState

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ─── A. Aturan ────────────────────────────────────────────────────────────────
console.log('A. Aturan spasi & indent lanjutan')
const bawaan = spasiBawaan(6, 1.5)
ok('A1 bawaan = pPrDefault docgen', bawaan.sebelum === 0 && bawaan.sesudah === 120 && bawaan.baris === 360)
ok('A2 hanya yang berbeda dari bawaan disimpan', JSON.stringify(spasiKeTersimpan({ sebelum: 0, sesudah: 120, baris: 480 }, bawaan)) === '{"baris":480}')
ok('A3 kembali ke bawaan = tak ada isian', Object.keys(spasiKeTersimpan(bawaan, bawaan)).length === 0)
ok('A4 baca atribut: angka saja, dijepit', JSON.stringify(bacaSpasi(' data-sp-sebelum="240" data-sp-sesudah="99999" data-sp-baris="10"')) === '{"sebelum":240,"sesudah":4000,"baris":120}', JSON.stringify(bacaSpasi(' data-sp-sebelum="240" data-sp-sesudah="99999" data-sp-baris="10"')))
ok('A5 selain angka diabaikan', Object.keys(bacaSpasi(' data-sp-sebelum="x" data-sp-baris="-5"')).length === 0)
ok('A6 atribut dibentuk dari angka', atributSpasi({ sebelum: 120.4, baris: 360 }) === ' data-sp-sebelum="120" data-sp-baris="360"')
ok('A7 xml: lineRule hanya menyertai line', xmlSpasi({ sebelum: 60 }) === '<w:spacing w:before="60"/>' && xmlSpasi({ sesudah: 0, baris: 276 }) === '<w:spacing w:after="0" w:line="276" w:lineRule="auto"/>')
ok('A8 tanpa isian: xml kosong', xmlSpasi({}) === '' && xmlSpasi(null) === '')
ok('A9 jepit batas atas & bawah', JSON.stringify(jepitSpasi({ sebelum: -5, sesudah: 9000, baris: 2000 })) === '{"sebelum":0,"sesudah":4000,"baris":1440}')
ok('A10 bidang berubah berlaku juga untuk spasi', JSON.stringify(bidangBerubah({ sebelum: 0, sesudah: 120, baris: 360 }, { sebelum: 60, sesudah: 120, baris: 360 })) === '{"sebelum":60}')
ok('A11 lanjutan: bawaannya rata dengan teks butir', JSON.stringify(indenBawaan('lanjutan', 1000)) === '{"kiri":1000,"kanan":0,"pertama":0}')
ok('A12 lanjutan: xml tanpa isian = rata teks butir', xmlInden(null, 'lanjutan', 1000) === '<w:ind w:left="1000"/>')
ok('A13 lanjutan: isian menang, nol tetap nol', xmlInden({ kiri: 0, pertama: 720 }, 'lanjutan', 1000) === '<w:ind w:firstLine="720"/>', xmlInden({ kiri: 0, pertama: 720 }, 'lanjutan', 1000))
ok('A14 lanjutan: hanya yang berbeda dari teks butir yang disimpan', JSON.stringify(keTersimpan({ kiri: 720, kanan: 0, pertama: 0 }, 'lanjutan', 720)) === '{}' && JSON.stringify(keTersimpan({ kiri: 0, kanan: 0, pertama: 720 }, 'lanjutan', 720)) === '{"kiri":0,"pertama":720}')
ok('A15 lanjutan boleh baris pertama menjorok (bukan aturan butir)', indenBerlaku({ pertama: 360 }, 'lanjutan', 720).pertama === 360 && indenBerlaku({ pertama: 360 }, 'butir', 0).pertama === 0)

// ─── B. Penyaring ─────────────────────────────────────────────────────────────
console.log('\nB. Penyaring')
const sn = sanitizeNarasiHtml
ok('B1 spasi bertahan di p, judul, butir', sn('<p data-sp-sebelum="120" data-sp-baris="480">a</p>') === '<p data-sp-sebelum="120" data-sp-baris="480">a</p>' && sn('<h2 data-sp-sesudah="0">a</h2>') === '<h2 data-sp-sesudah="0">a</h2>' && sn('<ol><li data-sp-sesudah="60"><p>a</p></li></ol>') === '<ol><li data-sp-sesudah="60"><p>a</p></li></ol>', sn('<p data-sp-sebelum="120" data-sp-baris="480">a</p>'))
ok('B2 gaya turunan --s-* dibuang: dibentuk ulang dari data-sp', sn('<p data-sp-baris="480" style="--s-baris:2">a</p>') === '<p data-sp-baris="480">a</p>')
ok('B3 spasi berisi skrip tidak lolos', !sn('<p data-sp-baris="&quot;><script>x</script>">a</p>').includes('data-sp') && !sn('<p data-sp-baris="&quot;><script>x</script>">a</p>').includes('<script'))
ok('B4 tab bertahan bersama karakternya', sn('<p>a<span data-tab="1">\t</span>b</p>') === '<p>a<span data-tab="1">\t</span>b</p>')
ok('B5 tab dibentuk ulang, atribut lain dibuang', sn('<span data-tab="jahat" onclick="x" style="color:#fff">\t</span>') === '<span data-tab="1">\t</span>')
ok('B6 atribut mirip tab tidak dikira tab', sn('<span x-data-tab="1">a</span>') === '<span>a</span>')
ok('B7 paragraf kedua butir membawa indent & spasinya', sn('<ol><li><p>a</p><p data-ind-kiri="0" data-ind-pertama="720" data-sp-sesudah="0">b</p></li></ol>') === '<ol><li><p>a</p><p data-ind-kiri="0" data-ind-pertama="720" data-sp-sesudah="0">b</p></li></ol>')

// ─── C. Berkas Word ───────────────────────────────────────────────────────────
console.log('\nC. Berkas Word')
const nx = (h: string) => narasiToXml(h, 'Arial', 24, 720)
const pPr = (xml: string, teks: string) => {
  const i = xml.indexOf(`>${teks}<`)
  const buka = xml.lastIndexOf('<w:p>', i)
  const a = xml.slice(buka, i)
  const m = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(a)
  return m ? m[1] : ''
}
ok('C1 tab jadi <w:tab/>, bukan karakter di w:t', /<w:tab\/>/.test(nx('<p>a<span data-tab="1">\t</span>b</p>')) && !/<w:t[^>]*>[^<]*\t/.test(nx('<p>a<span data-tab="1">\t</span>b</p>')))
const adaTabTebal = /<w:r><w:rPr>[^]*?<w:b\/>[^]*?<\/w:rPr><w:tab\/><\/w:r>/.test(nx('<p><strong>a<span data-tab="1">\t</span>b</strong></p>'))
ok('C2 tab mewarisi format run (garis bawah tab tercetak)', adaTabTebal)
ok('C3 dua tab berurutan = dua <w:tab/>, teks tetap urut', (() => { const x = nx('<p>a<span data-tab="1">\t</span><span data-tab="1">\t</span>b</p>'); return x.split('<w:tab/>').length === 3 && x.indexOf('>a<') < x.indexOf('<w:tab/>') && x.lastIndexOf('<w:tab/>') < x.indexOf('>b<') })())
ok('C4 spasi paragraf: urutan spacing → ind → jc', pPr(nx('<p style="text-align:center" data-sp-sebelum="120" data-ind-kiri="360">x</p>'), 'x') === '<w:spacing w:before="120"/><w:ind w:left="360" w:firstLine="720"/><w:jc w:val="center"/>', pPr(nx('<p style="text-align:center" data-sp-sebelum="120" data-ind-kiri="360">x</p>'), 'x'))
ok('C5 paragraf tanpa isian tidak berubah sama sekali', nx('<p>x</p>') === narasiToXml('<p>x</p>', 'Arial', 24, 720) && !nx('<p>x</p>').includes('w:spacing'))
ok('C6 spasi tak terbawa ke paragraf berikutnya', !pPr(nx('<p data-sp-baris="480">x</p><p>y</p>'), 'y').includes('w:spacing'))
ok('C7 judul berspasi', pPr(nx('<h2 data-sp-sebelum="240">x</h2>'), 'x') === '<w:spacing w:before="240"/>', pPr(nx('<h2 data-sp-sebelum="240">x</h2>'), 'x'))
ok('C8 spasi judul tak terbawa ke paragraf berikutnya', !pPr(nx('<h2 data-sp-sebelum="240">x</h2><p>y</p>'), 'y').includes('w:spacing'))
ok('C9 butir: urutan numPr → spacing → ind', /^<w:numPr>[^]*<\/w:numPr><w:spacing w:after="0"\/><w:ind /.test(pPr(nx('<ol><li data-sp-sesudah="0" data-ind-kiri="900"><p>x</p></li></ol>'), 'x')), pPr(nx('<ol><li data-sp-sesudah="0" data-ind-kiri="900"><p>x</p></li></ol>'), 'x'))
ok('C10 spasi butir mengenai paragraf bernomornya saja', !pPr(nx('<ol><li data-sp-sesudah="0"><p>x</p><p>y</p></li></ol>'), 'y').includes('w:spacing'))
ok('C11 paragraf pertama berspasi sendiri (dibungkus daftar) tetap terbawa', pPr(nx('<ol><li><p data-sp-baris="480">x</p></li></ol>'), 'x').includes('w:line="480"'))
const lanj = nx('<ol><li data-ind-kiri="1000"><p>x</p><p>polos</p><p data-ind-kiri="0" data-ind-pertama="720">sendiri</p><p data-sp-sesudah="0">renggang</p></li></ol>')
ok('C12 paragraf kedua tanpa isian: rata teks butir, tanpa nomor', pPr(lanj, 'polos') === '<w:ind w:left="1000"/>', pPr(lanj, 'polos'))
ok('C13 paragraf kedua berisian: memakai angkanya sendiri, tanpa nomor', pPr(lanj, 'sendiri') === '<w:ind w:firstLine="720"/>', pPr(lanj, 'sendiri'))
ok('C14 spasi paragraf kedua milik paragraf itu', pPr(lanj, 'renggang') === '<w:spacing w:after="0"/><w:ind w:left="1000"/>', pPr(lanj, 'renggang'))
ok('C15 indent paragraf kedua tak terbawa ke butir berikutnya', (() => { const x = nx('<ol><li><p>a</p><p data-ind-kiri="0">b</p></li><li><p>c</p></li></ol>'); return pPr(x, 'c').includes('<w:numPr>') && !pPr(x, 'c').includes('w:left') })())
ok('C16 paragraf kedua sesudah daftar bersarang tetap tanpa nomor', (() => { const x = nx('<ol><li><p>a</p><ol><li><p>b</p></li></ol><p>c</p></li></ol>'); return !pPr(x, 'c').includes('numPr') && pPr(x, 'b').includes('numPr') })())

// Dokumen utuh: nomor bertingkat menumpang paragraf penjelas, lewat numbering.xml sungguhan.
const pohon = (blok: BlockNode[][]): SectionNode[] => blok.map((bl, i) => ({ id: i + 1, parent_id: null, depth: 0, urutan: i, judul: `Bab ${i + 1}`, nomor: String(i + 1), locked: false, children: [], blocks: bl } as unknown as SectionNode))
const rakit = async (html: string) => {
  const { buffer } = await rakitDocx({ tree: pohon([[{ id: 1, tipe: 'NARASI', payload: { html }, urutan: 1 } as unknown as BlockNode]]), judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: DEFAULT_STYLE })
  const z = new PizZip(buffer)
  return { doc: z.file('word/document.xml')!.asText(), num: z.file('word/numbering.xml')!.asText(), gaya: z.file('word/styles.xml')!.asText() }
}
const kecil = await rakit('<ol start="2"><li><p>Tujuan</p><p>Penjelas</p><ol data-gaya="1.1."><li><p>Sasaran satu</p><p>Nilai</p></li><li><p>Sasaran dua</p></li></ol></li></ol>')
const numIdDari = (x: string, t: string) => /<w:numId w:val="(\d+)"/.exec(pPr(x, t))?.[1]
ok('C17 induk & 1.1. berbagi numId supaya %1.%2. membaca induknya', !!numIdDari(kecil.doc, 'Tujuan') && numIdDari(kecil.doc, 'Tujuan') === numIdDari(kecil.doc, 'Sasaran satu') && numIdDari(kecil.doc, 'Sasaran dua') === numIdDari(kecil.doc, 'Sasaran satu'), `${numIdDari(kecil.doc, 'Tujuan')}/${numIdDari(kecil.doc, 'Sasaran satu')}`)
ok('C18 nomor induk 2 lewat startOverride tingkat 0', new RegExp(`<w:num w:numId="${numIdDari(kecil.doc, 'Tujuan')}"><w:abstractNumId w:val="\\d+"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="2"/>`).test(kecil.num), kecil.num.slice(-300))
ok('C19 tingkat 1 di abstrak = %1.%2.', /<w:lvl w:ilvl="1">(?:(?!<\/w:lvl>)[^])*<w:lvlText w:val="%1\.%2\."\/>/.test(kecil.num))
ok('C20 penjelas & nilai tanpa nomor', !pPr(kecil.doc, 'Penjelas').includes('numPr') && !pPr(kecil.doc, 'Nilai').includes('numPr'))
ok('C21 bawaan dokumen tetap dari satu rumus', kecil.gaya.includes(`w:after="${spasiBawaan(DEFAULT_STYLE.spaceAfterPt, DEFAULT_STYLE.lineSpacing).sesudah}" w:line="${spasiBawaan(DEFAULT_STYLE.spaceAfterPt, DEFAULT_STYLE.lineSpacing).baris}"`))
const lanSusun = lanjutanDaftar(pohon([[
  { id: 1, tipe: 'NARASI', payload: { html: '<ol><li><p>a</p><p>penjelas</p></li><li><p>b</p></li></ol>' }, urutan: 1 } as unknown as BlockNode,
  { id: 2, tipe: 'NARASI', payload: { html: '<ol data-lanjut="1"><li><p>c</p></li></ol>' }, urutan: 2 } as unknown as BlockNode,
  { id: 3, tipe: 'NARASI', payload: { html: '<p>x</p>' }, urutan: 3 } as unknown as BlockNode,
]]))
ok('C22 hitungan editor: paragraf kedua tak memakan nomor', lanSusun.get(2)?.['1.'] === 3 && lanSusun.get(3)?.['1.'] === 4, JSON.stringify(Object.fromEntries(lanSusun)))

// ─── D. Perintah editor ───────────────────────────────────────────────────────
console.log('\nD. Perintah editor')
const AtribUji = Extension.create({
  name: 'atribUji',
  addGlobalAttributes: () => [{ types: ['paragraph', 'heading', 'listItem'], attributes: { textAlign: { default: null }, indKiri: { default: null }, indKanan: { default: null }, indPertama: { default: null } } }],
})
const GayaUji = Mark.create({ name: 'textStyle', addAttributes: () => ({ color: { default: null }, fontSize: { default: null } }) })
const schema = getSchema([StarterKit.configure({ link: false, trailingNode: false }), GayaDaftar, Superskrip, Subskrip, Stabilo, AtribUji, SpasiParagraf, TabNarasi, GayaUji])
type JS = Record<string, unknown>
const T = (t: string, ...marks: string[]): JS => ({ type: 'text', text: t, ...(marks.length ? { marks: marks.map(m => ({ type: m })) } : {}) })
const P = (t: string | JS[] = '', attrs?: JS): JS => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), ...(typeof t === 'string' ? (t ? { content: [T(t)] } : {}) : { content: t }) })
const LI = (t: string | JS[], ...anak: JS[]): JS => ({ type: 'listItem', content: [typeof t === 'string' ? P(t) : P(t), ...anak] })
const OL = (...isi: JS[]): JS => ({ type: 'orderedList', content: isi })
const dok = (...isi: JS[]) => schema.nodeFromJSON({ type: 'doc', content: isi })
const posTeks = (d: PMNode, t: string) => { let h = -1; d.descendants((n, p) => { if (h < 0 && n.isText && n.text!.includes(t)) h = p + n.text!.indexOf(t) }); if (h < 0) throw new Error(`teks ${t}?`); return h }
const stateDi = (d: PMNode, t: string, geser = 0) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, t) + geser) })
const statePilih = (d: PMNode, a: string, b: string) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, a), posTeks(d, b) + b.length) })
const jalan = (s: EditorState, p: Perintah) => { let hasil = s; const r = p(s, tr => { hasil = hasil.apply(tr) }); return { s: hasil, r } }
const tabDi = (d: PMNode) => { let n = 0; d.descendants(x => { if (x.type.name === 'tabNarasi') n++ }); return n }
const bentuk = (n: PMNode): string => {
  if (n.isText) return n.text!
  if (n.type.name === 'tabNarasi') return '⇥'
  const a: string[] = []
  n.forEach(c => a.push(bentuk(c)))
  const nama: Record<string, string> = { paragraph: 'p', orderedList: 'ol', listItem: 'li', heading: 'h', doc: 'doc' }
  return `${nama[n.type.name] ?? n.type.name}(${a.join('')})`
}

// Tab
const dokPolos = dok(P('satu dua'))
const t1 = jalan(stateDi(dokPolos, 'dua'), tekanTab)
ok('D1 Tab di paragraf biasa: menyisipkan tab di kursor', t1.r && bentuk(t1.s.doc) === 'doc(p(satu ⇥dua))', bentuk(t1.s.doc))
ok('D2 kursor sesudah tab', t1.s.selection.empty && t1.s.selection.from === posTeks(dokPolos, 'dua') + 1)
const t2 = jalan(statePilih(dokPolos, 'satu', 'satu'), tekanTab)
ok('D3 Tab atas pilihan sebagian: menggantinya', bentuk(t2.s.doc) === 'doc(p(⇥ dua))', bentuk(t2.s.doc))
const dokTebal = dok(P([T('tebal', 'bold')]))
const t3 = jalan(stateDi(dokTebal, 'bal'), tekanTab)
const tabTebal = (() => { let m = false; t3.s.doc.descendants(n => { if (n.type.name === 'tabNarasi') m = n.marks.some(x => x.type.name === 'bold') }); return m })()
ok('D4 tab mewarisi format di kursor', tabTebal)
const dDaftar = dok(OL(LI('Satu'), LI('Dua kalimat')))
const t4 = jalan(stateDi(dDaftar, 'Dua'), tekanTab)
ok('D5 Tab di awal butir: turun tingkat, tanpa tab', tabDi(t4.s.doc) === 0 && bentuk(t4.s.doc) === 'doc(ol(li(p(Satu)ol(li(p(Dua kalimat))))))', bentuk(t4.s.doc))
const t5 = jalan(stateDi(dDaftar, 'kalimat'), tekanTab)
ok('D6 Tab di tengah butir: menyisipkan tab, tingkat tetap', bentuk(t5.s.doc) === 'doc(ol(li(p(Satu))li(p(Dua ⇥kalimat))))', bentuk(t5.s.doc))
const t6 = jalan(stateDi(dDaftar, 'Satu'), tekanTab)
ok('D7 Tab di awal butir pertama: dimakan, isi tetap (fokus tidak lompat)', t6.r === true && bentuk(t6.s.doc) === bentuk(dDaftar), bentuk(t6.s.doc))
const t7 = jalan(statePilih(dDaftar, 'Dua', 'kalimat'), tekanTab)
ok('D8 seluruh paragraf butir terpilih: turun tingkat', tabDi(t7.s.doc) === 0 && bentuk(t7.s.doc) === 'doc(ol(li(p(Satu)ol(li(p(Dua kalimat))))))', bentuk(t7.s.doc))
const t8 = jalan(statePilih(dDaftar, 'Dua', 'Dua'), tekanTab)
ok('D9 sebagian kalimat butir terpilih: menggantinya dengan tab', bentuk(t8.s.doc) === 'doc(ol(li(p(Satu))li(p(⇥ kalimat))))', bentuk(t8.s.doc))
const dDuaButir = dok(OL(LI('Satu'), LI('Dua'), LI('Tiga')))
const t9 = jalan(statePilih(dDuaButir, 'Dua', 'Tiga'), tekanTab)
ok('D10 pilihan melintasi butir: turun tingkat bersama', tabDi(t9.s.doc) === 0 && bentuk(t9.s.doc) === 'doc(ol(li(p(Satu)ol(li(p(Dua))li(p(Tiga))))))', bentuk(t9.s.doc))
const dLanj = dok(OL(LI('Tujuan', P('Penjelas')), LI('Dua')))
const t10 = jalan(stateDi(dLanj, 'Penjelas'), tekanTab)
ok('D11 Tab di awal paragraf kedua butir: tab, bukan pindah tingkat', bentuk(t10.s.doc) === 'doc(ol(li(p(Tujuan)p(⇥Penjelas))li(p(Dua))))', bentuk(t10.s.doc))
ok('D12 sisip tab tanpa simpulnya di skema: ditolak, tidak meledak', sisipTab(EditorState.create({ doc: getSchema([StarterKit.configure({ link: false, trailingNode: false })]).nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] }) })) === false)
const dKode = dok({ type: 'codeBlock', content: [T('x')] })
ok('D13 blok kode: Tab tidak menyisipkan simpul', jalan(stateDi(dKode, 'x'), sisipTab).r === false)

// Pecah tab tempelan
const pecah = pecahTab(Fragment.from(schema.nodes.paragraph.create(null, [schema.text('a\tb\t', [schema.marks.bold.create()]), schema.text('c')])), schema)
ok('D14 teks tempelan bertab jadi simpul tab, format ikut', bentuk(pecah.child(0)) === 'p(a⇥b⇥c)' && pecah.child(0).child(1).marks.some(m => m.type.name === 'bold'), bentuk(pecah.child(0)))
const pecahKode = pecahTab(Fragment.from(schema.nodes.codeBlock.create(null, schema.text('a\tb'))), schema)
ok('D15 blok kode tak dipecah', pecahKode.child(0).textContent === 'a\tb')

// Enter di paragraf kedua
const e1 = jalan(stateDi(dLanj, 'jelas'), enterLanjutan)
ok('D16 Enter di paragraf kedua: paragraf baru di butir yang sama, tanpa butir baru', e1.r && bentuk(e1.s.doc) === 'doc(ol(li(p(Tujuan)p(Pen)p(jelas))li(p(Dua))))', bentuk(e1.s.doc))
ok('D17 kursor ikut ke paragraf baru', e1.s.selection.$from.parent.textContent === 'jelas' && e1.s.selection.$from.parentOffset === 0)
const dKosong = dok(OL(LI('Tujuan', P('Penjelas'), P()), LI('Dua')))
const posKosong = (() => { let h = -1; dKosong.descendants((n, p) => { if (n.type.name === 'paragraph' && !n.content.size) h = p + 1 }); return h })()
const e2 = jalan(EditorState.create({ doc: dKosong, selection: TextSelection.create(dKosong, posKosong) }), enterLanjutan)
ok('D18 Enter di paragraf kedua yang kosong: butir bernomor baru', e2.r && bentuk(e2.s.doc) === 'doc(ol(li(p(Tujuan)p(Penjelas))li(p())li(p(Dua))))', bentuk(e2.s.doc))
ok('D19 Enter di paragraf pertama butir: bukan urusan ini (Tiptap yang menangani)', jalan(stateDi(dLanj, 'Tujuan'), enterLanjutan).r === false)
ok('D20 Enter di luar daftar: bukan urusan ini', jalan(stateDi(dokPolos, 'satu'), enterLanjutan).r === false)
const e3 = jalan(statePilih(dLanj, 'Pen', 'Pen'), enterLanjutan)
ok('D21 Enter atas pilihan: pilihan terhapus lalu dipecah', bentuk(e3.s.doc) === 'doc(ol(li(p(Tujuan)p()p(jelas))li(p(Dua))))', bentuk(e3.s.doc))
ok('D22 penanda lanjutan benar', dalamLanjutan(stateDi(dLanj, 'Penjelas').selection.$from) && !dalamLanjutan(stateDi(dLanj, 'Tujuan').selection.$from) && !dalamLanjutan(stateDi(dokPolos, 'satu').selection.$from))

// Sasaran paragraf
const dSas = dok(P('Polos'), { type: 'heading', attrs: { level: 2 }, content: [T('Judul')] }, OL({ type: 'listItem', attrs: { indKiri: 1000 }, content: [P('Tujuan'), P('Penjelas')] }))
const sas = sasaranParagraf(statePilih(dSas, 'Polos', 'Penjelas'))
ok('D23 jenis tiap paragraf', sas.map(s => s.jenis).join() === 'paragraf,judul,butir,lanjutan', sas.map(s => s.jenis).join())
ok('D24 paragraf pertama diwakili butirnya', sas[2].node.type.name === 'listItem' && sas[2].gantung === 360)
ok('D25 lanjutan berdiri sendiri, bawaannya kiri butir SEBENARNYA', sas[3].node.textContent === 'Penjelas' && sas[3].node.type.name === 'paragraph' && sas[3].bawaan === 1000, String(sas[3].bawaan))
const sasLain = sasaranParagraf(stateDi(dok(OL(LI('A', OL(LI('B', P('C')))))), 'C'))
ok('D26 lanjutan bersarang: kiri tingkatnya', sasLain[0].jenis === 'lanjutan' && sasLain[0].bawaan === 1440 && sasLain[0].kedalaman === 2, JSON.stringify(sasLain.map(s => [s.jenis, s.bawaan])))
ok('D27 baca isian node', JSON.stringify(simpananSpasi(schema.nodes.paragraph.create({ spBaris: 480 }))) === '{"baris":480}' && JSON.stringify(simpananInden(schema.nodes.paragraph.create({ indKiri: 0 }))) === '{"kiri":0}')

// Hapus format
const dFmt = dok(P([T('a')], { spSebelum: 120, spBaris: 480, indKiri: 360 }))
const hf = jalan(stateDi(dFmt, 'a'), hapusFormat).s.doc.firstChild!
ok('D28 Hapus format ikut membuang spasi', hf.attrs.spSebelum === null && hf.attrs.spBaris === null && hf.attrs.indKiri === null)
const hfLi = jalan(stateDi(dok(OL({ type: 'listItem', attrs: { spSesudah: 0 }, content: [P('a')] })), 'a'), hapusFormat).s.doc.firstChild!.firstChild!
ok('D29 Hapus format di butir ikut membuang spasi butir', hfLi.attrs.spSesudah === null)

// Kuas
const merah = { type: 'textStyle', attrs: { color: '#ff0000', fontSize: null } }
const dSumber = dok(
  P([{ type: 'text', text: 'Sumber', marks: [{ type: 'bold' }, merah] }], { textAlign: 'center', spSesudah: 0, indKiri: 360 }),
  P([T('Sasaran kalimat panjang', 'italic')]),
  P('Dua'),
  P('Tiga'),
)
const fKuas = ambilFormat(stateDi(dSumber, 'umber'))
ok('D30 ambil: format huruf di kursor (JSON, bisa pindah antar-editor)', JSON.stringify(fKuas.marks.map(m => m.type).sort()) === '["bold","textStyle"]' && JSON.parse(JSON.stringify(fKuas)).marks.length === 2)
ok('D31 ambil: format paragraf', fKuas.textAlign === 'center' && fKuas.spasi.spSesudah === 0 && fKuas.inden?.indKiri === 360 && fKuas.level === null)
const k1 = jalan(statePilih(dSumber, 'kalimat', 'kalimat'), terapkanFormat(fKuas))
const parKe = (d: PMNode, i: number) => d.child(i)
const nodeTeks = (d: PMNode, t: string) => { let h: PMNode | null = null; d.descendants(n => { if (n.isText && n.text === t) h = n }); return h as PMNode | null }
ok('D32 sapu sebagian: huruf saja, format lama teks itu diganti', nodeTeks(k1.s.doc, 'kalimat')?.marks.map(m => m.type.name).sort().join() === 'bold,textStyle', nodeTeks(k1.s.doc, 'kalimat')?.marks.map(m => m.type.name).join())
ok('D33 teks di sekitar pilihan tak tersentuh', nodeTeks(k1.s.doc, ' panjang')?.marks.map(m => m.type.name).join() === 'italic', String(nodeTeks(k1.s.doc, ' panjang')?.marks.map(m => m.type.name)))
ok('D34 sapu sebagian: paragraf tujuan tak berubah', parKe(k1.s.doc, 1).attrs.textAlign === null && parKe(k1.s.doc, 1).attrs.indKiri === null)
ok('D35 warna terbawa utuh', nodeTeks(k1.s.doc, 'kalimat')!.marks.find(m => m.type.name === 'textStyle')?.attrs.color === '#ff0000')
const k2 = jalan(statePilih(dSumber, 'Dua', 'Dua'), terapkanFormat(fKuas))
ok('D36 seluruh paragraf terpilih: format paragraf ikut', parKe(k2.s.doc, 2).attrs.textAlign === 'center' && parKe(k2.s.doc, 2).attrs.spSesudah === 0 && parKe(k2.s.doc, 2).attrs.indKiri === 360)
const k3 = jalan(statePilih(dSumber, 'Dua', 'Tiga'), terapkanFormat(fKuas))
ok('D37 banyak paragraf utuh: semuanya kena', parKe(k3.s.doc, 2).attrs.textAlign === 'center' && parKe(k3.s.doc, 3).attrs.textAlign === 'center')
const k3b = jalan(EditorState.create({ doc: dSumber, selection: TextSelection.create(dSumber, posTeks(dSumber, 'Dua') + 1, posTeks(dSumber, 'Tiga') + 4) }), terapkanFormat(fKuas))
ok('D38 pilihan mulai di tengah paragraf: paragraf pertamanya huruf saja, yang utuh kena', parKe(k3b.s.doc, 2).attrs.textAlign === null && parKe(k3b.s.doc, 3).attrs.textAlign === 'center')
const k4 = jalan(stateDi(dSumber, 'lim'), terapkanFormat(fKuas))
ok('D39 tanpa pilihan: kata di kursor saja', nodeTeks(k4.s.doc, 'kalimat')?.marks.some(m => m.type.name === 'bold') === true && nodeTeks(k4.s.doc, 'Sasaran ')?.marks.some(m => m.type.name === 'bold') === false && parKe(k4.s.doc, 1).attrs.textAlign === null)
const dSatu = dok(P('Sumber'), P())
const k5 = jalan(EditorState.create({ doc: dSatu, selection: TextSelection.create(dSatu, dSatu.content.size - 1) }), terapkanFormat(fKuas))
ok('D40 paragraf kosong: format paragraf kena, ketikan berikutnya memakai format huruf', k5.s.doc.child(1).attrs.textAlign === 'center' && (k5.s.storedMarks ?? []).some(m => m.type.name === 'bold'))
const dJudul = dok({ type: 'heading', attrs: { level: 3 }, content: [T('Judul')] }, P('Biasa'), OL(LI('Butir')))
const k6 = jalan(statePilih(dJudul, 'Biasa', 'Biasa'), terapkanFormat(ambilFormat(stateDi(dJudul, 'Judul'))))
ok('D41 sumber judul: paragraf utuh jadi judul setingkat', k6.s.doc.child(1).type.name === 'heading' && k6.s.doc.child(1).attrs.level === 3)
const k7 = jalan(statePilih(dJudul, 'Judul', 'Judul'), terapkanFormat(ambilFormat(stateDi(dJudul, 'Biasa'))))
ok('D42 sumber paragraf: judul utuh jadi paragraf', k7.s.doc.child(0).type.name === 'paragraph')
const k8 = jalan(statePilih(dJudul, 'Butir', 'Butir'), terapkanFormat(ambilFormat(stateDi(dJudul, 'Judul'))))
ok('D43 butir tetap paragraf daftar (judul tak boleh jadi butir)', k8.s.doc.child(2).firstChild!.firstChild!.type.name === 'paragraph' && k8.s.doc.child(2).type.name === 'orderedList')
const dBut = dok(P([T('p')], { spBaris: 480, indKiri: 360, textAlign: 'center' }), OL({ type: 'listItem', attrs: { indKiri: 1000, spSesudah: 60 }, content: [P('Butir'), P('Lanjut')] }))
const k9 = jalan(statePilih(dBut, 'Butir', 'Butir'), terapkanFormat(ambilFormat(stateDi(dBut, 'p'))))
const liK9 = k9.s.doc.child(1).firstChild!
ok('D44 butir tujuan: spasi ke butir, indent tingkat TIDAK berubah', liK9.attrs.spBaris === 480 && liK9.attrs.indKiri === 1000 && liK9.firstChild!.attrs.textAlign === 'center' && liK9.firstChild!.attrs.spBaris === null)
const k10 = jalan(statePilih(dBut, 'Lanjut', 'Lanjut'), terapkanFormat(ambilFormat(stateDi(dBut, 'p'))))
ok('D45 paragraf kedua butir: indent & spasi ke paragraf itu', k10.s.doc.child(1).firstChild!.child(1).attrs.indKiri === 360 && k10.s.doc.child(1).firstChild!.child(1).attrs.spBaris === 480)
const fButir = ambilFormat(stateDi(dBut, 'Butir'))
ok('D46 sumber butir: spasi dari butir, indent tak dibawa', fButir.spasi.spSesudah === 60 && fButir.inden === null)
const k11 = jalan(statePilih(dBut, 'p', 'p'), terapkanFormat(fButir))
ok('D47 sumber butir ke paragraf: indent tujuan tetap', k11.s.doc.child(0).attrs.indKiri === 360 && k11.s.doc.child(0).attrs.spSesudah === 60)
const dAtom = dok(P([T('a '), { type: 'tabNarasi' }, T(' b', 'italic')]))
const fPilih = ambilFormat(EditorState.create({ doc: dSumber, selection: TextSelection.create(dSumber, posTeks(dSumber, 'Sasaran'), posTeks(dSumber, 'Dua') + 3) }))
ok('D48 ambil dari pilihan: format teks pertamanya', fPilih.marks.map(m => m.type).join() === 'italic', fPilih.marks.map(m => m.type).join())
const k12 = jalan(statePilih(dAtom, 'a', 'b'), terapkanFormat(fKuas))
const dDuaFormat = dok(P([T('tebal', 'bold'), T('miring', 'italic')]))
ok('D48b ambil dari pilihan: teks PERTAMA, bukan yang terakhir dalam paragraf', ambilFormat(statePilih(dDuaFormat, 'tebal', 'miring')).marks.map(m => m.type).join() === 'bold')
ok('D48c tanda di luar format kuas tidak terbawa', ambilFormat(stateDi(dok(P([{ type: 'text', text: 'kode', marks: [{ type: 'code' }] }])), 'kode', 1)).marks.length === 0)
ok('D49 simpul tab di pilihan tetap ada', tabDi(k12.s.doc) === 1 && k12.s.doc.firstChild!.attrs.textAlign === 'center')
const k13 = jalan(statePilih(dokPolos, 'satu', 'satu'), terapkanFormat({ marks: [{ type: 'markTakAda' }], level: null, textAlign: null, spasi: {}, inden: null }))
ok('D50 tanda yang tak dikenal skema diabaikan', k13.r === true && bentuk(k13.s.doc) === bentuk(dokPolos))
ok('D51 posisi daftar di paragraf kedua tetap terbaca (menu daftar berlaku)', posisiDaftar(stateDi(dLanj, 'Penjelas').selection.$from)?.kedalaman === 1)

// ─── E. Impor Word ────────────────────────────────────────────────────────────
console.log('\nE. Impor Word')
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const par = (t: string, ppr = '') => `<w:p><w:pPr>${ppr}</w:pPr><w:r><w:t>${t}</w:t></w:r></w:p>`
const berkas = (badan: string, numbering = ''): Buffer => {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${badan}<w:sectPr/></w:body></w:document>`)
  if (numbering) z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${WNS}>${numbering}</w:numbering>`)
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style></w:styles>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
const judul = par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>')
const narasiDari = (d: Buffer) => bacaDocxLkjip(d).bagian[0].blok.map(b => (b.tipe === 'NARASI' ? b.payload.html : `[${b.tipe}]`)).join('')
const lv = (l: number, fmt: string, teks: string) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${teks}"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
const num5 = `<w:abstractNum w:abstractNumId="5">${lv(0, 'decimal', '%1.')}${lv(1, 'decimal', '%1.%2.')}${lv(2, 'decimal', '%1.%2.%3.')}</w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="5"/></w:num>`
  + `<w:abstractNum w:abstractNumId="6">${lv(0, 'lowerLetter', '%1)')}</w:abstractNum><w:num w:numId="6"><w:abstractNumId w:val="6"/></w:num>`
const nP = (id: number, l = 0) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="${id}"/></w:numPr>`
const INDEN_KIRI = '<w:ind w:left="720" w:firstLine="0"/>'
// Bentuk persis berkas pemilik: Tujuan, 2 penjelas, Sasaran, penjelas, Tujuan berikutnya.
const e1Html = narasiDari(berkas(judul + par('Tujuan', nP(5)) + par('Penjelas satu', INDEN_KIRI) + par('Penjelas dua', INDEN_KIRI) + par('Sasaran', nP(5, 1)) + par('Nilai', INDEN_KIRI) + par('Tujuan dua', nP(5)) + par('Capaian', INDEN_KIRI) + par('Sasaran A', nP(5, 1)) + par('Nilai A', INDEN_KIRI) + par('Sasaran B', nP(5, 1)) + par('Nilai B', INDEN_KIRI) + par('Lain', nP(6)), num5))
ok('E1 bentuk berkas pemilik: 1.1. tetap anak sungguhan, nomor tidak jadi teks', !/>\d\.\d\. /.test(e1Html) && e1Html.startsWith('<ol><li><p>Tujuan</p><p>Penjelas satu</p><p>Penjelas dua</p><ol data-gaya="1.1."><li'), e1Html)
ok('E2 penjelas sebelum nomor tingkat atas: di luar daftar, nomor berikutnya tetap lanjut', e1Html.includes('<p>Sasaran</p></li></ol></li></ol><p data-ind-kiri="720">Nilai</p><ol start="2"><li><p>Tujuan dua</p>'), e1Html)
ok('E3 penjelas di antara dua 1.1.: masuk butir sebelumnya, keduanya saudara', /<p>Sasaran A<\/p><p data-ind-kiri="720">Nilai A<\/p><\/li><li[^>]*><p>Sasaran B<\/p>/.test(e1Html), e1Html)
ok('E4 penjelas terakhir (tak ada 1.1. sesudahnya) keluar dari daftar', e1Html.includes('</ol><p data-ind-kiri="720"') && e1Html.includes('>Nilai B</p><ol type="a"') === false && /Nilai B<\/p>/.test(e1Html.slice(e1Html.lastIndexOf('</ol><p'))), e1Html.slice(-160))
const eKiri = narasiDari(berkas(judul + par('T', nP(5)) + par('Beda', '<w:ind w:left="0" w:firstLine="720"/>') + par('S', nP(5, 1)), num5))
ok('E5 indent penjelas: hanya yang beda dari teks butir disimpan', eKiri.includes('<p data-ind-kiri="0" data-ind-pertama="720">Beda</p>'), eKiri)
const eTengah = narasiDari(berkas(judul + par('T', nP(5)) + par('Tengah', '<w:jc w:val="center"/>') + par('S', nP(5, 1)), num5))
ok('E6 perataan penjelas terbawa', /<p style="text-align:center"[^>]*>Tengah<\/p>/.test(eTengah), eTengah)
const tblUji = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>sel</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
const eTabel = narasiDari(berkas(judul + par('T', nP(5)) + tblUji + par('S', nP(5, 1)), num5))
ok('E7 terpotong tabel: induk benar-benar lain blok, nomor jadi teks', eTabel.includes('>1.1. S</p>'), eTabel)
const eLain = narasiDari(berkas(judul + par('T', nP(5)) + par('polos') + par('S', nP(6)), num5))
ok('E8 sesudahnya daftar lain: polos tetap di luar daftar', eLain === '<ol><li><p>T</p></li></ol><p>polos</p><ol data-gaya="a)"><li><p>S</p></li></ol>', eLain)
const eBiasa = narasiDari(berkas(judul + par('T', nP(5)) + par('polos') + par('U', nP(5)), num5))
ok('E9 sesudahnya tingkat yang sama: perilaku lama (start) tidak berubah', eBiasa === '<ol><li><p>T</p></li></ol><p>polos</p><ol start="2"><li><p>U</p></li></ol>', eBiasa)
const eLompat = narasiDari(berkas(judul + par('T', nP(5)) + par('polos') + par('S', nP(5, 2)), num5))
ok('E10 tingkat melompat: induk tak lengkap, nomor jadi teks', eLompat.includes('<p>polos</p>') && eLompat.includes('1.1.1. S</p>') && !eLompat.includes('<p>T</p><p>polos'), eLompat)
const eSusun = susunNarasi([
  { isi: 'A', jc: null, ind: {}, num: { kunci: 'x', ilvl: 0, gaya: '1.', nomor: 1, induk: [] } },
  { isi: 'p', jc: null, ind: {}, num: null },
  { isi: 'B', jc: null, ind: {}, num: { kunci: 'x', ilvl: 1, gaya: '1.1.', nomor: 1, induk: [7] } },
], 0)
ok('E11 nomor induk beda (2.1. di bawah 1.): tidak menumpang pohon yang salah', eSusun.join('') === '<ol><li><p>A</p></li></ol><p>p</p><p>7.1. B</p>', eSusun.join(''))
const num7 = `<w:abstractNum w:abstractNumId="7">${lv(0, 'decimal', '%1.')}${lv(1, 'lowerLetter', '%2)')}</w:abstractNum><w:num w:numId="7"><w:abstractNumId w:val="7"/></w:num>`
const eHuruf = narasiDari(berkas(judul + par('T', nP(7)) + par('polos') + par('S', nP(7, 1)), num7))
ok('E11b anak bukan 1.1.: perilaku lama, penjelas di luar daftar', eHuruf === '<ol><li><p>T</p></li></ol><p>polos</p><ol data-gaya="a)"><li data-ind-kiri="1440"><p>S</p></li></ol>', eHuruf)
const nSu = (kunci: string, ilvl: number, gaya: '1.' | '1.1.', nomor: number, induk: number[]) => ({ kunci, ilvl, gaya, nomor, induk })
const eAbstrak = susunNarasi([{ isi: 'A', jc: null, ind: {}, num: nSu('x', 0, '1.', 1, []) }, { isi: 'p', jc: null, ind: {}, num: null }, { isi: 'B', jc: null, ind: {}, num: nSu('y', 1, '1.1.', 1, [1]) }], 0).join('')
ok('E11c 1.1. dari abstrak lain tidak menumpang pohon ini', eAbstrak === '<ol><li><p>A</p></li></ol><p>p</p><p>1.1. B</p>', eAbstrak)
const ePanjang = susunNarasi([{ isi: 'A', jc: null, ind: {}, num: nSu('x', 0, '1.', 1, []) }, { isi: 'p', jc: null, ind: {}, num: null }, { isi: 'B', jc: null, ind: {}, num: nSu('x', 2, '1.1.', 1, [1]) }], 0).join('')
ok('E11d nomor induk tak selengkap tingkatnya: tidak menumpang', ePanjang === '<ol><li><p>A</p></li></ol><p>p</p><p>1.1. B</p>', ePanjang)
const eLewat = susunNarasi([{ isi: 'A', jc: null, ind: {}, num: nSu('x', 0, '1.', 1, []) }, { isi: 'p', jc: null, ind: {}, num: null }, { isi: '', jc: null, ind: {}, num: nSu('z', 0, '1.', 1, []) }, { isi: 'B', jc: null, ind: {}, num: nSu('x', 1, '1.1.', 1, [1]) }], 0).join('')
ok('E11e butir kosong di antaranya dilewati saat melihat ke depan', eLewat.startsWith('<ol><li><p>A</p><p>p</p><ol data-gaya="1.1.">'), eLewat)
const eKosong = narasiDari(berkas(judul + par('T', nP(5)) + '<w:p/>' + par('S', nP(5, 1)), num5))
ok('E12 paragraf kosong di antaranya tak menghalangi', eKosong.startsWith('<ol><li><p>T</p><ol data-gaya="1.1.">'), eKosong)
const eBatas = susunNarasi([
  { isi: 'A'.repeat(100), jc: null, ind: {}, num: { kunci: 'x', ilvl: 0, gaya: '1.', nomor: 1, induk: [] } },
  { isi: 'p'.repeat(100), jc: null, ind: {}, num: null },
  { isi: 'B', jc: null, ind: {}, num: { kunci: 'x', ilvl: 1, gaya: '1.1.', nomor: 1, induk: [1] } },
], 0, 300)
ok('E13 blok terpecah batas: induk hilang, jatuh ke teks', eBatas.length > 1 && eBatas[eBatas.length - 1].includes('1.1. B</p>'), JSON.stringify(eBatas))
const eTab = narasiDari(berkas(judul + `<w:p><w:r><w:t>Nama</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>Budi</w:t></w:r></w:p>`))
ok('E14 tab berkas sumber terbawa', eTab === '<p>Nama<span data-tab="1">\t</span>Budi</p>', JSON.stringify(eTab))
const eTabAwal = narasiDari(berkas(judul + `<w:p><w:r><w:tab/></w:r><w:r><w:t>Awal</w:t></w:r><w:r><w:tab/></w:r></w:p>`))
ok('E15 tab di awal kalimat bertahan, di ujung dibuang', eTabAwal === '<p><span data-tab="1">\t</span>Awal</p>', JSON.stringify(eTabAwal))
ok('E16 impor lolos penyaring utuh', sn(e1Html) === e1Html, sn(e1Html))

// ─── F. Tempel dari Word ──────────────────────────────────────────────────────
console.log('\nF. Tempel dari Word')
const klip = readFileSync('scripts/fixtures/lkjip-papan-klip/word-daftar.html', 'utf8')
const tp = tempelDariWord(klip)
const tanpaSpan = tp.replace(/<\/?span\b[^>]*>/g, '').replace(/\s+/g, ' ')
ok('F1 berkas asli: daftar bertingkat tersusun, gaya tiap tingkat dari @list', /<ol data-gaya="1\)"><li[^>]*><p>Satu<\/p><\/li><li[^>]*><p><b[^>]*>Dua tebal<\/b><\/p><ol data-gaya="a\)"><li[^>]*><p>Anak a<\/p><\/li><li[^>]*><p>Anak b<\/p><ol data-gaya="i\)"><li[^>]*><p>Cucu<\/p><\/li><\/ol><\/li><\/ol><\/li><li[^>]*><p>Tiga<\/p><\/li><\/ol>/.test(tanpaSpan), tanpaSpan.slice(0, 700))
ok('F2 penanda nomor tidak ikut jadi teks', !/supportLists|mso-list:Ignore|>1\)|>2\)|>a\)/.test(tp), tp.slice(0, 300))
ok('F3 paragraf biasa di luar daftar utuh apa adanya', tp.includes('<p class=MsoNormal>Paragraf pembuka biasa<o:p></o:p></p>') && tp.includes('<p class=MsoNormal>Penjelas tanpa nomor<o:p></o:p></p>'))
ok('F4 bullet Symbol jadi bullet sungguhan, indent tingkat dari berkas', /<ul><li[^>]*><p>Bullet satu<\/p><\/li><li[^>]*><p>Bullet dua<\/p><\/li><\/ul>/.test(tanpaSpan), tanpaSpan.slice(tanpaSpan.indexOf('Penjelas'), tanpaSpan.indexOf('Penjelas') + 300))
ok('F5 tab Word jadi tab editor', tp.includes('Nama<span data-tab="1">\t</span>Budi'), tp.slice(tp.indexOf('Nama') - 20, tp.indexOf('Nama') + 60))
ok('F6 huruf kurung tingkat 1', /<ol data-gaya="a\)"><li[^>]*><p>Huruf kurung satu<\/p>/.test(tanpaSpan))
ok('F7 indent mengikuti berkas: tingkat 1 = 18 pt, tingkat 2 dari kelas = 36 pt, tingkat 3 = 54 pt', /<li data-ind-kiri="360"><p>Satu/.test(tanpaSpan) && /<li data-ind-kiri="720"><p>Anak a/.test(tanpaSpan) && /<li data-ind-kiri="1080"><p>Cucu/.test(tanpaSpan), tanpaSpan.slice(0, 300))
ok('F8 hasil tempelan lolos penyaring tanpa kehilangan daftar', (() => { const s = sn(tp); return s.includes('<ol data-gaya="1)">') && s.includes('<ol data-gaya="i)">') && s.includes('<span data-tab="1">\t</span>') })())
const kecilP = (css: string, pen: string, isi: string) => `<p class=MsoListParagraph style='${css}'><![if !supportLists]><span><span style='mso-list:Ignore'>${pen}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;</span></span></span><![endif]>${isi}<o:p></o:p></p>`
const css = (l: number, n = 1, id = 0) => `mso-list:l${id} level${l} lfo${n}`
const wr = (s: string, gaya = '') => `<html><head><style><!-- ${gaya} --></style></head><body><!--StartFragment-->${s}<!--EndFragment--></body></html>`
ok('F9 bukan dari Word: dikembalikan persis', tempelDariWord('<p>a</p><ol><li>b</li></ol>') === '<p>a</p><ol><li>b</li></ol>')
ok('F9b bukan dari Word: dokumen utuh dikembalikan, kepala & badan tak dipotong', tempelDariWord('<html><body><!--StartFragment--><p>a</p><!--EndFragment--></body></html>') === '<html><body><!--StartFragment--><p>a</p><!--EndFragment--></body></html>')
ok('F10 tempelan sebagian: nomor mulai dari penanda', tempelDariWord(wr(kecilP(css(1), '3.', 'x') + kecilP(css(1), '4.', 'y'))) === '<ol start="3"><li data-ind-pertama="0"><p>x</p></li><li data-ind-pertama="0"><p>y</p></li></ol>'.replace(/ data-ind-pertama="0"/g, ''), tempelDariWord(wr(kecilP(css(1), '3.', 'x') + kecilP(css(1), '4.', 'y'))))
const rom = tempelDariWord(wr(kecilP(css(1), 'ii.', 'x'), '@list l0:level1 {mso-level-number-format:roman-lower; mso-level-text:"%1\\.";}'))
ok('F11 romawi dari @list, nomor dibaca benar', rom === '<ol start="2" data-gaya="i."><li><p>x</p></li></ol>', rom)
const hur = tempelDariWord(wr(kecilP(css(1), 'c)', 'x'), '@list l0:level1 {mso-level-number-format:alpha-lower; mso-level-text:"%1\\)";}'))
ok('F12 huruf: nomor ke-3', hur === '<ol start="3" data-gaya="a)"><li><p>x</p></li></ol>', hur)
const iHuruf = tempelDariWord(wr(kecilP(css(1), 'i)', 'x'), '@list l0:level1 {mso-level-number-format:alpha-lower;}'))
ok('F13 "i" milik deret huruf: @list menang atas tebakan romawi', iHuruf === '<ol start="9" data-gaya="a)"><li><p>x</p></li></ol>', iHuruf)
ok('F14 tanpa @list: i. = romawi, b. = huruf', tempelDariWord(wr(kecilP(css(1), 'i.', 'x'))).includes('data-gaya="i."') && tempelDariWord(wr(kecilP(css(1), 'b.', 'x'))).includes('<ol type="a" start="2">'), tempelDariWord(wr(kecilP(css(1), 'b.', 'x'))))
ok('F15 kurung penuh', tempelDariWord(wr(kecilP(css(1), '(2)', 'x'))) === '<ol start="2" data-gaya="(1)"><li><p>x</p></li></ol>', tempelDariWord(wr(kecilP(css(1), '(2)', 'x'))))
const des = tempelDariWord(wr(kecilP(css(1), '1.', 'A') + '<p class=MsoNormal>penjelas<o:p></o:p></p>' + kecilP(css(2), '1.1.', 'B') + kecilP(css(2), '1.2.', 'C')))
ok('F16 1.1. dengan penjelas: satu pohon, aturan sama dgn impor', des === '<ol><li><p>A</p><p>penjelas</p><ol data-gaya="1.1."><li><p>B</p></li><li><p>C</p></li></ol></li></ol>', des)
const desLepas = tempelDariWord(wr(kecilP(css(2), '2.3.', 'B')))
ok('F17 1.1. tanpa induk: nomor jadi teks', desLepas === '<p>2.3. B</p>', desLepas)
const desAtas = tempelDariWord(wr(kecilP(css(1), '1.1', 'B')))
ok('F18 pola berawalan tetap di tingkat 1: jadi teks, bukan nomor salah', desAtas === '<p>1.1 B</p>', desAtas)
const bul = (p: string) => tempelDariWord(wr(kecilP(css(1), p, 'x')))
ok('F19 huruf Symbol/Wingdings jadi bentuk bullet', bul('·').startsWith('<ul>') && bul('o').startsWith('<ul data-gaya="○">') && bul('§').startsWith('<ul data-gaya="▪">') && bul('Ø').startsWith('<ul data-gaya="➢">') && bul('ü').startsWith('<ul data-gaya="✓">') && bul('-').startsWith('<ul data-gaya="–">'), bul('o'))
ok('F20 komentar kondisional bentuk lain tetap dikenali', tempelDariWord(wr(`<p style='mso-list:l0 level1 lfo1'><!--[if !supportLists]--><span style='mso-list:Ignore'>1.</span><!--[endif]-->x</p>`)) === '<ol><li><p>x</p></li></ol>')
const tb = tempelDariWord(wr(kecilP(css(1), '1.', 'A') + '<table><tr><td>sel</td></tr></table>' + kecilP(css(1), '2.', 'B')))
ok('F21 tabel di tengah: daftar terpotong, tabel utuh, nomor lanjut', tb === '<ol><li><p>A</p></li></ol><table><tr><td>sel</td></tr></table><ol start="2"><li><p>B</p></li></ol>', tb)
const ujungTabel = tempelDariWord(wr(kecilP(css(1), '1.', 'A') + '<table><tr><td>sel</td></tr></table>'))
ok('F21b tabel di ujung tempelan tidak hilang', ujungTabel === '<ol><li><p>A</p></li></ol><table><tr><td>sel</td></tr></table>', ujungTabel)
ok('F22 tab saja tanpa daftar: paragrafnya tetap utuh', tempelDariWord(wr(`<p class=MsoNormal>a<span style='mso-tab-count:2'>&nbsp; </span>b</p>`)) === `<p class=MsoNormal>a<span data-tab="1">\t</span><span data-tab="1">\t</span>b</p>`, tempelDariWord(wr(`<p class=MsoNormal>a<span style='mso-tab-count:2'>&nbsp; </span>b</p>`)))
ok('F23 paragraf kosong Word bertahan di luar daftar', tempelDariWord(wr(`<p class=MsoNormal><o:p>&nbsp;</o:p></p>` + kecilP(css(1), '1.', 'A'))) === `<p class=MsoNormal><o:p>&nbsp;</o:p></p><ol><li><p>A</p></li></ol>`)
const beda = tempelDariWord(wr(kecilP(css(1, 1, 0), '1.', 'A') + kecilP(css(1, 2, 1), '1.', 'B')))
ok('F24 dua daftar berbeda bersebelahan: tidak menyatu', beda === '<ol><li><p>A</p></li></ol><ol><li><p>B</p></li></ol>', beda)
const bedaLanjut = tempelDariWord(wr(kecilP(css(1, 1, 0), '1.', 'A') + kecilP(css(1, 2, 1), '2.', 'B')))
ok('F24b dua daftar berbeda, nomornya kebetulan berurut: tetap tidak menyatu', bedaLanjut === '<ol><li><p>A</p></li></ol><ol start="2"><li><p>B</p></li></ol>', bedaLanjut)
ok('F25 penanda tak terbaca: teksnya tetap ada', tempelDariWord(wr(kecilP(css(1), 'Pasal 1', 'x'))).includes('Pasal 1 x'), tempelDariWord(wr(kecilP(css(1), 'Pasal 1', 'x'))))
ok('F26 tanpa penanda StartFragment: badan dokumen dibaca', tempelDariWord(`<html><body>${kecilP(css(1), '1.', 'x')}</body></html>`) === '<ol><li><p>x</p></li></ol>')
ok('F27 gaya paragraf lain tak mengganggu pembacaan penanda', tempelDariWord(wr(`<p style='text-align:center;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-bidi-theme-font:minor-latin'><span style='mso-list:Ignore'>1.</span></span><![endif]>x</p>`)) === '<ol><li><p>x</p></li></ol>')
const sw = sn(tempelDariWord(wr(kecilP(css(1), '1.', `<img src=x onerror=alert(1)><script>alert(2)</script>teks`))))
ok('F28 isi jahat disaring penyaring biasa saat simpan', !sw.includes('onerror') && !sw.includes('<script') && sw.includes('teks'), sw)

// ─── G. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nG. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const ex = kode('lib/lkjip/ekstensi-narasi.ts')
const pm = kode('app/(dashboard)/lkjip/[id]/ParagrafModal.tsx')
ok('G1 ekstensi terpasang', /IndenParagraf, SpasiParagraf, TabNarasi\]/.test(tt))
ok('G2 tempelan lewat pembaca Word', tt.includes('transformPastedHTML: html => tempelDariWord(html)'))
ok('G3 tab sebagai simpul atom', /name: 'tabNarasi'[\s\S]*?atom: true/.test(ex) && ex.includes("parseHTML: () => [{ tag: 'span[data-tab]', priority: 60 }]"))
ok('G4 Tab, Shift+Tab, Enter lewat perintah', /Tab: \(\) => \{[\s\S]*?tekanTab\(state, view\.dispatch\)/.test(ex) && /Enter: \(\) => \{[\s\S]*?enterLanjutan\(state, view\.dispatch\)/.test(ex))
ok('G5 Shift+Tab di luar daftar dilepas (jalan keluar papan ketik)', /'Shift-Tab': \(\) => \{[\s\S]*?if \(!posisiDaftar\(\$from\)\) return false;/.test(ex))
ok('G6 Shift+Tab di paragraf kedua tidak memindah butirnya', ex.includes('if (!dalamLanjutan($from)) naikTingkat(state, view.dispatch);'))
ok('G7 tombol tambah indent di paragraf kedua tidak memindah butirnya', tt.includes('const posisi = dalamLanjutan(ed.state.selection.$from) ? null : posisiDaftar(ed.state.selection.$from);'))
ok('G8 penggaris memakai bawaan lanjutan', tt.includes('s.bawaan ?? bawaanDxa'))
ok('G9 CSS: tab selebar tab Word', tt.includes('tab-size: calc(720 * var(--lk-dxa))') && tt.includes('white-space: pre'))
ok('G10 CSS: paragraf kedua butir menghormati angka mutlaknya', tt.includes('margin-left: calc((var(--i-kiri, var(--lk-abs)) - var(--lk-abs)) * var(--lk-dxa))'))
ok('G11 CSS: spasi per paragraf dengan cadangan setelan dokumen', tt.includes('margin: var(--s-sebelum, 0) 0 var(--s-sesudah, var(--lk-after, 8px)); line-height: var(--s-baris, var(--lk-lh, 1.5));'))
ok('G12 CSS: spasi butir tak bocor ke butir anak', /ProseMirror li \{ list-style: none !important; position: relative; --s-sebelum: initial; --s-sesudah: initial; --s-baris: initial;/.test(tt))
ok('G13 atribut spasi di paragraf, judul, butir', /types: \['paragraph', 'heading', 'listItem'\],\s*attributes: \{\s*spSebelum/.test(ex))
ok('G14 dialog menerapkan satu transaksi (satu langkah Undo)', /function terapkanParagraf[\s\S]*?const tr = ed\.state\.tr;[\s\S]*?if \(tr\.docChanged\) ed\.view\.dispatch\(tr\);/.test(tt) && !/onTerapkan=\{h => \{[^}]*terapkanInden/.test(tt))
ok('G15 dialog menerima & mengirim spasi', pm.includes('spasi: jepitSpasi(drafSpasi)') && tt.includes('perataan={perataanKini} spasi={spasiKini}'))
ok('G16 hanya bidang yang diubah mengenai paragraf terpilih', tt.includes('bidangBerubah(spasiKini, h.spasi)') && tt.includes('...(adaSpasi ? {'))
ok('G17 kuas: state di luar komponen, dipakai bersama blok', /^let kuasKini/m.test(tt) && tt.includes('useSyncExternalStore(dengarKuas'))
ok('G18 kuas: klik sekali pakai, klik dua kali berulang, Esc batal', tt.includes('onDoubleClick={() => ambilKuas(true)}') && tt.includes('if (!k.tetap) aturKuas(null);') && /e\.key === 'Escape'\) aturKuas\(null\)/.test(tt))
ok('G19 kuas dipasang di bidang teks, tombol kiri saja', tt.includes('onMouseUp={readOnly ? undefined : sapuKuas}') && tt.includes('e.button !== 0'))
ok('G20 kuas ada di bilah alat & menu', tt.includes('aria-label="Kuas format"') && tt.includes("label: 'Kuas format'"))
ok('G21 tak ada title= bawaan pada tombol baru', !/<button[^>]*title=/.test(tt))
ok('G22 impor & tempel memakai penyusun yang sama', kode('lib/lkjip/impor-word.ts').includes('susunNarasi(') && kode('lib/lkjip/tempel-word.ts').includes('susunNarasi('))
ok('G22b CSS: gantung 1.1. selebar tingkatnya di bawah daftar apa pun', cssGayaDaftar('.x').includes(':is(ol, ul) ol[data-gaya="1.1."] > li { --lk-gantung: 520; }'))
ok('G23 hitungan nomor editor tak perlu berubah: tab bukan butir', !/tabNarasi|data-tab/.test(kode('lib/lkjip/lanjut-daftar.ts')))

console.log(gagal.length ? `\nGAGAL — ${lulus} lulus, ${gagal.length} gagal` : `\n${lulus} lulus, 0 gagal`)
if (gagal.length) process.exit(1)
