// scripts/test-lkjip-daftar-word.mts — daftar ala Word, klik kanan, format teks (konsep CONCEPT-lkjip-daftar-word.md).
//
// A: tabel gaya (gaya-daftar.ts)        E: perintah editor dgn skema ProseMirror sungguhan
// B: penyaring HTML                     F: ubah huruf
// C: berkas Word                        G: impor Word
// D: hitungan nomor vs berkas Word      H: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-daftar-word.mts

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  GAYA_BULLET, GAYA_NOMOR, SUSUNAN, adalahBullet, bacaSusunan, cssGayaDaftar, gantungDxa, gayaBerikut, gayaDariTagDaftar, gayaDariWord, gayaSah,
  lvlTextWord, susunanPenuh, tagDaftar, teksNomor, tulisSusunan, xmlTingkatWord, type KodeGaya,
} from '../lib/lkjip/gaya-daftar'
import { STABILO, konteksSebelum, modeBerikut, ptDariCss, rentangKata, stabiloDariWord, szDariGaya, ubahSegmen } from '../lib/lkjip/format-teks'
import {
  akarBlokDari, aturGayaTingkat, aturLanjut, aturNomorAwal, aturSusunan, bungkusDaftar, gayaNode, hapusFormat, indeksAkar, kodeSusunanDari, mulaiUlangDariSatu,
  naikTingkat, nomorTerkunciDesimal, posisiDaftar, susunanPohon, turunTingkat, ubahHuruf, type Perintah,
} from '../lib/lkjip/perintah-narasi'
import { GayaDaftar, POLA_KETIK, Stabilo, Subskrip, Superskrip, gayaKetikan } from '../lib/lkjip/ekstensi-narasi'
import { lanjutanDaftar, mulaiDaftarBlok } from '../lib/lkjip/lanjut-daftar'
import { TabelPayloadSchema, sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { buildNumberedTree, type BlockNode, type SectionFlat, type SectionNode } from '../lib/lkjip/numbering'
import { DEFAULT_STYLE } from '../lib/lkjip/schemas'
import { narasiToXml, rakitDocx } from '../lib/lkjip/docgen'
import { bacaAtur } from '../lib/lkjip/tabel'
import { bacaDocxLkjip } from '../lib/lkjip/impor-word'
import { indenBawaan, xmlInden } from '../lib/lkjip/halaman'

// tsx memuat berkas .ts proyek sebagai CJS. Tiptap & ProseMirror di sini WAJIB ikut CJS: dua salinan
// prosemirror-model (ESM + CJS) saling menolak simpulnya ("multiple versions were loaded").
const muat = createRequire(import.meta.url)
const { Extension, getSchema } = muat('@tiptap/core') as typeof import('@tiptap/core')
const StarterKit = (muat('@tiptap/starter-kit') as { default: typeof import('@tiptap/starter-kit').default }).default
const { EditorState, TextSelection } = muat('@tiptap/pm/state') as typeof import('@tiptap/pm/state')
type EditorState = import('@tiptap/pm/state').EditorState

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

// ─── A. Tabel gaya ────────────────────────────────────────────────────────────
console.log('A. Tabel gaya')
ok('A1 16 format nomor + 7 bullet, semuanya sah', GAYA_NOMOR.length === 16 && GAYA_BULLET.length === 7 && [...GAYA_NOMOR, ...GAYA_BULLET].every(gayaSah) && !gayaSah('x') && !gayaSah('<script>'))
const harapNomor: [KodeGaya, number, string][] = [['1.', 3, '3.'], ['1)', 3, '3)'], ['(1)', 3, '(3)'], ['a.', 3, 'c.'], ['a)', 3, 'c)'], ['(a)', 3, '(c)'], ['A.', 3, 'C.'], ['A)', 2, 'B)'], ['(A)', 2, '(B)'], ['I.', 4, 'IV.'], ['I)', 9, 'IX)'], ['(I)', 14, '(XIV)'], ['i.', 4, 'iv.'], ['i)', 8, 'viii)'], ['(i)', 40, '(xl)'], ['a.', 27, 'aa.'], ['a.', 28, 'bb.'], ['•', 5, '•']]
ok('A2 teks nomor tiap format (termasuk romawi & lewat 26 cara Word)', harapNomor.every(([k, n, t]) => teksNomor(k, n) === t), harapNomor.filter(([k, n, t]) => teksNomor(k, n) !== t).join(' | '))
ok('A3 1.1. membawa nomor induknya', teksNomor('1.1.', 2, [3]) === '3.2.' && teksNomor('1.1.', 1, [1, 2]) === '1.2.1.' && teksNomor('1.1.', 4) === '4.')
ok('A4 lvlText tingkat: placeholder ikut ilvl', lvlTextWord('1.', 0) === '%1.' && lvlTextWord('a)', 2) === '%3)' && lvlTextWord('(i)', 1) === '(%2)' && lvlTextWord('1.1.', 2) === '%1.%2.%3.' && lvlTextWord('○', 1) === '○')
ok('A5 susunan bawaan = keputusan pemilik: 1. a. 1) a) (1) (a)', SUSUNAN.naskah.slice(0, 6).join(' ') === '1. a. 1) a) (1) (a)')
ok('A6 bawaan Word tetap tersedia: 1. a. i.', SUSUNAN.word.slice(0, 3).join(' ') === '1. a. i.')
const rantai = (k: KodeGaya, n: number) => { const r = [k]; for (let i = 1; i < n; i++) r.push(gayaBerikut(r[i - 1])); return r.join(' ') }
ok('A7 turunan tingkat berikutnya mengikuti susunan bawaan & berputar untuk bullet', rantai('1.', 6) === '1. a. 1) a) (1) (a)' && rantai('•', 4) === '• ○ ▪ •' && gayaBerikut('1.1.') === '1.1.' && gayaBerikut('I.') === 'A.', rantai('1.', 6))
ok('A8 susunanPenuh: selalu 9 tingkat, yang kosong diturunkan', susunanPenuh(['a.']).length === 9 && susunanPenuh(['a.'])[1] === '1)' && susunanPenuh(['1.', '1.'])[1] === '1.' && susunanPenuh(['•'])[1] === '○')
ok('A9 baca susunan: tak sah = null, bukan dibaca sebagian', bacaSusunan('1.|a.')?.length === 9 && bacaSusunan('1.|jahat') === null && bacaSusunan('') === null && bacaSusunan(null) === null && bacaSusunan(Array(10).fill('1.').join('|')) === null)
ok('A10 tulis ⇄ baca susunan', bacaSusunan(tulisSusunan(SUSUNAN.romawi))?.join() === SUSUNAN.romawi.join())
ok('A11 gaya dari tag: data-gaya, bentuk lama type="a", gaya salah tag diabaikan',
  gayaDariTagDaftar('<ol data-gaya="(1)">') === '(1)' && gayaDariTagDaftar('<ol type="a">') === 'a.' && gayaDariTagDaftar('<ol style="list-style-type: lower-alpha">') === 'a.'
  && gayaDariTagDaftar('<ol>') === '1.' && gayaDariTagDaftar('<ul>') === '•' && gayaDariTagDaftar('<ul data-gaya="○">') === '○'
  && gayaDariTagDaftar('<ul data-gaya="1.">') === '•' && gayaDariTagDaftar('<ol data-gaya="○">') === '1.' && gayaDariTagDaftar('<ol data-gaya="jahat">') === '1.'
  && gayaDariTagDaftar('<ol type="a" data-gaya="I.">') === 'I.' && gayaDariTagDaftar('<ol data-type="a">') === '1.')
ok('A12 tag tersimpan: bentuk lama tidak berubah bunyi', tagDaftar('1.') === '<ol>' && tagDaftar('a.', { start: 3 }) === '<ol type="a" start="3">' && tagDaftar('•') === '<ul>' && tagDaftar('○') === '<ul data-gaya="○">'
  && tagDaftar('(1)', { start: 2, lanjut: true }) === '<ol start="2" data-gaya="(1)" data-lanjut="1">' && tagDaftar('1.', { start: 1 }) === '<ol>', tagDaftar('(1)', { start: 2, lanjut: true }))
ok('A13 gantung mengikuti lebar nomor', gantungDxa('1.') === 360 && gantungDxa('I.') === 540 && gantungDxa('(1)') === 480 && gantungDxa('1.1.', 1) === 360 && gantungDxa('1.1.', 3) === 680 && gantungDxa('•') === 360)
const lvA = xmlTingkatWord('(1)', 1)
ok('A14 tingkat Word: kiri per tingkat, gantung gaya, tanpa font khusus', lvA.includes('w:ilvl="1"') && lvA.includes('<w:numFmt w:val="decimal"/>') && lvA.includes('w:lvlText w:val="(%2)"') && lvA.includes('w:left="1440" w:hanging="480"') && !lvA.includes('rFonts'), lvA)
ok('A15 bullet tak umum memakai huruf simbol; • dan – tidak', xmlTingkatWord('○', 0).includes('Segoe UI Symbol') && xmlTingkatWord('➢', 0).includes('<w:numFmt w:val="bullet"/>') && !xmlTingkatWord('•', 0).includes('rFonts') && !xmlTingkatWord('–', 0).includes('rFonts'))
ok('A16 1.1. ber-isLgl sesudah numFmt (urutan CT_Lvl)', /<w:numFmt w:val="decimal"\/><w:isLgl\/><w:lvlText/.test(xmlTingkatWord('1.1.', 1)) && !xmlTingkatWord('1.', 1).includes('isLgl'))
const css = cssGayaDaftar('.X')
ok('A17 CSS: tiap format punya aturan isi', GAYA_NOMOR.every(k => css.includes(`.X ol[data-gaya="${k}"] > li::before`)) && GAYA_BULLET.every(k => css.includes(`.X ul[data-gaya="${k}"] > li::before { content: "${k}"; }`)))
ok('A18 CSS: bentuk nomor benar', css.includes('ol[data-gaya="(a)"] > li::before { content: "(" counter(list-item, lower-alpha) ")"; }') && css.includes('ol[data-gaya="1)"] > li::before { content: counter(list-item) ")"; }') && css.includes('ol[data-gaya="I."] > li::before { content: counter(list-item, upper-roman) "."; }') && css.includes('ol[data-gaya="1.1."] > li::before { content: counters(list-item, ".") "."; }'))
ok('A19 CSS: gantung gaya lebar & tingkat 1.1.', css.includes('ol[data-gaya="I."] > li { --lk-gantung: 540; }') && css.includes('ol[data-gaya="1.1."] ol[data-gaya="1.1."] > li { --lk-gantung: 520; }') && css.includes(`ol[data-gaya="1.1."] ol[data-gaya="1.1."] ol[data-gaya="1.1."] > li { --lk-gantung: 680; }`))
const dariWord: [string, string | null, KodeGaya | null][] = [
  ['decimal', '%1.', '1.'], ['decimal', '%2.', '1.'], ['decimal', '%1)', '1)'], ['decimal', '(%3)', '(1)'], ['lowerLetter', '%1.', 'a.'], ['lowerLetter', '%1)', 'a)'], ['upperLetter', '%1.', 'A.'],
  ['upperRoman', '%1.', 'I.'], ['lowerRoman', '%2)', 'i)'], ['decimal', '%1.%2.', '1.1.'], ['decimal', '%1.%2', '1.1.'], ['decimal', '1.%1', '1.'], ['decimal', '3.%1.', '1.'], ['decimal', 'Bab %1', '1.'], ['decimal', '%1', '1.'],
  ['decimal', null, '1.'], ['lowerLetter', null, 'a.'], ['bullet', '●', '●'], ['bullet', '•', '•'], ['bullet', '\uF0B7', '•'], ['bullet', 'o', '○'], ['bullet', '\uF0A7', '▪'], ['bullet', '\uF0D8', '➢'], ['bullet', '\uF0FC', '✓'], ['bullet', '-', '–'], ['none', '', null], ['decimalZero', '%1.', '1.'],
]
ok('A20 format Word → kode, termasuk awalan tetap yang jatuh ke bentuk terdekat', dariWord.every(([f, t, k]) => gayaDariWord(f, t) === k), dariWord.filter(([f, t, k]) => gayaDariWord(f, t) !== k).map(x => x.join('/')).join(' | '))

// ─── B. Penyaring ─────────────────────────────────────────────────────────────
console.log('\nB. Penyaring')
const sn = sanitizeNarasiHtml
ok('B1 gaya sah bertahan, dibentuk ulang tanpa atribut lain', sn('<ol data-gaya="(1)" onclick="x()" class="a"><li>a</li></ol>') === '<ol data-gaya="(1)"><li>a</li></ol>', sn('<ol data-gaya="(1)" onclick="x()" class="a"><li>a</li></ol>'))
ok('B2 gaya tak dikenal dibuang, tidak di-echo', !sn('<ol data-gaya="&quot;><script>"><li>a</li></ol>').includes('script') && !sn('<ol data-gaya="&quot;><script>"><li>a</li></ol>').includes('data-gaya') && sn('<ul data-gaya="x"><li>a</li></ul>') === '<ul><li>a</li></ul>', sn('<ol data-gaya="&quot;><script>"><li>a</li></ol>'))
ok('B3 bullet bergaya & susunan & lanjut bertahan', sn('<ul data-gaya="➢"><li>a</li></ul>') === '<ul data-gaya="➢"><li>a</li></ul>' && sn('<ol data-susunan="1.|a." data-lanjut="1"><li>a</li></ol>').includes('data-lanjut="1"') && sn('<ol data-susunan="1.|a."><li>a</li></ol>').includes(`data-susunan="${tulisSusunan(susunanPenuh(['1.', 'a.']))}"`))
ok('B4 susunan rusak dibuang', sn('<ol data-susunan="1.|jahat"><li>a</li></ol>') === '<ol><li>a</li></ol>')
ok('B5 bentuk lama tidak berubah', sn('<ol type="a" start="3"><li>a</li></ol>') === '<ol type="a" start="3"><li>a</li></ol>' && sn('<ol start="1"><li>a</li></ol>') === '<ol><li>a</li></ol>')
ok('B6 keluaran Tiptap (type lama + data-gaya baru): data-gaya menang', sn('<ol type="a" data-gaya="1)" start="4"><li>a</li></ol>') === '<ol start="4" data-gaya="1)"><li>a</li></ol>', sn('<ol type="a" data-gaya="1)" start="4"><li>a</li></ol>'))
ok('B7 sup, sub, mark diizinkan; warna stabilo tertutup', sn('<p>a<sup class="x">2</sup><sub>3</sub><mark data-stabilo="hijau" onclick="x">b</mark><mark data-stabilo="jahat">c</mark></p>') === '<p>a<sup>2</sup><sub>3</sub><mark data-stabilo="hijau">b</mark><mark data-stabilo="kuning">c</mark></p>', sn('<p>a<sup class="x">2</sup><sub>3</sub><mark data-stabilo="hijau" onclick="x">b</mark><mark data-stabilo="jahat">c</mark></p>'))
ok('B8 ukuran pt bertahan & dijepit; px lama tetap', sn('<span style="font-size: 14pt">a</span>') === '<span style="font-size:14pt">a</span>' && sn('<span style="font-size: 10.5pt">a</span>') === '<span style="font-size:10.5pt">a</span>' && sn('<span style="font-size: 99pt">a</span>') === '<span style="font-size:72pt">a</span>' && sn('<span style="font-size: 16px">a</span>') === '<span style="font-size:16px">a</span>', sn('<span style="font-size: 99pt">a</span>'))

// ─── C. Berkas Word ───────────────────────────────────────────────────────────
console.log('\nC. Berkas Word')
const pohon = (blok: BlockNode[][]): SectionNode[] => {
  const sec: SectionFlat[] = blok.map((_, i) => ({ id: i + 1, parent_id: i === 0 ? null : 1, depth: i === 0 ? 0 : 1, urutan: i, judul: `Bagian ${i + 1}`, locked: 0 }))
  return buildNumberedTree(sec, new Map(blok.map((b, i) => [i + 1, b])))
}
let idBlok = 0
const blok = (html: string, continueList = false): BlockNode => ({ id: ++idBlok, tipe: 'NARASI', payload: { html, continueList }, urutan: idBlok })
const berkasWord = async (tree: SectionNode[]) => {
  const zip = new PizZip((await rakitDocx({ tree, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE } })).buffer)
  return { num: zip.file('word/numbering.xml')!.asText(), doc: zip.file('word/document.xml')!.asText() }
}
const lvlDari = (num: string) => {
  const abs = new Map<string, { fmt: string; teks: string; kiri: string; gantung: string }[]>()
  for (const a of num.matchAll(/<w:abstractNum w:abstractNumId="(\d+)">([\s\S]*?)<\/w:abstractNum>/g)) {
    abs.set(a[1], [...a[2].matchAll(/<w:numFmt w:val="(\w+)"\/>(?:<w:isLgl\/>)?<w:lvlText w:val="([^"]*)"\/><w:lvlJc w:val="left"\/><w:pPr><w:ind w:left="(\d+)" w:hanging="(\d+)"\/>/g)].map(m => ({ fmt: m[1], teks: m[2], kiri: m[3], gantung: m[4] })))
  }
  const insta = new Map<string, { abs: string; ilvl: number | null; start: number | null }>()
  for (const m of num.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="(\d+)"\/>(?:<w:lvlOverride w:ilvl="(\d)"><w:startOverride w:val="(\d+)"\/><\/w:lvlOverride>)?<\/w:num>/g)) insta.set(m[1], { abs: m[2], ilvl: m[3] ? Number(m[3]) : null, start: m[4] ? Number(m[4]) : null })
  return { abs, insta }
}
const parBernomor = (doc: string) => [...doc.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].flatMap(m => {
  const id = /<w:numId w:val="(\d+)"\/>/.exec(m[1])?.[1]
  return id ? [{ id, ilvl: Number(/<w:ilvl w:val="(\d)"\/>/.exec(m[1])?.[1] ?? 0), teks: [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join(''), xml: m[1] }] : []
})

const c1 = await berkasWord(pohon([[blok('<ol data-gaya="1."><li><p>X</p><ol data-gaya="a."><li><p>Xa</p><ol data-gaya="1)"><li><p>Xa1</p></li></ol></li></ol></li><li><p>Y</p></li></ol>')]]))
const pc1 = parBernomor(c1.doc), lc1 = lvlDari(c1.num)
ok('C1 satu pohon = satu numId, ilvl naik', new Set(pc1.map(p => p.id)).size === 1 && pc1.map(p => p.ilvl).join() === '0,1,2,0', JSON.stringify(pc1.map(p => [p.id, p.ilvl])))
const a1 = lc1.abs.get(lc1.insta.get(pc1[0].id)!.abs)!
ok('C2 abstrak mengikuti format tiap tingkat', a1[0].teks === '%1.' && a1[1].fmt === 'lowerLetter' && a1[1].teks === '%2.' && a1[2].fmt === 'decimal' && a1[2].teks === '%3)' && a1.length === 9, JSON.stringify(a1.slice(0, 3)))
const c3 = await berkasWord(pohon([[blok('<ol data-gaya="1.1."><li><p>A</p><ol data-gaya="1.1."><li><p>B</p><ol data-gaya="1.1."><li><p>C</p></li></ol></li></ol></li></ol>')]]))
const a3 = lvlDari(c3.num)
const abs3 = a3.abs.get(a3.insta.get(parBernomor(c3.doc)[0].id)!.abs)!
ok('C3 1.1.: berbagi numId, %1.%2.%3., gantung melebar', new Set(parBernomor(c3.doc).map(p => p.id)).size === 1 && abs3[2].teks === '%1.%2.%3.' && abs3[2].gantung === '680' && abs3[1].gantung === '520' && abs3[0].gantung === '360', JSON.stringify(abs3.slice(0, 3)))
const c4 = await berkasWord(pohon([[blok('<ol><li><p>A</p><ol data-gaya="a."><li><p>A1</p></li></ol><p>sisipan</p><ol data-gaya="a."><li><p>A2</p></li></ol></li></ol>')]]))
const pc4 = parBernomor(c4.doc), l4 = lvlDari(c4.num)
ok('C4 daftar kedua di butir yang sama: numId sendiri + startOverride di tingkatnya (editor mulai dari 1)', pc4[1].id === pc4[0].id && pc4[2].id !== pc4[0].id && l4.insta.get(pc4[2].id)?.ilvl === 1 && l4.insta.get(pc4[2].id)?.start === 1, JSON.stringify([...l4.insta]))
const c5 = await berkasWord(pohon([[blok('<ol><li><p>A</p><ol data-gaya="a."><li><p>a</p></li></ol></li><li><p>B</p><ol data-gaya="(1)"><li><p>b</p></li></ol></li></ol>')]]))
const pc5 = parBernomor(c5.doc), l5 = lvlDari(c5.num)
ok('C5 saudara setingkat beda gaya: yang berbeda dapat numId sendiri, abstraknya bergaya itu', pc5[1].id === pc5[0].id && pc5[3].id !== pc5[0].id && l5.abs.get(l5.insta.get(pc5[3].id)!.abs)![1].teks === '(%2)', JSON.stringify([...l5.insta]))
const c6 = await berkasWord(pohon([[blok('<ol><li><p>A</p></li></ol><p>p</p><ol><li><p>B</p></li></ol><ul><li><p>C</p></li></ul><ol type="a"><li><p>D</p></li></ol>')]]))
const l6 = lvlDari(c6.num), pc6 = parBernomor(c6.doc)
ok('C6 abstrak dasar 0/1/2 tetap (bullet, angka, huruf) & susunan sama dipakai bersama', l6.insta.get(pc6[0].id)?.abs === '1' && l6.insta.get(pc6[1].id)?.abs === '1' && pc6[0].id !== pc6[1].id && l6.insta.get(pc6[2].id)?.abs === '0' && l6.insta.get(pc6[3].id)?.abs === '2' && l6.abs.size === 3, JSON.stringify([...l6.insta]))
const c7 = await berkasWord(pohon([[blok('<ol data-gaya="1)"><li><p>A</p><ul data-gaya="○"><li><p>B</p></li></ul></li></ol>')]]))
ok('C7 bullet bersarang di nomor: satu numId, tingkat 2 bullet ber-font simbol', new Set(parBernomor(c7.doc).map(p => p.id)).size === 1 && c7.num.includes('<w:numFmt w:val="bullet"/><w:lvlText w:val="○"/>') && c7.num.includes('Segoe UI Symbol'))
const c8 = await berkasWord(pohon([[blok('<ol data-gaya="1)"><li><p>A</p></li></ol><ol><li><p>x</p></li></ol><p>sisipan</p><ol data-gaya="1)" data-lanjut="1"><li><p>B</p></li></ol><ol data-gaya="(1)" data-lanjut="1"><li><p>C</p></li></ol>')]]))
const pc8 = parBernomor(c8.doc)
ok('C8 data-lanjut menyambung gaya yang sama di tengah blok; gaya yang belum pernah ada mulai sendiri', pc8[2].id === pc8[0].id && pc8[3].id !== pc8[0].id && pc8[1].id !== pc8[0].id, JSON.stringify(pc8.map(p => p.id)))
const c9 = await berkasWord(pohon([[blok('<ol data-gaya="1)"><li><p>A</p></li></ol>'), blok('<ol data-gaya="a)"><li><p>B</p></li></ol>'), blok('<ol data-gaya="1)"><li><p>C</p></li></ol>', true), blok('<ol><li><p>D</p></li></ol>', true)]]))
const pc9 = parBernomor(c9.doc)
ok('C9 centang "Lanjut daftar" menyambung gaya yang SAMA; 1. tidak menyambung 1)', pc9[2].id === pc9[0].id && pc9[3].id !== pc9[0].id, JSON.stringify(pc9.map(p => p.id)))
const xr = narasiToXml('<p><strong>t</strong><em><s><u>u</u></s></em><sup>2</sup><sub>3</sub><mark data-stabilo="hijau">h</mark>polos<span style="font-size:14pt">pt</span><span style="font-size:16px">px</span></p>', 'Arial', 24)
ok('C10 super/subscript & stabilo jadi properti run', xr.includes('<w:vertAlign w:val="superscript"/>') && xr.includes('<w:vertAlign w:val="subscript"/>') && xr.includes('<w:highlight w:val="green"/>'), xr.slice(0, 400))
const runDari = (teks: string) => new RegExp(`<w:r><w:rPr>((?:(?!</w:rPr>).)*)</w:rPr><w:t[^>]*>${teks}</w:t>`).exec(xr)?.[1] ?? ''
ok('C11 stabilo & naik berhenti di penutupnya', !runDari('polos').includes('highlight') && !runDari('polos').includes('vertAlign'), runDari('polos'))
ok('C12 ukuran: 14 pt = sz 28, 16 px lama = sz 24', runDari('pt').includes('<w:sz w:val="28"/>') && runDari('px').includes('<w:sz w:val="24"/>'), runDari('pt'))
const xu = narasiToXml('<p><strong><em><s><u><sup><mark data-stabilo="kuning"><span style="color:#ff0000;font-size:14pt">a</span></mark></sup></u></s></em></strong></p>', 'Arial', 24)
const urut = ['w:rFonts', 'w:b/', 'w:i/', 'w:strike', 'w:color', 'w:sz', 'w:highlight', 'w:u ', 'w:vertAlign'].map(t => xu.indexOf(`<${t}`))
ok('C13 urutan properti run mengikuti CT_RPr', urut.every(i => i >= 0) && urut.every((v, i) => i === 0 || urut[i - 1] < v), JSON.stringify(urut))
const xb = narasiToXml('<ol data-gaya="(1)"><li data-ind-kiri="1000"><p>a</p></li></ol>', 'Arial', 24)
ok('C14 butir berisian tetap menulis gantung gayanya', xb.includes('<w:ind w:left="1000" w:hanging="480"/>'), xb.slice(0, 300))
ok('C15 xmlInden & indenBawaan menerima gantung', indenBawaan('butir', 0, 2, 480).pertama === -480 && indenBawaan('butir', 0, 2).kiri === 1440 && xmlInden({ kiri: 900 }, 'butir', 0, 1, 680) === '<w:ind w:left="900" w:hanging="680"/>')
const tabelUji = { judul: 'T', kolom: ['A'], rows: [[{ v: 'A', b: true }], [{ v: 'x' }]], headerRows: 1, align: ['left'], colWidths: [100] }
const xmlTabel = async (extra: Record<string, unknown>) => (await berkasWord(pohon([[{ id: ++idBlok, tipe: 'TABEL', urutan: 1, payload: { ...tabelUji, ...extra } }]]))).doc
ok('C16 kepala tabel berulang: bawaan menyala (tabel lama tanpa kunci ikut)', (await xmlTabel({})).includes('<w:tblHeader/>'))
ok('C17 Ulangi kepala dimatikan: tblHeader hilang, cantSplit tetap', !(await xmlTabel({ ulangKepala: false })).includes('<w:tblHeader/>') && (await xmlTabel({ ulangKepala: false })).includes('<w:cantSplit/>'))
const kepalaLama = { judul: 'T', kolom: ['A'], rows: [[{ v: 'x' }]], headerRows: 0, align: ['left'], colWidths: [100] }
ok('C18 tabel berkepala kolom lama ikut sakelar', !(await berkasWord(pohon([[{ id: ++idBlok, tipe: 'TABEL', urutan: 1, payload: { ...kepalaLama, ulangKepala: false } }]]))).doc.includes('<w:tblHeader/>'))
ok('C19 ulangKepala terdaftar di skema (kunci tak terdaftar dibuang Zod) & dibaca bacaAtur', TabelPayloadSchema.safeParse({ ...tabelUji, ulangKepala: false }).data?.ulangKepala === false && bacaAtur({ ...tabelUji }).ulangKepala === true && bacaAtur({ ...tabelUji, ulangKepala: false }).ulangKepala === false)

// ─── D. Hitungan nomor ────────────────────────────────────────────────────────
console.log('\nD. Hitungan nomor vs berkas Word')
const ol = (g: string, ...li: string[]) => `<ol data-gaya="${g}">${li.map(t => `<li><p>${t}</p></li>`).join('')}</ol>`
const blokD1 = blok(ol('1)', 'A', 'B')), blokD2 = blok(ol('1.', 'C')), blokD3 = blok(ol('1)', 'D'), true), blokD4 = blok(ol('1.', 'E'), true)
const lD = lanjutanDaftar(pohon([[blokD1, blokD2, blokD3, blokD4]]))
ok('D1 hitungan per gaya: 1) dan 1. terpisah', lD.get(blokD3.id)?.['1)'] === 3 && lD.get(blokD4.id)?.['1.'] === 2 && lD.get(blokD4.id)?.['1)'] === 4, JSON.stringify([...lD]))
const mid = blok(`${ol('1)', 'A', 'B')}<p>x</p><ol data-gaya="1)" data-lanjut="1"><li><p>C</p></li></ol>`), sesudah = blok(ol('1)', 'Z'), true)
ok('D2 data-lanjut di tengah blok ikut hitungan untuk blok berikutnya', lanjutanDaftar(pohon([[mid, sesudah]])).get(sesudah.id)?.['1)'] === 4)
ok('D3 mulaiDaftarBlok: sambungan di tengah blok dari daftar sebelumnya dalam blok', mulaiDaftarBlok([{ gaya: '1)', bernomor: 2 }, { gaya: '1)', lanjut: true, bernomor: 1 }, { gaya: '1)', bernomor: 1 }, { gaya: '•', bernomor: 2 }], undefined, false).join() === '1,3,1,')
ok('D4 mulaiDaftarBlok: centang hanya untuk daftar PERTAMA (bullet ikut dihitung pertama)', mulaiDaftarBlok([{ gaya: '1.', bernomor: 1 }, { gaya: '1.', bernomor: 1 }], { '1.': 5 }, true).join() === '5,1' && mulaiDaftarBlok([{ gaya: '•', bernomor: 1 }, { gaya: '1.', bernomor: 1 }], { '1.': 5 }, true).join() === ',1')
ok('D5 mulaiDaftarBlok: lanjut tanpa pendahulu memakai nomornya sendiri', mulaiDaftarBlok([{ gaya: 'a)', start: 4, lanjut: true, bernomor: 1 }], {}, false).join() === '4')

// Model nomor: per numId + ilvl, startOverride, tingkat atas memulai ulang bawahnya — dicocokkan dgn ListString Word (bagian uji Word).
function nomorDariBerkas(b: { num: string; doc: string }) {
  const { insta } = lvlDari(b.num)
  const hit = new Map<string, number[]>()
  const hasil = new Map<string, number>()
  for (const p of parBernomor(b.doc)) {
    const inst = insta.get(p.id)
    const arr = hit.get(p.id) ?? []
    const dasar = (inst?.ilvl ?? 0) === p.ilvl ? inst?.start : null
    const n = (arr[p.ilvl] ?? (dasar ?? 1) - 1) + 1
    arr[p.ilvl] = n
    arr.length = p.ilvl + 1
    hit.set(p.id, arr)
    hasil.set(p.teks, n)
  }
  return hasil
}
let benih = 20261107
const acak = () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648 }
const pilih = <T,>(a: readonly T[]) => a[Math.floor(acak() * a.length)]
const GAYA_ACAK: KodeGaya[] = ['1.', '1)', 'a.', '(a)', 'I.', '•', '○']
let bandingD = 0
const salahD: string[] = []
for (let dok = 0; dok < 200; dok++) {
  const bloks: BlockNode[] = []
  const info: { id: number; continueList: boolean; akar: { gaya: KodeGaya; start: number; lanjut: boolean; tanda: string; bernomor: number }[] }[] = []
  for (let k = 0, nb = 1 + Math.floor(acak() * 4); k < nb; k++) {
    const id = 10000 + dok * 10 + k
    const akar: typeof info[number]['akar'] = []
    let html = ''
    for (let d = 0, nd = 1 + Math.floor(acak() * 3); d < nd; d++) {
      const gaya = pilih(GAYA_ACAK)
      const start = !adalahBullet(gaya) && acak() < 0.2 ? 2 + Math.floor(acak() * 5) : 1
      const lanjut = !adalahBullet(gaya) && acak() < 0.3
      const tanda = `L${id}-${d}`
      let bernomor = 0
      const nomorPertama = acak() < 0.15 ? '' : tanda
      let isi = `<li><p>${nomorPertama}</p></li>`
      if (nomorPertama) bernomor++
      const n = Math.floor(acak() * 3)
      for (let i = 0; i < n; i++) {
        const anak = acak() < 0.3 ? `<ol data-gaya="${pilih<string>(['a.', '1)', '1.'])}"><li><p>N${id}-${d}-${i}</p></li></ol>` : ''
        isi += `<li><p>x${id}-${d}-${i}</p>${anak}</li>`
        bernomor++
      }
      if (!nomorPertama) { akar.push({ gaya, start, lanjut, tanda: `x${id}-${d}-0`, bernomor }); if (!n) akar[akar.length - 1].tanda = '' }
      else akar.push({ gaya, start, lanjut, tanda, bernomor })
      html += `${tagDaftar(gaya, { start, lanjut })}${isi}</${adalahBullet(gaya) ? 'ul' : 'ol'}>`
      if (acak() < 0.3) html += `<p>teks</p>`
    }
    const continueList = acak() < 0.5
    bloks.push({ id, tipe: 'NARASI', payload: { html, continueList }, urutan: k })
    info.push({ id, continueList, akar })
  }
  const tree = pohon([bloks])
  const lan = lanjutanDaftar(tree)
  const word = nomorDariBerkas(await berkasWord(tree))
  for (const b of info) {
    const mulai = mulaiDaftarBlok(b.akar, lan.get(b.id), b.continueList)
    b.akar.forEach((a, i) => {
      if (adalahBullet(a.gaya) || !a.tanda) return
      // Butir pertama kosong: pembanding butir kedua memakai nomor yang sama (kosong tak memakan nomor).
      const w = word.get(a.tanda)
      bandingD++
      if (w !== mulai[i]) salahD.push(`dok ${dok} ${a.tanda} (${a.gaya}): editor ${mulai[i]}, Word ${w}`)
    })
  }
}
ok(`D6 ${bandingD} daftar akar acak (gaya, start, lanjut, centang, bersarang): nomor editor = berkas Word`, salahD.length === 0 && bandingD > 300, salahD.slice(0, 4).join(' | '))

