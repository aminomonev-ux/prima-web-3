// scripts/test-lkjip-lanjut-daftar.mts — nomor "Lanjut daftar" di editor = nomor di berkas Word.
//
// A: contoh yang sudah dibuka di Microsoft Word 2026-11-05 (angka harapan = ListString Word)
// B: 400 dokumen acak — nomor tampil editor dibandingkan dgn nomor yang benar-benar ditulis rakitDocx
// C: numbering.xml — daftar bernomor selalu ber-startOverride (tanpa itu Word menyambung semua daftar)
// D: sambungan layar (komentar dibuang dulu — L82c)
// E: daftar PERTAMA yang bersarang — B melewatinya; akibatnya ke blok penyambung = Word
//
// Jalankan: npx tsx scripts/test-lkjip-lanjut-daftar.mts

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import { lanjutanDaftar, mulaiDaftarBlok } from '../lib/lkjip/lanjut-daftar'
import type { KodeGaya } from '../lib/lkjip/gaya-daftar'
import { buildNumberedTree, type SectionFlat, type BlockNode, type SectionNode } from '../lib/lkjip/numbering'
import { DEFAULT_STYLE } from '../lib/lkjip/schemas'
import { rakitDocx } from '../lib/lkjip/docgen'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const pohon = (blok: BlockNode[][]): SectionNode[] => {
  const sec: SectionFlat[] = blok.map((_, i) => ({ id: i + 1, parent_id: i === 0 ? null : 1, depth: i === 0 ? 0 : 1, urutan: i, judul: `Bagian ${i + 1}`, locked: 0 }))
  return buildNumberedTree(sec, new Map(blok.map((b, i) => [i + 1, b])))
}
const ol = (...li: string[]) => `<ol>${li.map(t => `<li><p>${t}</p></li>`).join('')}</ol>`
const ola = (...li: string[]) => `<ol type="a">${li.map(t => `<li><p>${t}</p></li>`).join('')}</ol>`
type JenisNomor = 'ol' | 'ola'
const KODE: Record<JenisNomor, KodeGaya> = { ol: '1.', ola: 'a.' }

// Nomor tiap paragraf berdaftar di berkas Word: per numId + ilvl, mulai dari startOverride-nya (C menjamin
// semua punya); butir tingkat atas memulai ulang tingkat di bawahnya. Model ini dicocokkan dgn ListString
// Word sungguhan 2026-11-06 (scratchpad daftar-word) — termasuk bersarang sejenis & beda jenis.
async function nomorWord(tree: SectionNode[], kp = '') {
  const zip = new PizZip((await rakitDocx({ tree, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE, kataPengantarHtml: kp } })).buffer)
  const num = zip.file('word/numbering.xml')!.asText()
  const fmtTingkat = new Map<string, string>()
  for (const a of num.matchAll(/<w:abstractNum w:abstractNumId="(\d+)">([\s\S]*?)<\/w:abstractNum>/g))
    for (const l of a[2].matchAll(/<w:lvl w:ilvl="(\d)"><w:start w:val="1"\/><w:numFmt w:val="(\w+)"\/>/g)) fmtTingkat.set(`${a[1]}|${l[1]}`, l[2])
  const mulai = new Map<string, { abs: string; start: number | null; ilvl: number; bullet: boolean }>()
  for (const m of num.matchAll(/<w:num w:numId="(\d+)"><w:abstractNumId w:val="(\d+)"\/>(?:<w:lvlOverride w:ilvl="(\d)"><w:startOverride w:val="(\d+)"\/><\/w:lvlOverride>)?<\/w:num>/g))
    mulai.set(m[1], { abs: m[2], start: m[4] ? Number(m[4]) : null, ilvl: Number(m[3] ?? 0), bullet: fmtTingkat.get(`${m[2]}|${m[3] ?? 0}`) === 'bullet' })
  const hitung = new Map<string, number[]>()
  const par: { teks: string; nomor: number | null; abs: string | null; ilvl: number | null; bullet: boolean }[] = []
  for (const m of zip.file('word/document.xml')!.asText().matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)) {
    const teks = [...m[1].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(t => t[1]).join('')
    const id = /<w:numId w:val="(\d+)"\/>/.exec(m[1])?.[1]
    if (!id) { par.push({ teks, nomor: null, abs: null, ilvl: null, bullet: false }); continue }
    const lv = Number(/<w:ilvl w:val="(\d)"\/>/.exec(m[1])?.[1] ?? 0)
    const inst = mulai.get(id)
    const arr = hitung.get(id) ?? []
    const n = (arr[lv] ?? ((inst?.ilvl === lv ? inst.start : null) ?? 1) - 1) + 1
    arr[lv] = n
    arr.length = lv + 1
    hitung.set(id, arr)
    par.push({ teks, nomor: n, abs: inst?.abs ?? null, ilvl: lv, bullet: fmtTingkat.get(`${inst?.abs}|${lv}`) === 'bullet' })
  }
  return { par, mulai }
}

