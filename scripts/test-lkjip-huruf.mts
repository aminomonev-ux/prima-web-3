// Regresi huruf per kata + daftar huruf LKJIP (konsep docs/CONCEPT-lkjip-pratinjau-dan-word.md §3).
// npx tsx scripts/test-lkjip-huruf.mts [berkas.docx …] — bagian G memakai LibreOffice sungguhan (tidak ada = GAGAL);
// berkas .docx yang diberikan hanya dilaporkan (kalibrasi impor), tidak dinilai.
//
// A: daftar & aturan murni   B: penyaring   C: Word (narasiToXml + dokumen utuh)   D: editor (skema sungguhan)
// E: tempel                  F: impor Word  G: PDF LibreOffice                    H: sambungan layar
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import type { Node as PMNode } from '@tiptap/pm/model'
import { FONT_CHOICES, HURUF_DOKUMEN_BAWAAN, hurufDariGaya, hurufSah, saringHurufTempel } from '../lib/lkjip/style-constants'
import { DEFAULT_STYLE, StyleConfigSchema, sanitizeNarasiHtml, type StyleConfig } from '../lib/lkjip/schemas'
import { narasiToXml, rakitDocx } from '../lib/lkjip/docgen'
import { buildNumberedTree, type BlockNode, type SectionFlat } from '../lib/lkjip/numbering'
import { bacaDocxLkjip, type BagianImpor } from '../lib/lkjip/impor-word'
import { tempelDariWord } from '../lib/lkjip/tempel-word'
import { ambilFormat, hapusFormat, terapkanFormat, type Perintah } from '../lib/lkjip/perintah-narasi'
import { TextStyle } from '../lib/lkjip/ekstensi-narasi'
import { cariLibreOffice, hurufTerpasang, ubahKePdf } from '../lib/lkjip/pdf'

// tsx memuat berkas .ts proyek sebagai CJS: Tiptap & ProseMirror di sini WAJIB ikut CJS (lihat test-lkjip-daftar-word).
const muat = createRequire(import.meta.url)
const { getSchema } = muat('@tiptap/core') as typeof import('@tiptap/core')
const StarterKit = (muat('@tiptap/starter-kit') as { default: typeof import('@tiptap/starter-kit').default }).default
const { EditorState, TextSelection } = muat('@tiptap/pm/state') as typeof import('@tiptap/pm/state')
type EditorState = import('@tiptap/pm/state').EditorState

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket.slice(0, 500) : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const rf = (f: string) => `<w:rFonts w:ascii="${f}" w:hAnsi="${f}"/>`

// ─── A. Daftar & aturan murni ───
console.log('A. Daftar & aturan murni')
const TUJUH = ['Tahoma', 'Verdana', 'Segoe UI', 'Georgia', 'Garamond', 'Century Gothic', 'Book Antiqua']
ok('A1 daftar = 5 lama + 7 baru (D6), tanpa kembar', FONT_CHOICES.length === 12 && TUJUH.every(f => (FONT_CHOICES as readonly string[]).includes(f)) && new Set(FONT_CHOICES).size === 12)
ok('A2 bawaan dokumen tetap Arial', HURUF_DOKUMEN_BAWAAN === 'Arial' && DEFAULT_STYLE.fontFamily === 'Arial')
ok('A3 nama dikenali tanpa memandang besar/kecil, kutip, spasi ganda', hurufSah('book  antiqua') === 'Book Antiqua' && hurufSah('"Segoe UI"') === 'Segoe UI' && hurufSah("'georgia'") === 'Georgia' && hurufSah('&quot;Tahoma&quot;') === 'Tahoma')
ok('A4 nama di luar daftar ditolak', hurufSah('Comic Sans MS') === null && hurufSah('Aptos') === null && hurufSah('') === null && hurufSah(null) === null && hurufSah('Arial Black') === null)
ok('A5 gaya: hanya keluarga PERTAMA dinilai', hurufDariGaya('font-family: "Book Antiqua", serif') === 'Book Antiqua' && hurufDariGaya('font-family: Aptos, Arial') === null)
ok('A6 gaya: mso-*-font-family bukan font-family', hurufDariGaya('mso-fareast-font-family: Georgia') === null && hurufDariGaya('mso-bidi-font-family:Tahoma;font-family:Verdana') === 'Verdana')
ok('A7 gaya: sisipan CSS tidak lolos', hurufDariGaya('font-family: Georgia" onmouseover="x') === null && hurufDariGaya('font-family: Georgia;background:url(x)') === 'Georgia')
ok('A8 Pengaturan Dokumen menerima 7 huruf baru, menolak di luar daftar', TUJUH.every(f => StyleConfigSchema.safeParse({ fontFamily: f }).success) && !StyleConfigSchema.safeParse({ fontFamily: 'Comic Sans MS' }).success)