// ─── E. Perintah editor ───────────────────────────────────────────────────────
console.log('\nE. Perintah editor')
const AtribUji = Extension.create({
  name: 'atribUji',
  addGlobalAttributes: () => [{ types: ['paragraph', 'heading', 'listItem'], attributes: { textAlign: { default: null }, indKiri: { default: null }, indKanan: { default: null }, indPertama: { default: null } } }],
})
const schema = getSchema([StarterKit.configure({ link: false, trailingNode: false }), GayaDaftar, Superskrip, Subskrip, Stabilo, AtribUji])
type JS = Record<string, unknown>
const P = (t = '', marks?: JS[]): JS => ({ type: 'paragraph', ...(t ? { content: [{ type: 'text', text: t, ...(marks ? { marks } : {}) }] } : {}) })
const LI = (t: string, ...anak: JS[]): JS => ({ type: 'listItem', content: [P(t), ...anak] })
const OL = (attrs: JS | null, ...isi: JS[]): JS => ({ type: 'orderedList', ...(attrs ? { attrs } : {}), content: isi })
const UL = (attrs: JS | null, ...isi: JS[]): JS => ({ type: 'bulletList', ...(attrs ? { attrs } : {}), content: isi })
const dok = (...isi: JS[]) => schema.nodeFromJSON({ type: 'doc', content: isi })
const posTeks = (d: PMNode, t: string) => { let h = -1; d.descendants((n, p) => { if (h < 0 && n.isText && n.text!.includes(t)) h = p + n.text!.indexOf(t); }); if (h < 0) throw new Error(`teks ${t}?`); return h }
const stateDi = (d: PMNode, t: string) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, t)) })
const stateBlok = (d: PMNode, a: string, b: string) => EditorState.create({ doc: d, selection: TextSelection.create(d, posTeks(d, a), posTeks(d, b) + b.length) })
const jalan = (s: EditorState, p: Perintah) => { let hasil = s; const r = p(s, tr => { hasil = hasil.apply(tr) }); return { s: hasil, r } }
const listDari = (n: PMNode): string => {
  const isi: string[] = []
  n.forEach(b => { const anak: string[] = []; b.forEach(c => { if (c.type.name === 'orderedList' || c.type.name === 'bulletList') anak.push(listDari(c)) }); isi.push(`${b.firstChild?.textContent ?? ''}${anak.length ? ' ' + anak.join(' ') : ''}`) })
  return `${gayaNode(n)}[${isi.join(', ')}]`
}
const ringkas = (d: PMNode) => { const a: string[] = []; d.forEach(n => a.push(n.type.name === 'paragraph' ? `p:${n.textContent}` : n.type.name === 'heading' ? `h:${n.textContent}` : listDari(n))); return a.join(' ') }