// ─── A. Contoh yang dibuka di Word ────────────────────────────────────────────
console.log('A. Contoh yang sudah dibuka di Microsoft Word')
let idA = 0
const n = (html: string, continueList = false): BlockNode => ({ id: ++idA, tipe: 'NARASI', payload: { html, continueList }, urutan: idA })
const blokA = [
  n(ol('A0'), true), n(ol('A1', 'A2')), n(ol('B1')), n(ol('C1'), true),
  n(ola('D1', 'D2')), n(ola('E1')), n(ola('F1'), true),
  n('<ul><li><p>G1</p></li></ul>' + ol('G2'), true),
  n('<ol start="5"><li><p>H1</p></li></ol>'), n(ol('I1'), true),
  n('<ol><li><p>J1</p><ol><li><p>J1a</p></li></ol></li><li><p>J2</p></li></ol>'),
  n('<ol><li><p></p></li><li><p>K2</p></li></ol>'), n(ol('L1'), true),
]
const pohonA = pohon([blokA])
const lA = lanjutanDaftar(pohonA, ol('KP1', 'KP2'))
// ListString Word sungguhan (scratchpad daftar-word) sesudah startOverride & perbaikan daftar bersarang.
const wordA = 'KP1=1 KP2=2 A0=3 A1=1 A2=2 B1=1 C1=2 D1=1 D2=2 E1=1 F1=2 G2=1 H1=5 I1=6 J1=1 J1a=1 J2=2 K2=1 L1=2'
const { par: parA } = await nomorWord(pohonA, ol('KP1', 'KP2'))
const tulisA = parA.filter(p => p.nomor !== null && !p.bullet).map(p => `${p.teks}=${p.nomor}`).join(' ')
ok('A1 nomor rakitDocx (per numId + startOverride) = yang tampil di Word', tulisA === wordA, tulisA)
ok('A2 menyambung Kata Pengantar: blok pertama → 3', lA.get(1)?.['1.'] === 3, JSON.stringify(lA.get(1)))
ok('A3 menyambung daftar terakhir, BUKAN daftar pertama: C → 2 (sesudah B1), bukan 3 (sesudah A2)', lA.get(4)?.['1.'] === 2, JSON.stringify(lA.get(4)))
ok('A4 huruf menyambung huruf: F → b (2); belum ada huruf sebelum D', lA.get(7)?.['a.'] === 2 && lA.get(5)?.['a.'] === undefined, `${JSON.stringify(lA.get(7))} ${JSON.stringify(lA.get(5))}`)
ok('A5 daftar ber-start (impor) jadi pijakan: I → 6 sesudah H mulai 5', lA.get(10)?.['1.'] === 6, JSON.stringify(lA.get(10)))
ok('A6 butir kosong tidak memakan nomor (K2 = 1) → L → 2', lA.get(13)?.['1.'] === 2, JSON.stringify(lA.get(13)))
const solo = n(ol('X'), true)
ok('A7 dicentang tapi belum ada daftar sejenis sebelumnya: tanpa kunci (mulai dari nomornya sendiri)', !('1.' in (lanjutanDaftar(pohon([[solo]])).get(solo.id) ?? {})))
const tanpaKp = lanjutanDaftar(pohonA)
ok('A8 tanpa Kata Pengantar: blok pertama tidak punya lanjutan', tanpaKp.get(1)?.['1.'] === undefined && tanpaKp.get(3)?.['1.'] === 3)
ok('A9 blok non-NARASI dilewati, urutan pohon (induk dulu, lalu anak)', (() => {
  const t = pohon([[n(ol('P1', 'P2')), { id: 900, tipe: 'TABEL', payload: {}, urutan: 900 }], [n(ol('Q1'), true)]])
  return lanjutanDaftar(t).get(idA)?.['1.'] === 3 && !lanjutanDaftar(t).has(900)
})())
ok('A10 rujukan silang sebagai satu-satunya isi butir tetap memakan nomor (di isi jadi field REF)',
  lanjutanDaftar(pohon([[n('<ol><li><p><span data-rujuk="7">Tabel 1</span></p></li></ol>'), n(ol('R'), true)]])).get(idA)?.['1.'] === 2)