// ─── B. Penyaring ───
console.log('\nB. Penyaring narasi')
const s1 = sanitizeNarasiHtml('<p><span style="font-family: &quot;Book Antiqua&quot;, serif">x</span></p>')
ok('B1 huruf di daftar dibentuk ulang dari daftar', s1 === '<p><span style="font-family:Book Antiqua">x</span></p>', s1)
const s2 = sanitizeNarasiHtml('<p><span style="font-family: Wingdings">x</span></p>')
ok('B2 huruf di luar daftar dibuang', s2 === '<p><span>x</span></p>', s2)
const s3 = sanitizeNarasiHtml('<p><span style="color: #ff0000; font-size: 14pt; font-family: georgia">x</span></p>')
ok('B3 bersama warna & ukuran', s3 === '<p><span style="color:#ff0000;font-size:14pt;font-family:Georgia">x</span></p>', s3)
const s4 = sanitizeNarasiHtml('<p><span style="font-family: Georgia;background:url(javascript:x)" onclick="y">x</span></p>')
ok('B4 CSS & atribut lain tidak ikut', s4 === '<p><span style="font-family:Georgia">x</span></p>', s4)
const s5 = sanitizeNarasiHtml('<p><span style="font-family: Georgia&quot; onmouseover=&quot;x">x</span></p>')
ok('B5 nama yang dipakai menyisipkan atribut ditolak', s5 === '<p><span>x</span></p>', s5)
const s6 = sanitizeNarasiHtml('<p><span data-angka="a1" style="font-family:Georgia">Rp 1</span></p>')
ok('B6 angka tertaut tetap tanpa gaya (aturan lama)', s6 === '<p><span data-angka="a1">Rp 1</span></p>', s6)
ok('B7 berulang: hasil penyaring stabil', sanitizeNarasiHtml(s3) === s3)

// ─── C. Word ───
console.log('\nC. Word')
const x1 = narasiToXml('<p>awal <span style="font-family:Georgia">tengah</span> akhir</p>', 'Arial', 24)
ok('C1 run di span memakai huruf span, di luar memakai huruf dokumen', x1.includes(`${rf('Georgia')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">tengah`) && x1.includes(`${rf('Arial')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve"> akhir`) && x1.includes(`${rf('Arial')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">awal `), x1)
const x2 = narasiToXml('<p><span style="font-family:Tahoma">A<span style="color:#ff0000">B</span>C</span>D</p>', 'Arial', 24)
ok('C2 bersarang: warna di dalam huruf → keduanya', /Tahoma[^]*?<w:color w:val="FF0000"\/>[^<]*<w:sz w:val="24"\/><\/w:rPr><w:t xml:space="preserve">B</i.test(x2) && x2.includes(`${rf('Tahoma')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">C`) && x2.includes(`${rf('Arial')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">D`), x2)
const x3 = narasiToXml('<p><span style="color:#00ff00">A<span style="font-family:Verdana">B</span>C</span></p>', 'Arial', 24)
ok('C3 huruf di dalam warna: penutup memulihkan huruf induk, warna tetap', x3.includes(`${rf('Verdana')}<w:color`) && /Arial[^>]*\/><w:color w:val="00FF00"\/><w:sz w:val="24"\/><\/w:rPr><w:t xml:space="preserve">C/i.test(x3), x3)
const x4 = narasiToXml('<p><span style="font-family:Garamond"><strong>Tebal</strong></span></p>', 'Arial', 24)
ok('C4 tebal di dalam huruf: urutan rPr rFonts → b', x4.includes(`${rf('Garamond')}<w:b/>`), x4)
const x5 = narasiToXml('<p><span style="font-family:Comic Sans MS">x</span></p>', 'Arial', 24)
ok('C5 nama di luar daftar (lolos penyaring lama) ikut huruf dokumen', x5.includes(rf('Arial')) && !x5.includes('Comic'), x5)
const x6 = narasiToXml('<ol><li><span style="font-family:Segoe UI">butir</span></li></ol><p>sesudah</p>', 'Cambria', 24)
ok('C6 di butir daftar & sesudahnya kembali ke huruf dokumen', x6.includes(`${rf('Segoe UI')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">butir`) && x6.includes(`${rf('Cambria')}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">sesudah`), x6)