const s1 = jalan(stateDi(dok(OL(null, LI('A'), LI('B'), LI('C'))), 'B'), turunTingkat)
ok('E1 Tab pertama: tingkat 2 = a., sesuai susunan bawaan', ringkas(s1.s.doc) === '1.[A a.[B], C]', ringkas(s1.s.doc))
ok('E2 susunan tersimpan di akar saja', s1.s.doc.firstChild!.attrs.susunan === tulisSusunan(SUSUNAN.naskah) && s1.s.doc.firstChild!.firstChild!.lastChild!.attrs.susunan === null, String(s1.s.doc.firstChild!.attrs.susunan))
const s2 = jalan(stateDi(s1.s.doc, 'C'), turunTingkat)
ok('E3 Tab berikutnya bergabung ke daftar tingkat 2 yang sudah ada', ringkas(s2.s.doc) === '1.[A a.[B, C]]', ringkas(s2.s.doc))
const s3 = jalan(stateDi(s2.s.doc, 'C'), turunTingkat)
ok('E4 Tab ke tingkat 3: 1)', ringkas(s3.s.doc) === '1.[A a.[B 1)[C]]]', ringkas(s3.s.doc))
const s4 = jalan(stateDi(s3.s.doc, 'B'), naikTingkat)
ok('E5 Shift+Tab: butir naik, ANAKNYA ikut turun format ke tingkat barunya (format milik tingkat)', ringkas(s4.s.doc) === '1.[A, B a.[C]]', ringkas(s4.s.doc))
const s5 = jalan(stateDi(dok(OL(null, LI('A'), LI('B'))), 'A'), turunTingkat)
ok('E6 Tab di butir pertama: tidak bisa, isi tetap', s5.r === false && ringkas(s5.s.doc) === '1.[A, B]')
const s6 = jalan(stateDi(dok(P('teks')), 'teks'), turunTingkat)
ok('E7 Tab di luar daftar: bukan urusan perintah ini', s6.r === false)
const s7 = jalan(stateDi(dok(OL({ gaya: 'I.' }, LI('A'), LI('B'))), 'B'), turunTingkat)
ok('E8 akar bukan bawaan: turunan mengikuti gaya akarnya', ringkas(s7.s.doc) === 'I.[A A.[B]]', ringkas(s7.s.doc))
const s8 = jalan(stateDi(dok(UL(null, LI('A'), LI('B'))), 'B'), turunTingkat)
ok('E9 bullet bertingkat: • ○, tipe simpul tetap bullet', ringkas(s8.s.doc) === '•[A ○[B]]' && s8.s.doc.firstChild!.firstChild!.lastChild!.type.name === 'bulletList', ringkas(s8.s.doc))
const lama = dok(OL(null, LI('A', OL(null, LI('A1'))), LI('B')))
ok('E10 pohon lama (1. di 1.): turunan membaca yang sudah dipakai, tidak mengubah format lama', susunanPohon(lama.firstChild!)[1] === '1.' && ringkas(jalan(stateDi(lama, 'B'), turunTingkat).s.doc) === '1.[A 1.[A1, B]]', ringkas(jalan(stateDi(lama, 'B'), turunTingkat).s.doc))
const adaSusunan = dok(OL({ gaya: '1.', susunan: tulisSusunan(SUSUNAN.word) }, LI('A', OL({ gaya: 'a.' }, LI('B'), LI('C')))))
ok('E10b tingkat yang belum ada mengikuti susunan TERSIMPAN (bawaan Word: i.), bukan susunan bawaan', ringkas(jalan(stateDi(adaSusunan, 'C'), turunTingkat).s.doc) === '1.[A a.[B i.[C]]]', ringkas(jalan(stateDi(adaSusunan, 'C'), turunTingkat).s.doc))
const dua = dok(OL(null, LI('A', OL({ gaya: 'a.' }, LI('A1'))), LI('B', OL({ gaya: 'a.' }, LI('B1')))))
const s11 = jalan(stateDi(dua, 'A1'), aturGayaTingkat('i.'))
ok('E11 galeri: format berlaku untuk seluruh tingkat di pohon, akar tidak tersentuh', ringkas(s11.s.doc) === '1.[A i.[A1], B i.[B1]]', ringkas(s11.s.doc))
const s12 = jalan(stateDi(dua, 'A1'), aturGayaTingkat('○'))
ok('E12 nomor → bullet: tipe simpul berganti, isi utuh', ringkas(s12.s.doc) === '1.[A ○[A1], B ○[B1]]' && s12.s.doc.firstChild!.firstChild!.lastChild!.type.name === 'bulletList', ringkas(s12.s.doc))
const s13 = jalan(stateDi(s12.s.doc, 'A1'), aturGayaTingkat('1)'))
ok('E13 bullet → nomor: balik lagi, tanpa type lama tertinggal', ringkas(s13.s.doc) === '1.[A 1)[A1], B 1)[B1]]' && s13.s.doc.firstChild!.firstChild!.lastChild!.type.name === 'orderedList', ringkas(s13.s.doc))
const lamaHuruf = dok(OL({ type: 'a', gaya: 'a.' }, LI('A')))
const s14 = jalan(stateDi(lamaHuruf, 'A'), aturGayaTingkat('1.'))
ok('E14 type="a" lama dibuang saat format diganti', s14.s.doc.firstChild!.attrs.type === null && gayaNode(s14.s.doc.firstChild!) === '1.')
ok('E15 galeri di luar daftar menyerahkan ke bungkus', jalan(stateDi(dok(P('x')), 'x'), aturGayaTingkat('1.')).r === false && jalan(stateDi(dok(P('x')), 'x'), aturSusunan('word')).r === false)
const dasarS = dok(OL(null, LI('A', OL(null, LI('B', OL(null, LI('C')))))))
const s16 = jalan(stateDi(dasarS, 'C'), aturSusunan('romawi'))
ok('E16 daftar bertingkat: tiap tingkat mengikuti susunan, susunan tersimpan', ringkas(s16.s.doc) === 'I.[A A.[B 1.[C]]]' && s16.s.doc.firstChild!.attrs.susunan === tulisSusunan(SUSUNAN.romawi), ringkas(s16.s.doc))
const s17 = jalan(stateDi(dasarS, 'A'), aturSusunan('bullet'))
ok('E17 daftar bertingkat bullet: semua tipe simpul jadi bullet', ringkas(s17.s.doc) === '•[A ○[B ▪[C]]]' && s17.s.doc.firstChild!.type.name === 'bulletList', ringkas(s17.s.doc))
const s18 = jalan(stateDi(dasarS, 'A'), aturSusunan('desimal'))
const s18b = jalan(stateDi(s18.s.doc, 'B'), aturGayaTingkat('a.'))
ok('E18 keluar dari 1.1. di tingkat 2: tingkat 3 ikut turun jadi format biasa', ringkas(s18.s.doc) === '1.1.[A 1.1.[B 1.1.[C]]]' && ringkas(s18b.s.doc) === '1.1.[A a.[B 1)[C]]]', ringkas(s18b.s.doc))
const beberapa = dok(OL(null, LI('A')), P('x'), OL(null, LI('B')))
ok('E19 pilihan melintasi dua daftar: keduanya berganti', ringkas(jalan(stateBlok(beberapa, 'A', 'B'), aturGayaTingkat('a)')).s.doc) === 'a)[A] p:x a)[B]', ringkas(jalan(stateBlok(beberapa, 'A', 'B'), aturGayaTingkat('a)')).s.doc))
ok('E20 kodeSusunanDari: cocok persis saja', kodeSusunanDari(SUSUNAN.word) === 'word' && kodeSusunanDari(susunanPenuh(['1.', '1.'])) === null)