ok('A11 butir yang isinya hanya baris baru (Shift+Enter) tetap memakan nomor',
  lanjutanDaftar(pohon([[n('<ol><li><p><br></p></li><li><p></p></li></ol>'), n(ol('S'), true)]])).get(idA)?.['1.'] === 2)

const satuAkar = (a: Parameters<typeof mulaiDaftarBlok>[0][number], l: Parameters<typeof mulaiDaftarBlok>[1], c = true) => mulaiDaftarBlok([a], l, c)[0]
ok('A12 mulaiDaftarBlok: sambungan menurut GAYA daftar pertama; tanpa sambungan = nomornya sendiri; bullet = tidak ada',
  satuAkar({ gaya: '1.', start: 7, bernomor: 1 }, { '1.': 3, 'a.': 5 }) === 3 && satuAkar({ gaya: 'a.', bernomor: 1 }, { '1.': 3, 'a.': 5 }) === 5
  && satuAkar({ gaya: 'a.', start: 2, bernomor: 1 }, { '1.': 3 }) === 2 && satuAkar({ gaya: '1.', start: 4, bernomor: 1 }, undefined) === 4
  && satuAkar({ gaya: '1.', start: 0, bernomor: 1 }, undefined) === 1 && satuAkar({ gaya: '•', bernomor: 1 }, { '1.': 3 }) === null
  && satuAkar({ gaya: '1.', start: 7, bernomor: 1 }, { '1.': 3 }, false) === 7)

// ─── B. Dokumen acak ──────────────────────────────────────────────────────────
console.log('\nB. Dokumen acak — nomor editor vs berkas Word')
let benih = 20261105
const acak = () => { benih = (benih * 1103515245 + 12345) % 2147483648; return benih / 2147483648 }
const peluang = (p: number) => acak() < p
const pilih = <T,>(a: T[]) => a[Math.floor(acak() * a.length)]