const gaya = (s: Partial<StyleConfig>): StyleConfig => ({ ...DEFAULT_STYLE, ...s })
const sec: SectionFlat[] = [{ id: 1, parent_id: null, depth: 0, urutan: 0, judul: 'PENDAHULUAN', locked: 1 }]
const htmlSemua = `<p>Huruf dokumen.</p>${FONT_CHOICES.map(f => `<p><span style="font-family:${f}">Contoh ${f} 0123</span></p>`).join('')}`
const blk = new Map<number, BlockNode[]>([[1, [
  { id: 11, tipe: 'NARASI', urutan: 0, payload: { html: htmlSemua } },
  { id: 12, tipe: 'TABEL', urutan: 1, payload: { judul: 'Tabel', kolom: ['A'], headerRows: 1, rows: [[{ v: 'A' }], [{ v: 'isi' }]] } },
]]] as Array<[number, BlockNode[]]>)
const docx = (await rakitDocx({ tree: buildNumberedTree(sec, blk), judul: 'Uji Huruf', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: gaya({ fontFamily: 'Bookman Old Style' }) })).buffer
const docXml = new PizZip(docx).file('word/document.xml')!.asText()
ok('C7 dokumen utuh: tiap huruf di daftar tertulis di run-nya', FONT_CHOICES.every(f => docXml.includes(`${rf(f)}<w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">Contoh ${f} 0123`)), FONT_CHOICES.filter(f => !docXml.includes(`Contoh ${f} 0123`)).join())
const selTabel = /<w:tc>[\s\S]*?isi<\/w:t>/.exec(docXml)?.[0] ?? ''
ok('C8 tabel tetap memakai huruf dokumen (§3.2)', selTabel.includes(rf('Bookman Old Style')) && !/Georgia|Tahoma/.test(selTabel), selTabel.slice(-300))
ok('C9 judul bab memakai huruf dokumen', /PENDAHULUAN/.test(docXml) && new PizZip(docx).file('word/styles.xml')!.asText().includes(rf('Bookman Old Style')))

// ─── D. Editor (skema ProseMirror sungguhan) ───
console.log('\nD. Editor')
const attrs = (TextStyle.config.addAttributes as unknown as () => Record<string, { parseHTML: (el: unknown) => unknown; renderHTML: (a: Record<string, unknown>) => unknown }>).call({ name: 'textStyle', options: {}, parent: undefined })
const el = (style: Record<string, string>) => ({ style: { color: '', fontSize: '', fontFamily: '', ...style } })
ok('D1 baca: nama peramban ("Book Antiqua", serif) → nama di daftar', attrs.fontFamily.parseHTML(el({ fontFamily: '"Book Antiqua", serif' })) === 'Book Antiqua')
ok('D2 baca: nama di luar daftar → kosong', attrs.fontFamily.parseHTML(el({ fontFamily: 'Inter, sans-serif' })) === null)
ok('D3 tulis: font-family dari nilai', JSON.stringify(attrs.fontFamily.renderHTML({ fontFamily: 'Segoe UI' })) === '{"style":"font-family: Segoe UI"}' && JSON.stringify(attrs.fontFamily.renderHTML({ fontFamily: null })) === '{}')
const aturan = (TextStyle.config.parseHTML as unknown as () => { getAttrs: (e: unknown) => unknown }[]).call({ name: 'textStyle', options: {}, parent: undefined })[0]
ok('D4 span ber-huruf saja dikenali sebagai gaya teks', aturan.getAttrs(el({ fontFamily: 'Georgia' })) !== false)
ok('D5 span ber-huruf asing saja tidak dikenali', aturan.getAttrs(el({ fontFamily: 'Inter' })) === false && aturan.getAttrs(el({})) === false)