const hd = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Judul' }] }, P('Isi')] })
const s21 = jalan(stateBlok(hd, 'Judul', 'Isi'), bungkusDaftar('a)'))
ok('E21 bungkus: tiap paragraf satu butir, judul jadi paragraf', ringkas(s21.s.doc) === 'a)[Judul, Isi]', ringkas(s21.s.doc))
const sbl = dok(OL({ gaya: '1)' }, LI('A')), P('B'))
ok('E22 bungkus di bawah daftar bergaya sama: tersambung', ringkas(jalan(stateDi(sbl, 'B'), bungkusDaftar('1)')).s.doc) === '1)[A, B]')
ok('E23 bungkus di bawah daftar beda gaya: tetap terpisah', ringkas(jalan(stateDi(sbl, 'B'), bungkusDaftar('a.')).s.doc) === '1)[A] a.[B]', ringkas(jalan(stateDi(sbl, 'B'), bungkusDaftar('a.')).s.doc))
ok('E24 bungkus membawa susunan', jalan(stateDi(dok(P('x')), 'x'), bungkusDaftar('I.', SUSUNAN.romawi)).s.doc.firstChild!.attrs.susunan === tulisSusunan(SUSUNAN.romawi))
ok('E25 bungkus bullet memakai bulletList', jalan(stateDi(dok(P('x')), 'x'), bungkusDaftar('➢')).s.doc.firstChild!.type.name === 'bulletList')