// Tiap butir diberi penanda "L<blok>-<daftar>-<butir>" supaya paragrafnya bisa dicari di Word.
// Daftar bersarang hanya di daftar ke-2 dst.: butir berdaftar-anak kehilangan nomornya di Word (sifat
// narasiToXml), jadi daftar PERTAMA yang bersarang tidak punya paragraf pembanding yang sah.
// Akibatnya ke daftar SESUDAHNYA diuji bagian E.
function narasiAcak(b: string, rujuk: boolean): { html: string; pertama: 'ul' | JenisNomor | null; mulai: number } {
  let html = ''
  let pertama: 'ul' | JenisNomor | null = null
  let mulai = 1
  let d = 0
  const segmen = 1 + Math.floor(acak() * 3)
  for (let s = 0; s < segmen; s++) {
    if (peluang(0.25)) { html += peluang(0.2) ? `<h2>Sub ${b}</h2>` : `<p>Teks ${b}-${s}</p>`; continue }
    const jenis = pilih<'ul' | JenisNomor>(['ul', 'ol', 'ol', 'ola'])
    const st = jenis !== 'ul' && peluang(0.2) ? 2 + Math.floor(acak() * 5) : 0
    if (d === 0) { pertama = jenis; mulai = st || 1 }
    const tag = jenis === 'ul' ? 'ul' : 'ol'
    html += `<${tag}${jenis === 'ola' ? ' type="a"' : ''}${st ? ` start="${st}"` : ''}>`
    const butir = 1 + Math.floor(acak() * 3)
    for (let i = 0; i < butir; i++) {
      const tanda = `L${b}-${d}-${i}`
      const r = acak()
      if (r < 0.15) html += '<li><p></p></li>'
      else if (r < 0.25 && rujuk) html += `<li><p><span data-rujuk="99">${tanda}</span></p></li>`
      else if (r < 0.32) html += `<li><p>${tanda}<br>lanjut</p></li>`
      else if (r < 0.36 && d > 0) html += '<li><p><br></p></li>'
      else if (r < 0.45) html += `<li><p>${tanda}</p><ol><li><p>N${tanda}</p></li></ol></li>`
      else html += `<li><p>${tanda}</p></li>`
    }
    html += `</${tag}>`
    d++
  }
  return { html, pertama, mulai }
}

let banding = 0
let lanjutDiuji = 0
const salah: string[] = []
for (let dok = 0; dok < 400; dok++) {
  let id = 0
  const info = new Map<number, { pertama: 'ul' | JenisNomor | null; mulai: number; lanjut: boolean }>()
  const bagian: BlockNode[][] = []
  for (let s = 0, ns = 1 + Math.floor(acak() * 3); s < ns; s++) {
    const blok: BlockNode[] = []
    for (let k = 0, nb = 1 + Math.floor(acak() * 4); k < nb; k++) {
      const bid = ++id
      const lanjut = peluang(0.5)
      const h = narasiAcak(String(bid), true)
      info.set(bid, { pertama: h.pertama, mulai: h.mulai, lanjut })
      blok.push({ id: bid, tipe: 'NARASI', payload: { html: h.html, continueList: lanjut }, urutan: k })
    }
    bagian.push(blok)
  }
  const kp = peluang(0.4) ? narasiAcak('K', false).html : ''
  const tree = pohon(bagian)
  const lanjutan = lanjutanDaftar(tree, kp)
  const { par } = await nomorWord(tree, kp)
  for (const [bid, i] of info) {
    if (i.pertama === null || i.pertama === 'ul') continue
    const p = par.find(x => x.nomor !== null && x.teks.startsWith(`L${bid}-0-`))
    if (!p) continue
    const disambung = i.lanjut ? lanjutan.get(bid)?.[KODE[i.pertama]] : undefined
    const tampil = disambung ?? i.mulai
    banding++
    if (disambung !== undefined) lanjutDiuji++
    if (tampil !== p.nomor) salah.push(`dok ${dok} blok ${bid} (${i.pertama}${i.lanjut ? ', lanjut' : ''}): editor ${tampil}, Word ${p.nomor}`)
  }
}
ok(`B1 ${banding} daftar pertama blok: nomor editor = nomor Word (${lanjutDiuji} di antaranya menyambung)`, salah.length === 0 && banding > 300 && lanjutDiuji > 100, salah.slice(0, 3).join(' | '))