const schema = getSchema([StarterKit.configure({ link: false, trailingNode: false }), TextStyle])
type JS = Record<string, unknown>
const gt = (a: JS) => ({ type: 'textStyle', attrs: { color: null, fontSize: null, fontFamily: null, ...a } })
const dok = (...p: JS[]) => schema.nodeFromJSON({ type: 'doc', content: p })
const P = (...isi: JS[]): JS => ({ type: 'paragraph', content: isi })
const T = (t: string, ...marks: JS[]): JS => ({ type: 'text', text: t, ...(marks.length ? { marks } : {}) })
const posTeks = (d: PMNode, t: string) => { let h = -1; d.descendants((n, p) => { if (h < 0 && n.isText && n.text!.includes(t)) h = p + n.text!.indexOf(t) }); return h }
const pilih = (d: PMNode, t: string) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, t), posTeks(d, t) + t.length) })
const jalan = (s: EditorState, p: Perintah) => { let hasil = s; p(s, tr => { hasil = hasil.apply(tr) }); return hasil }
const markDi = (d: PMNode, t: string) => { let m: readonly import('@tiptap/pm/model').Mark[] = []; d.descendants(n => { if (n.isText && n.text === t) m = n.marks }); return m }
const dKuas = dok(P(T('Sumber', gt({ fontFamily: 'Georgia', color: '#ff0000' })), T(' ')), P(T('Tujuan')))
const fk = ambilFormat(pilih(dKuas, 'Sumber'))
const sesudahKuas = jalan(pilih(dKuas, 'Tujuan'), terapkanFormat(fk)).doc
ok('D6 Kuas format membawa huruf', markDi(sesudahKuas, 'Tujuan').find(m => m.type.name === 'textStyle')?.attrs.fontFamily === 'Georgia')
const sesudahHapus = jalan(pilih(dKuas, 'Sumber'), hapusFormat).doc
ok('D7 Hapus format membuang huruf', markDi(sesudahHapus, 'Sumber').length === 0)
const html = sanitizeNarasiHtml(`<p><span style="font-family: Georgia; color: #ff0000">Sumber</span></p>`)
ok('D8 bolak-balik: simpanan → penyaring tetap bisa dibaca editor', hurufDariGaya(html) === 'Georgia')