const tigaButir = dok(OL({ gaya: '1)', start: 5, lanjut: true }, LI('A'), LI('B'), LI('C')))
const s26 = jalan(stateDi(tigaButir, 'B'), mulaiUlangDariSatu)
ok('E26 Mulai ulang di tengah: daftar terpecah, sisanya mulai dari 1, gaya sama, bagian atas tak berubah', ringkas(s26.s.doc) === '1)[A] 1)[B, C]' && s26.s.doc.lastChild!.attrs.start === 1 && s26.s.doc.lastChild!.attrs.lanjut === null && s26.s.doc.firstChild!.attrs.start === 5, ringkas(s26.s.doc))
const s27 = jalan(stateDi(tigaButir, 'A'), mulaiUlangDariSatu)
ok('E27 Mulai ulang di butir pertama: tidak terpecah, start & lanjut dilepas', ringkas(s27.s.doc) === '1)[A, B, C]' && s27.s.doc.firstChild!.attrs.start === 1 && s27.s.doc.firstChild!.attrs.lanjut === null)
const s28 = jalan(stateDi(dok(OL(null, LI('A', OL({ gaya: 'a.' }, LI('a1'), LI('a2'))))), 'a2'), mulaiUlangDariSatu)
ok('E28 Mulai ulang di tingkat bawah: dua daftar di butir yang sama', ringkas(s28.s.doc) === '1.[A a.[a1] a.[a2]]', ringkas(s28.s.doc))
ok('E29 Mulai ulang di bullet: tidak berlaku', jalan(stateDi(dok(UL(null, LI('A'))), 'A'), mulaiUlangDariSatu).r === false)
ok('E30 Atur nomor awal: ditulis & dijepit, lanjut dilepas', jalan(stateDi(tigaButir, 'B'), aturNomorAwal(7)).s.doc.firstChild!.attrs.start === 7 && jalan(stateDi(tigaButir, 'B'), aturNomorAwal(7)).s.doc.firstChild!.attrs.lanjut === null && jalan(stateDi(tigaButir, 'B'), aturNomorAwal(99999)).s.doc.firstChild!.attrs.start === 9999)
ok('E31 Atur nomor awal di daftar bersarang: daftar di kursor, bukan akar', (() => { const d = jalan(stateDi(dok(OL(null, LI('A', OL({ gaya: 'a.' }, LI('a1'))))), 'a1'), aturNomorAwal(3)).s.doc; return d.firstChild!.attrs.start === 1 && d.firstChild!.firstChild!.lastChild!.attrs.start === 3 })())
const sl = dok(OL({ gaya: '1)', start: 4 }, LI('A')))
ok('E32 Lanjutkan: akar saja; start dilepas supaya sambungan yang menentukan', jalan(stateDi(sl, 'A'), aturLanjut(true)).s.doc.firstChild!.attrs.lanjut === true && jalan(stateDi(sl, 'A'), aturLanjut(true)).s.doc.firstChild!.attrs.start === 1
  && jalan(stateDi(dok(OL(null, LI('A', OL(null, LI('a1'))))), 'a1'), aturLanjut(true)).r === false && jalan(stateDi(dok(UL(null, LI('A'))), 'A'), aturLanjut(true)).r === false)