// ─── C. numbering.xml ─────────────────────────────────────────────────────────
console.log('\nC. numbering.xml')
const { mulai: numC } = await nomorWord(pohon([[n(ol('a') + '<ul><li><p>b</p></li></ul>' + ola('c') + '<ol start="4"><li><p>d</p></li></ol>')], [n(ol('e'), true)]]))
const tanpaOverride = [...numC.entries()].filter(([, v]) => !v.bullet && v.start === null).map(([k]) => k)
ok('C1 tiap daftar bernomor (angka & huruf) ber-startOverride — 1, atau start-nya', tanpaOverride.length === 0 && [...numC.values()].filter(v => !v.bullet).map(v => v.start).join(',') === '1,1,4', JSON.stringify([...numC]))
ok('C2 bullet tanpa startOverride', [...numC.values()].filter(v => v.bullet).every(v => v.start === null) && [...numC.values()].some(v => v.bullet))
ok('C3 blok "Lanjut daftar" memakai numId yang sama (tidak menambah num)', numC.size === 4, String(numC.size))

// ─── D. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nD. Sambungan layar')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
ok('D1 editor menghitung dari pohon + Kata Pengantar TERSIMPAN (sama dgn yang dicetak)',
  /useMemo\(\(\) => lanjutanDaftar\(detail\.tree, detail\.style_config\.kataPengantarHtml\), \[detail\.tree, detail\.style_config\.kataPengantarHtml\]\)/.test(ed))
// Potongan JSX satu komponen: dari tag pembukanya sampai penutup "/>" pertama di tingkat atas.
const tagJsx = (src: string, buka: string) => { const i = src.indexOf(buka); return i < 0 ? '' : src.slice(i, src.indexOf(' />', i) + 3) }
ok('D2 tiap blok menerima lanjutannya sendiri', tagJsx(ed.slice(ed.indexOf('selected.blocks.map(')), '<BlockEditor block={b}').includes('lanjutan={lanjutanBlok.get(b.id)}'))
const be = ed.slice(ed.indexOf('function BlockEditor('), ed.indexOf('function GambarEditor('))
ok('D3 centang blok dioper ke editor (centang dilepas = langsung kembali 1)',
  tagJsx(be, '<TiptapNarasi ').includes('lanjutan={lanjutan} continueList={continueList}') && /lanjutan\?: LanjutanBlok/.test(ed))
const dk = tt.slice(tt.indexOf('function dekorLanjut('), tt.indexOf('const LanjutDaftar'))
ok('D4 dekorasi di tiap daftar akar bernomor, nomornya dari mulaiDaftarBlok',
  dk.includes('mulaiDaftarBlok(akar, info?.lanjutan, info?.continueList ?? false)')
  && dk.includes('Decoration.node(pos[i], pos[i] + ukuran[i], { start: String(m) })'), dk.slice(0, 200))
ok('D5 plugin terpasang & disegarkan tiap sambungannya berubah (tanpa memunculkan Simpan / masuk riwayat Undo)',
  /RujukTaut, LanjutDaftar, IndenParagraf\]/.test(tt) && tt.includes('decorations: state => dekorLanjut(state.doc, KUNCI_LANJUT.getState(state))')
  && /editor\.view\.dispatch\(editor\.state\.tr\.setMeta\(KUNCI_LANJUT, nilai\)\.setMeta\(META_SEGAR, true\)\.setMeta\('addToHistory', false\)\);\s*\}, \[editor, kunciLanjutan, continueList\]\);/.test(tt))