// ─── E. Tempel ───
console.log('\nE. Tempel')
const t1 = saringHurufTempel(`<p><span style='font-family:"Georgia",serif;mso-fareast-font-family:"Times New Roman"'>a</span></p>`, 'Arial')
ok('E1 huruf di daftar ≠ huruf dokumen dipertahankan, dibentuk ulang', hurufDariGaya(t1) === 'Georgia' && t1.includes('font-family:Georgia;') && t1.includes('mso-fareast-font-family'), t1)
const t2 = saringHurufTempel(`<p><span style="font-family:&quot;Arial&quot;,sans-serif;color:red">a</span></p>`, 'Arial')
ok('E2 sama dengan huruf dokumen: dibuang, gaya lain tetap', !/(?<![-a-z])font-family/i.test(t2) && t2.includes('color:red'), t2)
const t3 = saringHurufTempel(`<p><span style="font-family:Aptos,sans-serif">a</span></p>`, 'Arial')
ok('E3 huruf di luar daftar dibuang (teks ikut huruf dokumen)', !t3.includes('Aptos') && !/(?<![-a-z])font-family/i.test(t3), t3)
const t4 = saringHurufTempel(`<p><span style='font-family:"Book Antiqua"'>a</span></p>`, 'book antiqua')
ok('E4 huruf dokumen dibandingkan lewat nama di daftar', !t4.includes('Antiqua'), t4)
const t5 = saringHurufTempel(`<span style="font-family:Georgia&quot; onclick=&quot;x">a</span>`, 'Arial')
ok('E5 sisipan atribut tidak lolos', !t5.includes('onclick') && !t5.includes('Georgia'), t5)
const t6 = saringHurufTempel(`<span style="font-family:Georgia;mso-fareast-font-family:&quot;Times New Roman&quot;">a</span>`, 'Arial')
ok('E7 kutip ganda di dalam atribut berkutip ganda tetap ter-encode (atribut tidak patah)', t6 === '<span style="font-family:Georgia;mso-fareast-font-family:&quot;Times New Roman&quot;">a</span>', t6)
const klip = readFileSync('scripts/fixtures/lkjip-papan-klip/word-daftar.html', 'utf8')
const tk = saringHurufTempel(tempelDariWord(klip), 'Arial')
const sisaGaya = [...tk.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(m => m[1] ?? m[2]).filter(s => /(?<![-a-zA-Z])font-family/i.test(s))
ok('E6 papan klip Word asli (Aptos): tak satu pun font-family tersisa di atribut', sisaGaya.length === 0, sisaGaya.slice(0, 3).join(' | '))

// ─── F. Impor Word ───
console.log('\nF. Impor Word')
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const PANJANG = 'Kalimat isi yang cukup panjang supaya paragraf ini menjadi patokan huruf berkas. '.repeat(3)
const run = (t: string, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`
const par = (isi: string, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${isi}</w:p>`
const berkas = (badan: string, o: { dok?: string; gaya?: string; tema?: { minor: string; major: string } } = {}): Buffer => {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${par(run('BAB I PENDAHULUAN'), '<w:pStyle w:val="H1"/>')}${badan}<w:sectPr/></w:body></w:document>`)
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}>${o.dok ? `<w:docDefaults><w:rPrDefault><w:rPr>${o.dok}</w:rPr></w:rPrDefault></w:docDefaults>` : ''}<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/><w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/></w:rPr></w:style>${o.gaya ?? ''}</w:styles>`)
  if (o.tema) z.file('word/theme/theme1.xml', `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:fontScheme name="x"><a:majorFont><a:latin typeface="${o.tema.major}"/></a:majorFont><a:minorFont><a:latin typeface="${o.tema.minor}"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
const semuaHtml = (b: BagianImpor[]): string => b.flatMap(x => [...x.blok.map(k => String((k.payload as { html?: string }).html ?? '')), semuaHtml(x.anak)]).join('')
const GAYA_KAR = `<w:style w:type="character" w:styleId="Kutip"><w:name w:val="Kutip"/><w:rPr>${rf('Tahoma')}</w:rPr></w:style><w:style w:type="character" w:styleId="KutipAnak"><w:name w:val="Kutip Anak"/><w:basedOn w:val="Kutip"/></w:style>`
const f1 = bacaDocxLkjip(berkas(
  par(run(PANJANG)) + par(run('awal ') + run('miring', rf('Georgia')) + run(' gaya', '<w:rStyle w:val="KutipAnak"/>') + run(' asing', rf('Aptos')) + run(' sama', rf('Book Antiqua'))),
  { dok: '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>', gaya: GAYA_KAR, tema: { minor: 'Book Antiqua', major: 'Georgia' } },
))
const h1 = semuaHtml(f1.bagian)
ok('F1 huruf tema docDefaults (minorHAnsi) yang paling lazim → huruf dokumen', f1.hurufBawaan === 'Book Antiqua', String(f1.hurufBawaan))
ok('F2 run berhuruf lain di daftar → span', h1.includes('<span style="font-family:Georgia">miring</span>'), h1.slice(-300))
ok('F3 gaya karakter (lewat basedOn) terbaca', h1.includes('<span style="font-family:Tahoma"> gaya</span>') || h1.includes('<span style="font-family:Tahoma">gaya</span>'), h1.slice(-300))
ok('F4 huruf di luar daftar & huruf dokumen tanpa span', !h1.includes('Aptos') && !h1.includes('font-family:Book Antiqua'), h1.slice(-300))
ok('F5 hasilnya lolos penyaring tanpa berubah', sanitizeNarasiHtml(h1) === h1)
const f2 = bacaDocxLkjip(berkas(par(run(PANJANG, rf('Aptos'))) + par(run('lain', rf('Georgia')))))
ok('F6 huruf paling lazim di luar daftar: dokumen ikut bawaan + peringatan', f2.hurufBawaan === null && f2.peringatan.some(p => p.includes('"Aptos"') && p.includes(HURUF_DOKUMEN_BAWAAN)), JSON.stringify(f2.peringatan))
ok('F7 …dan run di daftar yang bukan bawaan tetap ber-span', semuaHtml(f2.bagian).includes('<span style="font-family:Georgia">lain</span>'))
const f3 = bacaDocxLkjip(berkas(par(run(PANJANG))))
ok('F8 tanpa rFonts sama sekali = Times New Roman (bawaan Word)', f3.hurufBawaan === 'Times New Roman', String(f3.hurufBawaan))
const f4 = bacaDocxLkjip(berkas(par(run(PANJANG), '<w:pStyle w:val="Isi"/>'), { gaya: `<w:style w:type="paragraph" w:styleId="Dasar"><w:name w:val="Dasar"/><w:rPr>${rf('Verdana')}</w:rPr></w:style><w:style w:type="paragraph" w:styleId="Isi"><w:name w:val="Isi"/><w:basedOn w:val="Dasar"/></w:style>`, dok: rf('Arial') }))
ok('F9 gaya paragraf (lewat basedOn) menang atas docDefaults', f4.hurufBawaan === 'Verdana', String(f4.hurufBawaan))
const f5 = bacaDocxLkjip(berkas(par(run('Judul kecil di isi berhuruf judul', '<w:rFonts w:asciiTheme="majorHAnsi"/>')) + par(run(PANJANG)), { tema: { minor: 'Calibri', major: 'Cambria' }, dok: '<w:rFonts w:asciiTheme="minorHAnsi"/>' }))
ok('F10 rujukan tema major di run → huruf judul tema', f5.hurufBawaan === 'Calibri' && semuaHtml(f5.bagian).includes('<span style="font-family:Cambria">'), semuaHtml(f5.bagian).slice(0, 200))
const rute = kode('app/api/lkjip/impor/route.ts')
ok('F11 route memakai huruf hasil impor sebagai huruf dokumen', rute.includes('fontFamily: hasil.hurufBawaan ?? DEFAULT_STYLE.fontFamily'))

// ─── G. PDF LibreOffice ───
console.log('\nG. PDF LibreOffice')
const lo = cariLibreOffice()
ok('G0 LibreOffice terpasang', !!lo)
if (lo) {
  const pdf = await ubahKePdf(docx, { lokasi: lo, judul: 'Uji Huruf' })
  const hilang = FONT_CHOICES.filter(f => !hurufTerpasang(pdf, f))
  ok('G1 PDF memuat ke-12 huruf daftar (terpasang di mesin ini)', hilang.length === 0, `tidak tertanam: ${hilang.join(', ')}`)
}

// ─── H. Sambungan layar ───
console.log('\nH. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
ok('H1 TextStyle dari lib (satu definisi yang diuji)', tt.includes("TextStyle } from '@/lib/lkjip/ekstensi-narasi'") && !/Mark\.create\(\{\s*name: 'textStyle'/.test(tt))
ok('H2 pemilih huruf dari FONT_CHOICES + pilihan huruf dokumen', /FONT_CHOICES\.map\(f => <option key=\{f\} value=\{f\}/.test(tt) && tt.includes('<option value="">Huruf dokumen ({hurufDokumen})</option>'))
ok('H3 ukuran "Bawaan" hanya melepas ukuran, huruf tetap', /if \(pt === 'reset'\) lepasGayaTeks\('fontSize'\)/.test(tt) && /k !== kunci && v != null/.test(tt))
ok('H4 tempelan lewat saringan huruf memakai huruf dokumen terkini', tt.includes('saringHurufTempel(tempelDariWord(html), hurufDokRef.current)') && /useEffect\(\(\) => \{ hurufDokRef\.current = hurufDokumen; \}, \[hurufDokumen\]\)/.test(tt))
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
ok('H5 Pengaturan Dokumen memakai daftar yang sama', ed.includes('FONT_CHOICES.map(f => <option key={f} value={f}>{f}</option>)'))

// ─── Kalibrasi berkas sungguhan (dilaporkan, tidak dinilai) ───
for (const f of process.argv.slice(2)) {
  const h = bacaDocxLkjip(readFileSync(f))
  const hit = new Map<string, number>()
  for (const m of semuaHtml(h.bagian).concat(h.kataPengantar.html).matchAll(/font-family:([^"]+)"/g)) hit.set(m[1], (hit.get(m[1]) ?? 0) + 1)
  console.log(`\n  kalibrasi ${f.split(/[\\/]/).pop()}: huruf dokumen = ${h.hurufBawaan ?? `(bawaan ${HURUF_DOKUMEN_BAWAAN})`}, span = ${JSON.stringify([...hit])}, peringatan = ${JSON.stringify(h.peringatan.filter(p => /Huruf/.test(p)))}`)
}

console.log(`\n${gagal.length ? 'GAGAL — ' : 'LULUS — '}${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) process.exit(1)