const desi = dok(OL({ gaya: '1.1.' }, LI('A', OL({ gaya: '1.1.' }, LI('B')))))
ok('E33 nomor awal/mulai ulang dikunci di 1.1. tingkat bawah', nomorTerkunciDesimal(posisiDaftar(stateDi(desi, 'B').selection.$from)!) && !nomorTerkunciDesimal(posisiDaftar(stateDi(desi, 'A').selection.$from)!))
const blokTiga = dok(P('p'), OL(null, LI('A'), LI(''), LI('', OL(null, LI('n')))), UL(null, LI('B')), OL({ gaya: 'a.', start: 3, lanjut: true }, LI('C')))
const ab = akarBlokDari(blokTiga)
ok('E34 akarBlokDari: butir kosong & butir berisi anak saja tak memakan nomor; indeks akar', ab.akar.map(a => `${a.gaya}/${a.bernomor}/${a.start ?? ''}/${a.lanjut}`).join(' ') === '1./1/1/false •/1/1/false a./1/3/true' && indeksAkar(blokTiga, ab.pos[1]) === 1 && indeksAkar(blokTiga, 0) === -1, JSON.stringify(ab.akar))

const fmt = dok({ type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'Judul', marks: [{ type: 'bold' }] }] } as JS, { type: 'paragraph', attrs: { textAlign: 'right', indKiri: 100 }, content: [{ type: 'text', text: 'Isi', marks: [{ type: 'italic' }, { type: 'stabilo', attrs: { warna: 'hijau' } }] }] } as JS)
const s35 = jalan(stateBlok(fmt, 'Judul', 'Isi'), hapusFormat).s.doc
let adaMark = false
s35.descendants(n => { if (n.marks.length) adaMark = true })
ok('E35 Hapus format: huruf, perataan, indent, judul', !adaMark && s35.firstChild!.type.name === 'paragraph' && s35.firstChild!.attrs.textAlign === null && s35.lastChild!.attrs.textAlign === null && s35.lastChild!.attrs.indKiri === null)
const s36 = jalan(stateDi(dok(P('Aku', [{ type: 'bold' }]), P('Lain', [{ type: 'bold' }])), 'ku'), hapusFormat).s.doc
ok('E36 Hapus format tanpa pilihan: seluruh paragraf di kursor, paragraf lain tidak', s36.firstChild!.childCount === 1 && s36.firstChild!.firstChild!.marks.length === 0 && s36.lastChild!.firstChild!.marks.length === 1)
const s37 = jalan(stateDi(dok(OL(null, { type: 'listItem', attrs: { indKiri: 900 }, content: [P('A', [{ type: 'bold' }])] } as JS)), 'A'), hapusFormat).s.doc
ok('E37 Hapus format di daftar: nomor tetap, indent butir dilepas', s37.firstChild!.type.name === 'orderedList' && s37.firstChild!.firstChild!.attrs.indKiri === null && s37.firstChild!.firstChild!.firstChild!.firstChild!.marks.length === 0)

const huruf = dok({ type: 'paragraph', content: [{ type: 'text', text: 'ru', marks: [{ type: 'bold' }] }, { type: 'text', text: 'mah sakit' }] } as JS)
const s38 = jalan(stateBlok(huruf, 'ru', 'sakit'), ubahHuruf('kata')).s
ok('E38 Tiap Kata: satu kata terbelah dua simpul tetap satu kata, tebalnya tidak hilang', s38.doc.textContent === 'Rumah Sakit' && s38.doc.firstChild!.firstChild!.text === 'Ru' && s38.doc.firstChild!.firstChild!.marks.length === 1, s38.doc.textContent)
ok('E39 pilihan tetap di teks yang sama', s38.selection.from === posTeks(huruf, 'ru') && s38.selection.to === posTeks(huruf, 'sakit') + 5, `${s38.selection.from}-${s38.selection.to}`)
const dokKursor = dok(P('rumah sakit jiwa'))
const kursor = jalan(stateDi(dokKursor, 'kit'), ubahHuruf('besar'))
ok('E40 tanpa pilihan: kata di kursor saja, kursor tidak berpindah', kursor.s.doc.textContent === 'rumah SAKIT jiwa' && kursor.s.selection.empty && kursor.s.selection.from === posTeks(dokKursor, 'kit'), `${kursor.s.doc.textContent} @${kursor.s.selection.from}`)
ok('E41 kursor di spasi antarkata = kata di depannya; di ruang kosong tidak menulis', jalan(EditorState.create({ doc: dok(P('a  b')), selection: TextSelection.create(dok(P('a  b')), 3) }), ubahHuruf('besar')).r === false)
const dariBesar = jalan(stateBlok(dok(P('RUMAH SAKIT. JIWA')), 'RUMAH', 'JIWA'), ubahHuruf('kalimat')).s.doc.textContent
ok('E42 Huruf awal kalimat lintas kalimat', dariBesar === 'Rumah sakit. Jiwa', dariBesar)
const tengah = jalan(stateBlok(dok(P('Rumah SAKIT JIWA')), 'SAKIT', 'JIWA'), ubahHuruf('kalimat')).s.doc.textContent
ok('E43 pilihan di tengah kalimat: tidak mengarang huruf besar', tengah === 'Rumah sakit jiwa', tengah)
const duaBlok = jalan(stateBlok(dok(P('SATU'), P('DUA')), 'SATU', 'DUA'), ubahHuruf('kalimat')).s.doc
ok('E44 tiap paragraf = awal kalimat baru', duaBlok.firstChild!.textContent === 'Satu' && duaBlok.lastChild!.textContent === 'Dua')
const putar = (t: string) => jalan(stateBlok(dok(P(t)), t, t), ubahHuruf('putar')).s.doc.textContent
ok('E45 Shift+F3: kecil → BESAR → Tiap Kata → kecil', putar('rumah sakit') === 'RUMAH SAKIT' && putar('RUMAH SAKIT') === 'Rumah Sakit' && putar('Rumah Sakit') === 'rumah sakit', putar('RUMAH SAKIT'))
const atomSchemaUji = dok({ type: 'paragraph', content: [{ type: 'text', text: 'aku' }, { type: 'hardBreak' }, { type: 'text', text: 'kamu' }] } as JS)
const s46 = jalan(stateBlok(atomSchemaUji, 'aku', 'kamu'), ubahHuruf('besar')).s.doc
ok('E46 simpul sebaris non-teks dibiarkan', s46.textContent === 'AKUKAMU' && s46.firstChild!.childCount === 3, String(s46.firstChild!.childCount))
ok('E47 isi sudah sama: berhasil tanpa menulis', (() => { let t = 0; ubahHuruf('besar')(stateBlok(dok(P('ABC')), 'ABC', 'ABC'), () => { t++ }); return t === 0 })())