ok('D6 tampilan tidak menulis ke isi blok (tak ada start yang disimpan)', !/setNodeMarkup[^;]*start/.test(tt) && !/updateAttributes\('orderedList', \{[^}]*start/.test(tt))

// ─── E. Daftar PERTAMA blok yang bersarang ────────────────────────────────────
// Hitungan sesudah daftar bersarang: blok polos yang menyambung harus memakai nomor yang sama dengan Word.
console.log('\nE. Daftar pertama bersarang')
async function sambungBersarang(htmlA: string, jenis: JenisNomor = 'ol'): Promise<{ editor: number; word: number | null }> {
  const A = n(htmlA)
  const B = n(jenis === 'ola' ? ola('B1') : ol('B1'), true)
  const tree = pohon([[A, B]])
  const editor = lanjutanDaftar(tree).get(B.id)?.[KODE[jenis]] ?? 1
  const word = (await nomorWord(tree)).par.find(p => p.teks === 'B1')?.nomor ?? null
  return { editor, word }
}
const bersarang: [string, string, JenisNomor?][] = [
  ['angka bersarang angka', '<ol><li><p>X</p><ol><li><p>Xa</p></li></ol></li><li><p>Y</p></li></ol>'],
  ['angka bersarang angka, tiap butir bersarang', '<ol><li><p>X</p><ol><li><p>Xa</p></li></ol></li><li><p>Y</p><ol><li><p>Ya</p></li></ol></li></ol>'],
  ['angka bersarang dua tingkat', '<ol><li><p>X</p><ol><li><p>Xa</p><ol><li><p>Xa1</p></li></ol></li></ol></li><li><p>Y</p></li></ol>'],
  ['angka bersarang di butir terakhir', '<ol><li><p>X</p></li><li><p>Y</p><ol><li><p>Ya</p></li></ol></li></ol>'],
  ['angka bersarang bullet', '<ol><li><p>X</p><ul><li><p>Xa</p></li></ul></li><li><p>Y</p></li></ol>'],
  ['angka: butir kosong lalu bersarang', '<ol><li><p></p></li><li><p>X</p><ol><li><p>Xa</p></li></ol></li></ol>'],
  ['huruf bersarang huruf', '<ol type="a"><li><p>X</p><ol type="a"><li><p>Xa</p></li></ol></li><li><p>Y</p></li></ol>', 'ola'],
  ['angka bersarang huruf (sambungannya tetap angka)', '<ol><li><p>X</p><ol type="a"><li><p>Xa</p></li></ol></li><li><p>Y</p></li></ol>'],
]
const salahBersarang: string[] = []
for (const [nama, html, jenis] of bersarang) {
  const h = await sambungBersarang(html, jenis)
  if (h.word === null || h.editor !== h.word) salahBersarang.push(`${nama}: editor ${h.editor}, Word ${h.word}`)
}
ok(`E1 ${bersarang.length} bentuk daftar pertama bersarang: nomor blok penyambung = Word`, salahBersarang.length === 0, salahBersarang.join(' | '))

const bukaDaftar = (j: 'ol' | 'ola' | 'ul') => j === 'ul' ? '<ul>' : j === 'ola' ? '<ol type="a">' : '<ol>'
let acakE = 0
const salahAcakE: string[] = []
for (let i = 0; i < 120; i++) {
  const luar: JenisNomor = peluang(0.25) ? 'ola' : 'ol'
  const dalam = pilih<'ol' | 'ola' | 'ul'>(['ol', 'ola', 'ul'])
  const jumlah = 1 + Math.floor(acak() * 4)
  const posisi = Math.floor(acak() * jumlah)
  let html = bukaDaftar(luar)
  for (let k = 0; k < jumlah; k++) {
    html += `<li><p>${peluang(0.15) ? '' : `X${k}`}</p>`
    if (k === posisi) html += bukaDaftar(dalam) + `<li><p>D${k}</p></li>` + (peluang(0.4) ? `<li><p>D${k}b</p></li>` : '') + `</${dalam === 'ul' ? 'ul' : 'ol'}>`
    html += '</li>'
  }
  html += '</ol>'
  const h = await sambungBersarang(html, luar)
  acakE++
  if (h.word === null || h.editor !== h.word) salahAcakE.push(`dok ${i} (${luar}/${dalam}): editor ${h.editor}, Word ${h.word}`)
}
ok(`E2 ${acakE} daftar pertama bersarang acak: nomor blok penyambung = Word`, salahAcakE.length === 0, salahAcakE.slice(0, 3).join(' | '))

// ─── F. Bentuk daftar bersarang di Word ───────────────────────────────────────
// Dulu: butir yang berisi daftar bersarang KEHILANGAN nomornya, dan butir sesudahnya ikut nomor daftar dalam.
console.log('\nF. Daftar bersarang di Word')
const nomorDari = async (html: string) => (await nomorWord(pohon([[n(html)]]))).par.filter(p => p.nomor !== null || p.teks === 'Tambahan')
const f1 = await nomorDari('<ol><li><p>X</p><ol><li><p>Xa</p></li><li><p>Xb</p></li></ol></li><li><p>Y</p><ol><li><p>Ya</p></li></ol></li><li><p>Z</p></li></ol>')
const tulisF = (ps: typeof f1) => ps.map(p => `${p.teks}=${p.nomor}@${p.ilvl}`).join(' ')
ok('F1 butir induk tetap bernomor, sub-nomor mulai ulang tiap induk, sesudahnya kembali ke nomor induk', tulisF(f1) === 'X=1@0 Xa=1@1 Xb=2@1 Y=2@0 Ya=1@1 Z=3@0', tulisF(f1))
const f2 = await nomorDari('<ul><li><p>U</p><ol><li><p>Ua</p></li></ol></li><li><p>V</p><ol><li><p>Va</p></li></ol></li></ul>')
ok('F2 bersarang beda jenis: tiap daftar dalam mulai dari 1', f2.filter(p => !p.bullet).map(p => `${p.teks}=${p.nomor}@${p.ilvl}`).join(' ') === 'Ua=1@1 Va=1@1', tulisF(f2))
const f3 = await nomorDari('<ol><li><p>X</p><p>Tambahan</p></li><li><p>Y</p></li></ol>')
ok('F3 paragraf kedua butir: tidak menyatu & tidak bernomor, butir berikutnya tetap 2', tulisF(f3) === 'X=1@0 Tambahan=null@null Y=2@0', tulisF(f3))
const blokInduk = n('<ol><li><p>X</p><ol><li><p>Xa</p></li><li><p>Xb</p></li></ol></li></ol>')
const blokSambung = n(ol('S1'), true)
const lanjutBersarang = lanjutanDaftar(pohon([[blokInduk, blokSambung]]))
ok('F4 "Lanjut daftar" menyambung daftar TINGKAT ATAS, bukan daftar dalamnya', lanjutBersarang.get(blokSambung.id)?.['1.'] === 2, JSON.stringify(lanjutBersarang.get(blokSambung.id)))
// Tiptap selalu membungkus <p>, tapi tempelan & berkas lama bisa berisi teks langsung di <li>.
const f5 = await nomorDari('<ol><li>X<ol><li>Xa</li></ol></li><li>Y</li></ol>')
ok('F5 butir tanpa <p> yang berisi daftar bersarang tetap bernomor', tulisF(f5) === 'X=1@0 Xa=1@1 Y=2@0', tulisF(f5))
const sambungDi = async (htmlA: string) => { const r = await sambungBersarang(htmlA); return `${r.editor}/${r.word}` }
const f6 = await sambungDi('<ol><li>X<ol><li>Xa</li></ol></li></ol>')
ok('F6 hitungan editor: butir tanpa <p> berdaftar-anak memakan satu nomor = Word', f6 === '2/2', f6)
const f7 = await sambungDi('<ol><li><p>X</p><p>Tambahan</p></li></ol>')
ok('F7 hitungan editor: butir dua paragraf memakan SATU nomor = Word', f7 === '2/2', f7)
const { mulai: numF } = await nomorWord(pohon([[n('<ol><li><p>U</p><ol start="3"><li><p>Ua</p></li></ol></li></ol>')]]))
ok('F8 bersarang ber-start: startOverride di tingkatnya sendiri (kalau di tingkat 0, Word melanjutkan hitungan)',
  [...numF.values()].some(v => v.ilvl === 1 && v.start === 3), JSON.stringify([...numF]))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join('; ')); process.exit(1) }