// ─── F. Ubah huruf ────────────────────────────────────────────────────────────
console.log('\nF. Ubah huruf')
const uh = (t: string, m: Parameters<typeof ubahSegmen>[1], k?: Parameters<typeof ubahSegmen>[2]) => ubahSegmen([t], m, k)[0]
ok('F1 Tiap Kata: tanda hubung memisah, apostrof tidak, angka menyambung', uh("rawat-inap ma'ruf 2nd", 'kata') === "Rawat-Inap Ma'ruf 2nd", uh("rawat-inap ma'ruf 2nd", 'kata'))
ok('F2 kecil/BESAR', uh('Rumah SAKIT', 'kecil') === 'rumah sakit' && uh('Rumah sakit', 'besar') === 'RUMAH SAKIT')
ok('F3 bAlIk', uh('Rumah 1', 'balik') === 'rUMAH 1')
ok('F4 kalimat: tanda seru, tanya, titik; desimal bukan akhir kalimat', uh('A b! C? D. e 1.5 F', 'kalimat') === 'A b! C? D. E 1.5 f', uh('A b! C? D. e 1.5 F', 'kalimat'))
ok('F5 kalimat: tanda kutip penutup sesudah titik tetap akhir kalimat', uh('DIA BILANG "YA." LALU', 'kalimat') === 'Dia bilang "ya." Lalu', uh('DIA BILANG "YA." LALU', 'kalimat'))
ok('F6 jumlah segmen & format tiap simpul tetap', ubahSegmen(['ru', 'mah'], 'besar').join('|') === 'RU|MAH' && ubahSegmen(['ru', 'mah'], 'kata').join('|') === 'Ru|mah')
ok('F7 konteks: di tengah kata tidak jadi awal kata', uh('mah', 'kata', { awalKalimat: false, dalamKata: true }) === 'mah' && konteksSebelum('ru').dalamKata && !konteksSebelum('ru ').dalamKata)
ok('F8 konteks: awal paragraf & sesudah titik = awal kalimat', konteksSebelum('').awalKalimat && konteksSebelum('Satu. ').awalKalimat && !konteksSebelum('Satu ').awalKalimat)
ok('F9 huruf Indonesia/aksen', uh('énak', 'besar') === 'ÉNAK')
ok('F10 putaran dari teks campur = kecil; tanpa huruf = kecil', modeBerikut('Rumah sAKIT') === 'kecil' && modeBerikut('123') === 'kecil')
ok('F11 rentang kata', rentangKata('rumah sakit', 7).join() === '6,11' && rentangKata('a  b', 2).join() === '2,2' && rentangKata("ma'ruf x", 1).join() === '0,6')
ok('F12 ukuran: pt dibaca apa adanya, px lama dikonversi', ptDariCss('14pt') === 14 && ptDariCss('16px') === 12 && ptDariCss('') === null && ptDariCss('abc') === null && szDariGaya('font-size:10.5pt') === 21 && szDariGaya('font-size:16px') === 24 && szDariGaya('color:red') === null)
ok('F13 warna stabilo Word: dikenal, tak dikenal jadi kuning, none = tanpa', stabiloDariWord('green') === 'hijau' && stabiloDariWord('lightGray') === 'abu' && stabiloDariWord('darkBlue') === 'kuning' && stabiloDariWord('none') === null && stabiloDariWord(null) === null && Object.keys(STABILO).length === 5)
const ketik = (t: string) => { const m = POLA_KETIK.exec(t); return m ? gayaKetikan(m)?.gaya ?? null : null }
ok('F14 daftar otomatis saat mengetik: bentuk yang dikenali', ketik('1) ') === '1)' && ketik('(1) ') === '(1)' && ketik('a. ') === 'a.' && ketik('a) ') === 'a)' && ketik('(a) ') === '(a)' && ketik('A. ') === 'A.' && ketik('I. ') === 'I.' && ketik('i. ') === 'i.' && ketik('12. ') === '1.', String(ketik('1) ')))
ok('F15 daftar otomatis: yang bukan awal deret / bentuk rusak tidak memicu', !POLA_KETIK.test('b. ') && !POLA_KETIK.test('b) ') && !POLA_KETIK.test('(b) ') && ketik('(1. ') === null && ketik('1 ') === null && ketik('a ') === null && ketik('ab. ') === null && ketik('1234. ') === null)

// ─── G. Impor Word ────────────────────────────────────────────────────────────
console.log('\nG. Impor Word')
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
const par = (t: string, ppr = '', rpr = '') => `<w:p><w:pPr>${ppr}</w:pPr><w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t>${t}</w:t></w:r></w:p>`
const berkas = (badan: string, numbering = ''): Buffer => {
  const z = new PizZip()
  z.file('word/document.xml', `<?xml version="1.0"?><w:document ${WNS}><w:body>${badan}<w:sectPr/></w:body></w:document>`)
  if (numbering) z.file('word/numbering.xml', `<?xml version="1.0"?><w:numbering ${WNS}>${numbering}</w:numbering>`)
  z.file('word/styles.xml', `<?xml version="1.0"?><w:styles ${WNS}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="H1"><w:name w:val="heading 1"/></w:style></w:styles>`)
  return z.generate({ type: 'nodebuffer' }) as Buffer
}
const judul = par('BAB I PENDAHULUAN', '<w:pStyle w:val="H1"/>')
const narasiDari = (d: Buffer) => bacaDocxLkjip(d).bagian[0].blok.map(b => (b.tipe === 'NARASI' ? b.payload.html : '')).join('')
const lv = (l: number, fmt: string, teks: string) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${teks}"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`
const numUji = `<w:abstractNum w:abstractNumId="1">${lv(0, 'decimal', '%1.')}${lv(1, 'lowerLetter', '%2)')}${lv(2, 'lowerRoman', '%3.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>`
  + `<w:abstractNum w:abstractNumId="2">${lv(0, 'upperRoman', '%1.')}</w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>`
  + `<w:abstractNum w:abstractNumId="3">${lv(0, 'upperLetter', '(%1)')}</w:abstractNum><w:num w:numId="3"><w:abstractNumId w:val="3"/></w:num>`
  + `<w:abstractNum w:abstractNumId="4">${lv(0, 'bullet', 'o')}</w:abstractNum><w:num w:numId="4"><w:abstractNumId w:val="4"/></w:num>`
  + `<w:abstractNum w:abstractNumId="5">${lv(0, 'decimal', '%1.')}${lv(1, 'decimal', '%1.%2.')}</w:abstractNum><w:num w:numId="5"><w:abstractNumId w:val="5"/></w:num>`
  + `<w:abstractNum w:abstractNumId="6">${lv(0, 'decimal', '%1.')}${lv(1, 'lowerLetter', '%2.')}</w:abstractNum><w:num w:numId="6"><w:abstractNumId w:val="6"/></w:num>`
  + `<w:num w:numId="7"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>`
const nP = (id: number, l = 0) => `<w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="${id}"/></w:numPr>`
const g1 = narasiDari(berkas(judul + par('A', nP(1)) + par('B', nP(1, 1)) + par('C', nP(1, 2)) + par('D', nP(1, 1)) + par('E', nP(1)), numUji))
ok('G1 tingkat jadi daftar bersarang sungguhan, format tiap tingkat terbawa', g1 === '<ol><li><p>A</p><ol data-gaya="a)"><li><p>B</p><ol data-gaya="i."><li><p>C</p></li></ol></li><li><p>D</p></li></ol></li><li><p>E</p></li></ol>', g1)
const g2 = narasiDari(berkas(judul + par('R', nP(2)) + par('K', nP(3)) + par('O', nP(4)), numUji))
ok('G2 romawi, huruf besar berkurung, bullet lingkaran terbawa', g2 === '<ol data-gaya="I."><li data-ind-pertama="-360"><p>R</p></li></ol><ol data-gaya="(A)"><li><p>K</p></li></ol><ul data-gaya="○"><li><p>O</p></li></ul>', g2)
const g3 = narasiDari(berkas(judul + par('A', nP(1)) + par('C', nP(1, 2)) + par('E', nP(1)), numUji))
ok('G3 tingkat melompat (0 → 2): dipendekkan, posisinya tetap lewat data-ind', g3.includes('<ol data-gaya="i."><li data-ind-kiri="2160"><p>C</p></li></ol>') && g3.includes('<li><p>E</p></li>'), g3)
const g4 = narasiDari(berkas(judul + par('B', nP(1, 1)) + par('E', nP(1)), numUji))
ok('G4 mulai dari tingkat 2 tanpa induk: jadi daftar akar, posisinya tetap', g4.startsWith('<ol data-gaya="a)"><li data-ind-kiri="1440"><p>B</p></li></ol><ol><li><p>E</p></li></ol>'), g4)
const g5 = narasiDari(berkas(judul + par('A', nP(1)) + par('sisip') + par('B', nP(1)) + par('b1', nP(1, 1)), numUji))
ok('G5 terpotong paragraf: lanjut dari nomornya, anak tetap bersarang', g5 === '<ol><li><p>A</p></li></ol><p>sisip</p><ol start="2"><li><p>B</p><ol data-gaya="a)"><li><p>b1</p></li></ol></li></ol>', g5)
const g6 = narasiDari(berkas(judul + par('X', nP(5)) + par('Y', nP(5, 1)) + par('sisip') + par('Z', nP(5, 1)) + par('W', nP(5)), numUji))
ok('G6 %1.%2. → 1.1. bersarang selama induknya satu pohon', g6.startsWith('<ol><li><p>X</p><ol data-gaya="1.1."><li') && g6.includes('Y'), g6)
ok('G6b 1.1. yang induknya terpotong paragraf: nomor jadi teks, tercetak sama dgn asal; daftar sesudahnya lanjut', g6.includes('>1.2. Z</p>') && g6.includes('<ol start="2"><li><p>W</p></li></ol>'), g6)
const g7 = narasiDari(berkas(judul + par('m', '', '<w:vertAlign w:val="superscript"/>') + par('n', '', '<w:vertAlign w:val="subscript"/><w:highlight w:val="cyan"/>'), ''))
ok('G7 super/subscript & stabilo terbawa', g7.includes('<sup>m</sup>') && g7.includes('<mark data-stabilo="biru"><sub>n</sub></mark>'), g7)
const g8 = narasiDari(berkas(judul + par('A', nP(1)) + par('Z', nP(2)), numUji))
const g8b = narasiDari(berkas(judul + par('A', nP(1)) + par('Q', nP(6, 1)), numUji))
ok('G8b tingkat bawah dari abstrak lain tidak masuk ke butir daftar ini', g8b.startsWith('<ol><li><p>A</p></li></ol><ol type="a">'), g8b)
const g8c = narasiDari(berkas(judul + par('A', nP(1)) + par('L', nP(7)), numUji))
ok('G8c nomor melompat dalam satu abstrak (startOverride): daftar baru dari nomornya', g8c === '<ol><li><p>A</p></li></ol><ol start="5"><li><p>L</p></li></ol>', g8c)
ok('G8 beda abstrak: daftar terpisah', g8 === '<ol><li><p>A</p></li></ol><ol data-gaya="I."><li data-ind-pertama="-360"><p>Z</p></li></ol>', g8)
const dariImpor = pohon([[blok(g1)]])
const g9 = nomorDariBerkas(await berkasWord(dariImpor))
ok('G9 impor → ekspor: nomor = sumber', [...g9].map(([k, v]) => `${k}${v}`).join(' ') === 'A1 B1 C1 D2 E2', JSON.stringify([...g9]))
ok('G10 hasil impor lolos penyaring tanpa berubah', sanitizeNarasiHtml(g1) === g1 && sanitizeNarasiHtml(g2) === g2)

// ─── H. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nH. Sambungan layar')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const gl = kode('app/(dashboard)/lkjip/[id]/GaleriDaftar.tsx')
const rm = kode('components/tabel/RowMenu.tsx')
const te = kode('components/tabel/TabelEditor.tsx')
const iw = kode('lib/lkjip/impor-word.ts')
const badan = (s: string, awal: string) => { const i = s.indexOf(awal); if (i < 0) return ''; let d = 0, j = s.indexOf('{', i); const m = j; for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; } return s.slice(m, j + 1) }
ok('H1 ekstensi terpasang', /StarterKit\.configure\(\{ link: false, trailingNode: false \}\), TextAlign, TextStyle, GayaDaftar, Superskrip, Subskrip, Stabilo,/.test(tt))
ok('H2 CSS gaya dari satu sumber + gantung bawaan', tt.includes("cssGayaDaftar('.lk-tt-content .ProseMirror')") && /--lk-gantung: \$\{BUTIR_GANTUNG_DXA\}/.test(tt) && tt.includes('var(--i-pertama, calc(var(--lk-gantung) * -1))'))
ok('H3 penggaris memakai gantung gaya', tt.includes('indenBerlaku(simpananNode(s.node), s.jenis, bawaanDxa, s.kedalaman, s.gantung)') && tt.includes('keTersimpan({ ...i, ...bidang }, s.jenis, bawaanDxa, s.kedalaman, s.gantung)') && tt.includes('gantungDxa(butir.gaya, kedalaman)'))
ok('H4 tidak ada lagi jejak a,b lama', !tt.includes('listType') && !tt.includes('lk-tt-abc') && !tt.includes('OrderedListType'))
ok('H5 menu klik kanan hanya untuk dokumen yang bisa disunting', tt.includes('onContextMenu={readOnly ? undefined : bukaMenu}'))
const bm = badan(tt, 'function bukaMenu(')
ok('H6 Shift + klik kanan = menu peramban: berhenti SEBELUM preventDefault', bm.indexOf('if (e.shiftKey) return') >= 0 && bm.indexOf('if (e.shiftKey) return') < bm.indexOf('e.preventDefault()'), bm.slice(0, 120))
ok('H7 di luar pilihan kursor pindah; di dalam pilihan tetap', bm.includes('ed.view.posAtCoords') && bm.includes('titik.pos < from || titik.pos > to') && bm.includes('setTextSelection(titik.pos)'))
const im = badan(tt, 'function itemMenu(')
ok('H8 Tempel mati kalau peramban tak membuka papan klip, alasannya menunjuk Ctrl+V', im.includes("typeof navigator.clipboard?.read === 'function'") && im.includes('disabled: !bisaTempel') && im.includes('Tekan Ctrl+V'))
ok('H9 butir daftar hanya muncul di dalam daftar; nomor hanya di daftar bernomor', im.includes('...(posDaftar ? [') && im.includes('...(nomor ? ['))
ok('H10 Potong/Salin lewat execCommand (http) & butuh pilihan', tt.includes('document.execCommand(perintah)') && im.includes('disabled: !adaPilihan'))
ok('H11 semua aksi menu ada', ['Potong', 'Salin', 'Tempel', 'Hapus format', 'Ubah huruf', 'Paragraf…', 'Penomoran', 'Bullet', 'Daftar bertingkat', 'Turun satu tingkat', 'Naik satu tingkat', 'Mulai ulang dari 1', 'Lanjutkan penomoran', 'Atur nomor awal…', 'Sisipkan rujukan', 'Sisipkan angka dari modul'].every(l => im.includes(`'${l}'`)))
ok('H12 rata juga mengenai sub-judul', tt.includes("updateAttributes('paragraph', { textAlign: nilai }).updateAttributes('heading', { textAlign: nilai })"))
ok('H13 ukuran huruf dalam pt', tt.includes('setMark(\'textStyle\', { fontSize: `${pt}pt` })') && tt.includes('UKURAN_PT.map') && tt.includes('ptDariCss(ed.getAttributes(\'textStyle\').fontSize)'))
ok('H14 tambah/kurangi indent di daftar memindah tingkat; kurangi di tingkat teratas tidak melepas nomor', tt.includes('posisi.kedalaman > 1 && naikTingkat('))
const lj = badan(tt, 'function pilihLanjut(')
ok('H15 Lanjutkan di daftar pertama memakai centang blok, bukan sakelar kedua', lj.includes('onLanjutDaftar?.(!sudahLanjut)') && lj.includes('jalankan(aturLanjut(!sudahLanjut))'))
ok('H16 galeri tidak mengambil fokus editor', gl.includes('const tekan = (aksi: () => void) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); aksi(); }'))
ok('H17 RowMenu: sub-menu opsional, menu lama tak berubah', rm.includes('sub?: React.ReactNode') && rm.includes("it.sub && !it.disabled") && rm.includes('lk-rowmenu-sub'))
ok('H18 tooltip memakai data-tooltip, bukan title', !/\btitle=/.test(gl) && !/\stitle="/.test(tt.split('<RowMenu')[0].split('const TT_CSS')[0]))
ok('H19 centang Ulangi kepala hanya di LKJIP', te.includes('ubahAtur({ ulangKepala: e.target.checked })') && /\{lkjip && \(\s*<label[^>]*>\s*<input type="checkbox" checked=\{atur\.ulangKepala\}/.test(te))
ok('H20 impor tidak lagi memperingatkan romawi', !iw.includes('romawi jadi') && !iw.includes('catatRomawi'))
ok('H21 aturan format lewat satu sumber: tak ada regex type=a di docgen & lanjut-daftar', !/type\\s\*=/.test(kode('lib/lkjip/docgen.ts')) && !/type\\s\*=/.test(kode('lib/lkjip/lanjut-daftar.ts')))

const ex = kode('lib/lkjip/ekstensi-narasi.ts')
ok('H22 Tab/Shift+Tab di daftar selalu dimakan (butir pertama: fokus tidak lompat keluar editor)', /turunTingkat\(state, view\.dispatch\);\s*return true;/.test(ex) && /naikTingkat\(state, view\.dispatch\);\s*return true;/.test(ex))
ok('H23 penggaris & menu memakai format di kursor', tt.includes('const gayaKini = posDaftar ? gayaNode(posDaftar.daftar) : null') && tt.includes('kodeSusunanDari(susunanPohon(posDaftar.akar))'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join('; ')); process.exit(1) }
