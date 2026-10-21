// scripts/test-lkjip-tabel-bc.mts — tabel LKJIP ala Excel Tahap B & C + nomor per BAB/rujukan silang (§12.5).
// Konsep: docs/CONCEPT-lkjip-tabel-excel.md §15
//
// A: format baru (miring, garis bawah, warna huruf, Alt+Enter) sampai Word & papan klip · B: TSV ala Excel
// C: rumus relatif · D: isi-seret · E: bilah status · F: Σ AutoSum · G: kuas format · H: tempel nilai
// I: tempel HTML dari Excel/Word/Google Sheets/PRIMA · J: tempel menembus gabungan · K: urutkan · L: cari & ganti
// M: templat berkepala bertingkat · N: nomor per BAB & rujukan silang (Word) · O: Pulihkan versi memetakan rujukan
// P: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-tabel-bc.mts

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import {
  normalizeCell, extractRange, tanpaFormat, rangeToTSV, parseTSV, geserRumusRelatif, deretIsi, isiSeret,
  nilaiAngkaSel, ringkasBlok, autoJumlah, tempelFormat, nilaiSaja, tempelNilai, htmlKeSel, angkaDariTempelan, angkaInggrisKeId, pasteRange,
  ambilBlok, lepasGabunganDi, urutkanBlok, cariSel, gantiSemua, gantiDiSel, kepalaBertingkat, blokKeHtml, displayValue, sanitizeRows,
  formatSel, type TabelCell,
} from '../lib/lkjip/tabel'
import { TabelPayloadSchema, NarasiPayloadSchema, StyleConfigSchema, DEFAULT_STYLE, sanitizeNarasiHtml } from '../lib/lkjip/schemas'
import { buildTabelXml, narasiToXml, runSel, entriDaftar, rakitDocx, namaPenanda } from '../lib/lkjip/docgen'
import { nomorObjek, sebutObjek, daftarObjekRujukan, rujukanDiHtml, type SectionNode, type BlockNode } from '../lib/lkjip/numbering'
import { kumpulkanRujukanPutus } from '../lib/lkjip/kesegaran'
import { DAFTAR_TEMPLAT } from '../lib/lkjip/sumber/templat'
import { DAFTAR_SUMBER } from '../lib/lkjip/sumber'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* versi.ts hanya butuh env saat kueri; bagian O murni */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const kode = (p: string) => readFileSync(p, 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
function badan(src: string, penanda: string): string {
  const i = src.indexOf(penanda)
  if (i < 0) return ''
  const buka = src.indexOf('{', i + penanda.length)
  let dalam = 0
  for (let j = buka; j >= 0 && j < src.length; j++) {
    if (src[j] === '{') dalam++
    else if (src[j] === '}' && --dalam === 0) return src.slice(buka, j + 1)
  }
  return ''
}
const sel = (v: string, x: Partial<TabelCell> = {}): TabelCell => ({ v, ...x })
const baris = (...v: string[]) => v.map(s => sel(s))
const nilai = (rows: TabelCell[][]) => rows.map(r => r.map(c => (c.h ? '·' : c.v)).join('|')).join(' / ')
const semua = (k: { r1: number; c1: number; r2: number; c2: number }) => k

// ─── A. Format baru sampai Word & papan klip ──────────────────────────────────
console.log('\nA. Miring, garis bawah, warna huruf, baris baru di dalam sel')
ok('A1 normalizeCell membaca i/u/fc; warna tak sah dibuang; huruf kecil dijadikan besar',
  JSON.stringify(normalizeCell({ v: 'a', i: true, u: true, fc: 'c00000' })) === JSON.stringify({ v: 'a', i: true, u: true, fc: 'C00000' })
  && normalizeCell({ v: 'a', i: 'ya', fc: 'merah' }).i === undefined && normalizeCell({ v: 'a', fc: 'merah' }).fc === undefined)
ok('A2 ikut disalin (extractRange) dan dibuang "Hapus format"',
  extractRange([[sel('a', { i: true, u: true, fc: 'C00000', b: true })]], 0, 0, 0, 0)[0][0].fc === 'C00000'
  && tanpaFormat(sel('a', { i: true, u: true, fc: 'C00000' })).fc === undefined && tanpaFormat(sel('a', { i: true })).i === undefined)
const skema = TabelPayloadSchema.parse({ kolom: ['A'], rows: [[{ v: 'x\ny', i: true, u: true, fc: '0070C0' }]] })
const selSkema = skema.rows[0][0] as TabelCell
ok('A3 CellSchema menyimpan i/u/fc & baris baru (Zod membuang kunci tak dikenal)', selSkema.i === true && selSkema.u === true && selSkema.fc === '0070C0' && selSkema.v === 'x\ny',
  JSON.stringify(selSkema))
ok('A4 TabelPayloadSchema menolak warna huruf bukan hex', !TabelPayloadSchema.safeParse({ kolom: ['A'], rows: [[{ v: 'x', fc: 'merah' }]] }).success)
const run = runSel('a\nb', 'Arial', 22, { b: true, i: true, u: true, fc: 'C00000' })
ok('A5 Word: tebal, miring, garis bawah, warna — urutan anak rPr menurut skema', run.includes('<w:b/><w:i/><w:u w:val="single"/><w:color w:val="C00000"/><w:sz w:val="22"/>'), run)
ok('A6 Word: baris baru di dalam sel → <w:br/> (bukan teks bersambung)', run.includes('<w:t xml:space="preserve">a</w:t><w:br/><w:t xml:space="preserve">b</w:t>'))
const xmlTabel = buildTabelXml({ judul: 'T', kolom: ['A'], headerRows: 1, rows: [[sel('A')], [sel('satu\ndua', { i: true, fc: '00B050' })]] }, 'Arial', 24, 'EDEDED')
ok('A7 buildTabelXml memakai format sel', xmlTabel.includes('<w:i/>') && xmlTabel.includes('<w:color w:val="00B050"/>') && xmlTabel.includes('satu</w:t><w:br/>'))
const htmlA = blokKeHtml([[sel('baris\nkedua', { i: true, u: true, fc: 'C00000' })]], semua({ r1: 0, c1: 0, r2: 0, c2: 0 }), () => 'baris\nkedua')
ok('A8 salin ke Excel/Word: miring, garis bawah, warna; baris baru tetap SATU sel', htmlA.includes('font-style:italic') && htmlA.includes('text-decoration:underline')
  && htmlA.includes('color:#C00000') && htmlA.includes('baris<br style="mso-data-placement:same-cell">kedua'), htmlA)

// ─── B. TSV ala Excel ─────────────────────────────────────────────────────────
console.log('\nB. TSV ala Excel (kutip, baris baru, tab di dalam sel)')
const tsvSumber = [[sel('a\nb'), sel('kata "kutip"')], [sel('x\ty'), sel('"awal kutip')]]
const tsv = rangeToTSV(tsvSumber)
ok('B1 sel berbaris baru / tab / berawalan kutip dibungkus "…", kutip digandakan; kutip di tengah dibiarkan',
  tsv === '"a\nb"\tkata "kutip"\n"x\ty"\t"""awal kutip"', JSON.stringify(tsv))
ok('B2 bolak-balik rangeToTSV → parseTSV utuh', nilai(parseTSV(tsv)) === nilai(tsvSumber), nilai(parseTSV(tsv)))
ok('B3 TSV dari Excel: sel "…" berbaris baru = satu sel; baris akhir kosong dibuang',
  nilai(parseTSV('Uraian\t"satu\r\ndua"\r\nx\ty\r\n')) === 'Uraian|satu\ndua / x|y')
ok('B4 kutip tanpa pasangan = teks biasa (bukan menelan baris berikutnya)', nilai(parseTSV('5" layar\tb\nc\td')) === '5" layar|b / c|d')
ok('B5 baris kosong di tengah tetap ada; teks kosong = tak ada baris', nilai(parseTSV('a\n\nb')) === 'a /  / b' && parseTSV('').length === 0 && parseTSV('\n').length === 0)
ok('B6 kutip pembuka yang penutupnya tidak diikuti tab/baris baru = teks biasa', nilai(parseTSV('"abc" def\tx')) === '"abc" def|x', nilai(parseTSV('"abc" def\tx')))

// ─── C. Rumus relatif ─────────────────────────────────────────────────────────
console.log('\nC. Rumus disalin/diisi-seret: rujukan relatif bergeser, $ tetap')
ok('C1 =B2*C2 turun satu → =B3*C3', geserRumusRelatif('=B2*C2', 1, 0) === '=B3*C3')
ok('C2 $B$2 tetap, C2 bergeser; B$2 hanya kolomnya; $B2 hanya barisnya',
  geserRumusRelatif('=$B$2*C2', 1, 1) === '=$B$2*D3' && geserRumusRelatif('=B$2', 3, 1) === '=C$2' && geserRumusRelatif('=$B2', 3, 1) === '=$B5')
ok('C3 rentang ikut bergeser (ke kanan)', geserRumusRelatif('=SUM(B2:B4)', 0, 1) === '=SUM(C2:C4)')
ok('C4 rujukan jatuh sebelum A1 → #REF!', geserRumusRelatif('=A1+B2', -1, 0) === '=#REF!+B1' && geserRumusRelatif('=SUM(A1:A3)', 0, -1) === '=SUM(#REF!)')
ok('C5 bukan rumus / tanpa geser tidak disentuh; nama fungsi bukan rujukan', geserRumusRelatif('B2', 1, 0) === 'B2' && geserRumusRelatif('=SUM(B2)', 0, 0) === '=SUM(B2)'
  && geserRumusRelatif('=ROUND(B2,0)', 1, 0) === '=ROUND(B3,0)')

// ─── D. Isi-seret ─────────────────────────────────────────────────────────────
console.log('\nD. Isi-seret (fill handle)')
const deret = (v: string[], n = 2) => { const f = deretIsi(v.map(x => sel(x))); return f ? Array.from({ length: n }, (_, i) => f(i + 1)) : null }
ok('D1 angka berpola: 1, 2 → 3, 4', JSON.stringify(deret(['1', '2'])) === '["3","4"]')
ok('D2 ribuan tetap bergaya ribuan; tahun tetap tanpa titik; desimal koma',
  JSON.stringify(deret(['1.250.000', '2.500.000'], 1)) === '["3.750.000"]' && JSON.stringify(deret(['2025', '2026'], 1)) === '["2027"]'
  && JSON.stringify(deret(['0,5', '1'], 1)) === '["1,5"]')
ok('D3 SATU angka disalin, bukan dinaikkan (cara Excel)', deret(['5']) === null)
ok('D4 bulan: Jan → Feb · Desember → Januari · MEI → JUNI · Jan, Mar → Mei',
  JSON.stringify(deret(['Jan'], 2)) === '["Feb","Mar"]' && JSON.stringify(deret(['Desember'], 1)) === '["Januari"]'
  && JSON.stringify(deret(['MEI'], 1)) === '["JUNI"]' && JSON.stringify(deret(['Jan', 'Mar'], 1)) === '["Mei"]')
ok('D5 triwulan: TW I → TW II · TW IV → TW I · Triwulan 2 → Triwulan 3',
  JSON.stringify(deret(['TW I'], 3)) === '["TW II","TW III","TW IV"]' && JSON.stringify(deret(['TW IV'], 1)) === '["TW I"]' && JSON.stringify(deret(['Triwulan 2'], 1)) === '["Triwulan 3"]')
ok('D6 teks berakhiran angka: Sasaran 1 → Sasaran 2 · Lampiran 01 → Lampiran 02',
  JSON.stringify(deret(['Sasaran 1'], 1)) === '["Sasaran 2"]' && JSON.stringify(deret(['Lampiran 01'], 1)) === '["Lampiran 02"]')
ok('D7 bukan deret (campur, kosong, rumus) → null = disalin berulang', deret(['a', '1']) === null && deret(['', '1']) === null && deret(['=A1']) === null && deret(['1', '2', '4']) === null)
const seret0 = [baris('No', 'Uraian', 'Nilai', 'Jumlah'), [sel('1'), sel('Sasaran 1'), sel('10', { b: true }), sel('=C2*2')], [sel('2'), sel('x'), sel('20', { b: true }), sel('=$C$2+C3')], baris('', '', '', ''), baris('', '', '', '')]
const h1 = isiSeret(seret0, { r1: 1, c1: 0, r2: 2, c2: 3 }, { r1: 1, c1: 0, r2: 4, c2: 3 })
ok('D8 ke bawah: No 1,2 → 3,4; teks campur disalin berulang; angka 10,20 → 30,40 dgn format ikut',
  'rows' in h1 && nilai(h1.rows.slice(3)) === '3|Sasaran 1|30|=C4*2 / 4|x|40|=$C$2+C5' && h1.rows[3][2].b === true, 'rows' in h1 ? nilai(h1.rows.slice(3)) : h1.galat)
ok('D9 rumus yang disalin berulang bergeser sejauh barisnya (dua baris contoh → +2)', 'rows' in h1 && displayValue(h1.rows, 3, 3) === '60' && displayValue(h1.rows, 4, 3) === '50')
const kanan0 = [baris('TW I', '', '', ''), baris('=A1', '', '', '')]
const h2 = isiSeret(kanan0, { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 1, c2: 3 })
ok('D10 ke kanan: TW I → II, III, IV; =A1 → =B1, =C1, =D1', 'rows' in h2 && nilai(h2.rows) === 'TW I|TW II|TW III|TW IV / =A1|=B1|=C1|=D1', 'rows' in h2 ? nilai(h2.rows) : '')
const gab0 = sanitizeRows([[sel('1'), sel('a', { cs: 2 }), sel('')], baris('2', '', ''), baris('', '', '')], 3)
const h3 = isiSeret(gab0, { r1: 0, c1: 0, r2: 1, c2: 1 }, { r1: 0, c1: 0, r2: 2, c2: 1 })
ok('D11 melewati sel gabungan ditolak dengan alasan', 'galat' in h3 && /gabungan/.test(h3.galat))
const h4 = isiSeret([baris('1'), baris('2'), baris(''), baris('')], { r1: 0, c1: 0, r2: 1, c2: 0 }, { r1: 0, c1: 0, r2: 3, c2: 0 }, r => r !== 2)
ok('D12 sel yang tidak boleh diisi (badan tertaut, kolom No.) dilewati — nomornya tetap urut', 'rows' in h4 && nilai(h4.rows) === '1 / 2 /  / 4')
const h5 = isiSeret([baris('x'), baris('')], { r1: 0, c1: 0, r2: 0, c2: 0 }, { r1: 0, c1: 0, r2: 0, c2: 0 })
ok('D13 tanpa perpanjangan = tabel tetap', 'rows' in h5 && nilai(h5.rows) === 'x / ')

// ─── E. Bilah status ──────────────────────────────────────────────────────────
console.log('\nE. Bilah status: Jumlah · Rata-rata · Banyak')
const st = [[sel('Uraian'), sel('1.250.000'), sel('7,5'), sel('Rp 2.000'), sel('85,5%'), sel('0.125', { nf: 'pct' }), sel('=B1+C1'), sel('=1/0'), sel('—'), sel('0101'), sel('')]]
ok('E1 nilaiAngkaSel: teks/kode/galat/kosong = null; Rp & % dibaca; persen berformat ×100',
  nilaiAngkaSel(st, 0, 0) === null && nilaiAngkaSel(st, 0, 1) === 1250000 && nilaiAngkaSel(st, 0, 2) === 7.5 && nilaiAngkaSel(st, 0, 3) === 2000
  && nilaiAngkaSel(st, 0, 4) === 85.5 && nilaiAngkaSel(st, 0, 5) === 12.5 && nilaiAngkaSel(st, 0, 6) === 1250007.5 && nilaiAngkaSel(st, 0, 7) === null
  && nilaiAngkaSel(st, 0, 8) === null && nilaiAngkaSel(st, 0, 9) === null && nilaiAngkaSel(st, 0, 10) === null)
const rk = ringkasBlok(st, { r1: 0, c1: 0, r2: 0, c2: 10 })
ok('E2 ringkasBlok: Banyak = sel berisi (10), Jumlah & Rata-rata hanya dari 6 sel angka',
  rk.banyak === 10 && rk.banyakAngka === 6 && rk.jumlah === 2502113 && rk.rataRata === 417018.8333333333, JSON.stringify(rk))
ok('E3 blok tanpa angka: rata-rata null (bilah tidak menulis "NaN")', ringkasBlok([[sel('a'), sel('b')]], { r1: 0, c1: 0, r2: 0, c2: 1 }).rataRata === null)

// ─── F. Σ AutoSum ─────────────────────────────────────────────────────────────
console.log('\nF. Σ AutoSum')
// Kepala BERANGKA (judul tahun) — tanpa itu deret berhenti sendiri di teks judul dan pagar kepala tak teruji.
const as0 = [baris('Uraian', '2025', '2026'), baris('a', '1.250.000', '1'), baris('b', '7,5', '2'), baris('Jumlah', '', '')]
const f1 = autoJumlah(as0, { r1: 3, c1: 1, r2: 3, c2: 2 }, 1)
ok('F1 sel kosong di bawah deret angka → =SUM bersambung, berhenti di KEPALA (bukan menjumlah judul)',
  f1.rows[3][1].v === '=SUM(B2:B3)' && f1.rows[3][2].v === '=SUM(C2:C3)' && displayValue(f1.rows, 3, 1) === '1.250.007,5', `${f1.rows[3][1].v} ${f1.rows[3][2].v}`)
const f2 = autoJumlah([baris('a', '1'), baris('b', 'teks'), baris('c', '3'), baris('d', '')], { r1: 3, c1: 1, r2: 3, c2: 1 }, 0)
ok('F2 deret berhenti di sel teks', f2.rows[3][1].v === '=SUM(B3:B3)', f2.rows[3][1].v)
const f3 = autoJumlah([baris('1', '2', '')], { r1: 0, c1: 2, r2: 0, c2: 2 }, 0)
ok('F3 tak ada angka di atas → deret di kiri', f3.rows[0][2].v === '=SUM(A1:B1)', f3.rows[0][2].v)
const f4 = autoJumlah(as0, { r1: 1, c1: 1, r2: 2, c2: 2 }, 1)
ok('F4 blok berisi angka seluruhnya → jumlahnya di sel kosong di bawah tiap kolom', f4.sel.length === 2 && f4.rows[3][1].v === '=SUM(B2:B3)' && f4.rows[3][2].v === '=SUM(C2:C3)')
const f5 = autoJumlah([baris('1', '2', '3', '')], { r1: 0, c1: 0, r2: 0, c2: 2 }, 0)
ok('F5 satu baris angka → jumlahnya di kanan', f5.rows[0][3].v === '=SUM(A1:C1)')
const f6 = autoJumlah([baris('a', 'b'), baris('', '')], { r1: 1, c1: 0, r2: 1, c2: 0 }, 0)
ok('F6 tanpa angka → tidak menulis apa pun', f6.sel.length === 0 && f6.rows[1][0].v === '')
const f7 = autoJumlah(as0, { r1: 3, c1: 1, r2: 3, c2: 2 }, 1, (_r, c) => c !== 2)
ok('F7 sel yang tidak boleh diisi dilewati; sel berisi tidak ditimpa', f7.rows[3][2].v === '' && autoJumlah(f1.rows, { r1: 3, c1: 1, r2: 3, c2: 1 }, 1).sel.length === 0)
const f8 = autoJumlah([baris('Judul', 'Teks'), baris('x', 'y'), baris('p', 'q'), baris('', '')], { r1: 1, c1: 0, r2: 2, c2: 1 }, 0)
ok('F8 blok TEKS penuh tidak diberi =SUM 0 di bawahnya', f8.sel.length === 0)

// ─── G. Kuas format ───────────────────────────────────────────────────────────
console.log('\nG. Kuas format')
const pola = [[sel('', { b: true, bg: 'FFF2CC' }), sel('', { i: true, nf: 'rp' })]]
const kg = tempelFormat([baris('a', 'b', 'c'), [sel('d', { cs: 2 }), sel('', { h: true }), sel('f', { u: true })]].map(r => r.map(c => ({ ...c }))), { r1: 0, c1: 0, r2: 1, c2: 2 }, pola)
ok('G1 pola diulang menutup blok; isi tetap', kg[0][0].b && kg[0][0].bg === 'FFF2CC' && kg[0][1].i && kg[0][1].nf === 'rp' && kg[0][2].b && kg[0][2].v === 'c')
ok('G2 format lama sel tujuan DIGANTI (bukan ditumpuk); gabungan & sel tertutup tetap', kg[1][2].u === undefined && kg[1][2].b === true && kg[1][0].cs === 2 && kg[1][1].h === true && kg[1][1].b === undefined)
const kg2 = tempelFormat([baris('a', 'b')], { r1: 0, c1: 0, r2: 0, c2: 1 }, pola, (_r, c) => c === 0)
ok('G3 sel terkunci tidak disentuh', kg2[0][0].b === true && kg2[0][1].i === undefined)
ok('G4 formatSel menyalin SEMUA kunci format (dec 0 ikut, isi & gabungan tidak)',
  JSON.stringify(formatSel(sel('x', { cs: 2, h: true, dec: 0, nf: 'num', fc: 'C00000', rot: true }))) === JSON.stringify({ nf: 'num', dec: 0, fc: 'C00000', rot: true }))

// ─── H. Tempel nilai ──────────────────────────────────────────────────────────
console.log('\nH. Tempel nilai saja (Ctrl+Shift+V)')
const nv = [[sel('1.250.000'), sel('=A1*2'), sel('0.125', { nf: 'pct' }), sel('=1/0'), sel('teks', { b: true })]]
ok('H1 nilaiSaja: rumus → hasilnya (gaya Indonesia), berformat → angkanya, galat → kosong, teks apa adanya',
  nilaiSaja(nv, 0, 0) === '1.250.000' && nilaiSaja(nv, 0, 1) === '2.500.000' && nilaiSaja(nv, 0, 2) === '0,125' && nilaiSaja(nv, 0, 3) === '' && nilaiSaja(nv, 0, 4) === 'teks')
const tujuan = [[sel('', { nf: 'rp', b: true }), sel('lama', { i: true }), sel('x', { cs: 2 }), sel('', { h: true })]]
const tn = tempelNilai(tujuan, 0, 0, [['1.250.000', 'baru', 'y', 'z']], 4)
ok('H2 format TUJUAN tetap; angka di sel Rupiah disimpan angka mesin; sel tertutup gabungan dilewati',
  tn[0][0].v === '1250000' && tn[0][0].nf === 'rp' && tn[0][0].b === true && tn[0][1].v === 'baru' && tn[0][1].i === true && tn[0][2].v === 'y' && tn[0][3].h === true && tn[0][3].v === '')
const tn2 = tempelNilai([baris('a', 'b')], 0, 0, [['=A1', 'ok']], 2, (_r, _c, t) => !t.startsWith('='))
ok('H3 pagar per teks: rumus bisa ditolak (kolom isian tangan tertaut)', tn2[0][0].v === 'a' && tn2[0][1].v === 'ok')
ok('H4 tempelan lebih panjang dari tabel menambah baris', tempelNilai([baris('a')], 0, 0, [['1'], ['2']], 1).length === 2)

// ─── I. Tempel HTML ───────────────────────────────────────────────────────────
console.log('\nI. Tempel dari Excel / Word / Google Sheets (gabungan & format ikut)')
const excelHtml = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><style>
<!--table
	{mso-displayed-decimal-separator:"\\.";}
td
	{padding-top:1px; color:windowtext; font-size:11.0pt; font-weight:400; font-style:normal; text-decoration:none; text-align:general; vertical-align:bottom; mso-number-format:General;}
.xl65
	{font-weight:700; text-align:center; vertical-align:middle; background:#FFF2CC; mso-pattern:black none;}
.xl66
	{mso-number-format:"\\#\\,\\#\\#0";}
.xl67
	{mso-number-format:0%; font-style:italic; color:red;}
.xl68
	{text-decoration:underline; text-underline-style:single; mso-rotate:90;}
-->
</style></head><body>
<table border=0 cellpadding=0 cellspacing=0 width=192>
 <tr height=20>
  <td colspan=2 height=20 class=xl65 width=128>Realisasi</td>
  <td rowspan=2 class=xl68 width=64>Ket</td>
 </tr>
 <tr height=20>
  <td height=20 class=xl65>Rp</td>
  <td class=xl65>%</td>
 </tr>
 <tr height=20>
  <td height=20 class=xl66 align=right x:num="1250000">1,250,000</td>
  <td class=xl67 align=right x:num="0.125">13%</td>
  <td>baris<br style='mso-data-placement:same-cell' />dua &amp; tiga</td>
 </tr>
 <tr height=20>
  <td x:num="2026">2026</td><td x:num="57755803079.01">57,755,803,079.01</td><td x:str>0101</td>
 </tr>
</table></body></html>`
const ex = htmlKeSel(excelHtml)
ok('I1 Excel: gabungan colspan/rowspan dibaca, sel sesudah rowspan bergeser ke kolom yang benar',
  !!ex && ex.length === 4 && ex[0][0].cs === 2 && ex[0][2].rs === 2 && ex[1][2].h === true && ex[1][0].v === 'Rp' && ex[1][1].v === '%', ex ? nilai(ex) : 'null')
ok('I2 Excel: gaya lewat KELAS (<style>) — tebal, rata & tengah vertikal, latar; teks tegak & garis bawah',
  !!ex && ex[0][0].b === true && ex[0][0].al === 'center' && ex[0][0].va === 'middle' && ex[0][0].bg === 'FFF2CC' && ex[0][2].rot === true && ex[0][2].u === true, ex ? JSON.stringify(ex[0]) : '')
ok('I3 Excel bersetelan Inggris: x:num → angka gaya Indonesia ("1,250,000" dulu terbaca 1,25)',
  !!ex && ex[2][0].v === '1.250.000' && ex[3][1].v === '57.755.803.079,01' && ex[3][0].v === '2026' && ex[3][2].v === '0101', ex ? nilai(ex.slice(2)) : '')
// Tanpa pernyataan pemisah: hanya x:num yang bisa menerjemahkan angkanya (Excel lama).
const xnumSaja = htmlKeSel('<table><tr><td x:num="0.125">12.5%</td><td x:num="-1250.5">(1,250.50)</td></tr></table>')
ok('I3b x:num tanpa pernyataan pemisah: "12.5%" → "12,5%", "(1,250.50)" → "-1.250,50"',
  !!xnumSaja && xnumSaja[0][0].v === '12,5%' && xnumSaja[0][1].v === '-1.250,50', xnumSaja ? nilai(xnumSaja) : '')
ok('I4 persen x:num pecahan → seperti TAMPIL ("13%"), miring & warna merah dari kelas',
  !!ex && ex[2][1].v === '13%' && ex[2][1].i === true && ex[2][1].fc === 'FF0000', ex ? JSON.stringify(ex[2][1]) : '')
ok('I5 baris baru di dalam sel (mso-data-placement) & entitas', !!ex && ex[2][2].v === 'baris\ndua & tiga' && !ex[2][2].b)
ok('I6 rata BAWAH bawaan Excel tidak dibawa (bawaan tabel dokumen rata atas); warna windowtext bukan warna',
  !!ex && ex[2][2].va === undefined && ex[1][0].va === 'middle' && ex[2][2].fc === undefined)
const wordHtml = `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
 <tr style='mso-yfti-irow:0'>
  <td width=200 valign=top style='width:150.0pt;border:solid windowtext 1.0pt;padding:0cm 5.4pt 0cm 5.4pt'>
  <p class=MsoNormal><b><span lang=IN>Uraian</span></b><o:p></o:p></p>
  </td>
  <td width=100 valign=middle style='width:75.0pt;background:#D9E2F3'><p class=MsoNormal align=center style='text-align:center'><span lang=IN>Nilai&nbsp;(Rp)</span></p></td>
 </tr>
 <tr>
  <td><p class=MsoNormal>Baris satu yang
  panjang</p><p class=MsoNormal>baris dua</p></td>
  <td><p class=MsoNormal><i>miring</i> biasa</p></td>
 </tr>
</table>`
const wd = htmlKeSel(wordHtml)
ok('I7 Word: <b> pembungkus seluruh isi = tebal; paragraf = baris baru; baris sumber yang terpotong = spasi',
  !!wd && wd[0][0].v === 'Uraian' && wd[0][0].b === true && wd[1][0].v === 'Baris satu yang panjang\nbaris dua', wd ? nilai(wd) : '')
ok('I8 Word: latar & tengah vertikal dari atribut sel; miring SEBAGIAN tidak membuat seluruh sel miring',
  !!wd && wd[0][1].bg === 'D9E2F3' && wd[0][1].va === 'middle' && wd[0][1].v === 'Nilai (Rp)' && wd[1][1].i === undefined && wd[1][1].v === 'miring biasa')
const gsHtml = `<google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style><table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1"><colgroup><col width="100"/><col width="100"/></colgroup><tbody><tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;font-weight:bold;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Total&quot;}">Total</td><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:1250000.5}">1,250,000.50</td></tr></tbody></table>`
const gs = htmlKeSel(gsHtml)
ok('I9 Google Sheets: data-sheets-value → angka gaya Indonesia, tebal & rata kanan sebaris',
  !!gs && gs.length === 1 && gs[0][0].v === 'Total' && gs[0][0].b === true && gs[0][1].v === '1.250.000,50' && gs[0][1].al === 'right' && gs[0][0].va === undefined, gs ? JSON.stringify(gs) : '')
const prima = sanitizeRows([[sel('Kepala', { cs: 2, b: true, bg: 'EDEDED' }), sel('', { h: true })], [sel('1250000', { nf: 'rp', i: true, fc: 'C00000' }), sel('a\nb', { u: true })]], 2)
const primaHtml = blokKeHtml(prima, { r1: 0, c1: 0, r2: 1, c2: 1 }, (r, c) => displayValue(prima, r, c))
const pr = htmlKeSel(primaHtml)
ok('I10 bolak-balik salinan PRIMA sendiri: gabungan, tebal, latar, miring, warna, garis bawah, baris baru, Rupiah',
  !!pr && pr[0][0].cs === 2 && pr[0][0].b && pr[0][0].bg === 'EDEDED' && pr[1][0].v === 'Rp 1.250.000' && pr[1][0].i && pr[1][0].fc === 'C00000'
  && pr[1][1].v === 'a\nb' && pr[1][1].u === true, pr ? JSON.stringify(pr) : '')
ok('I11 bukan tabel → null (TSV yang dipakai)', htmlKeSel('<p>halo</p>') === null && htmlKeSel('') === null)
ok('I12 angkaDariTempelan: Rp ikut, desimal mengikuti tampilan, negatif',
  angkaDariTempelan(1250000.5, 'Rp 1,250,000.50') === 'Rp 1.250.000,50' && angkaDariTempelan(-1250, '(1,250)') === '-1.250' && angkaDariTempelan(0.3333, '0.33') === '0,33')
// Papan klip ASLI (scripts/fixtures/lkjip-papan-klip): disalin lewat COM dari Excel 365 & Word 365 di laptop
// pengembang 2026-10-20 — Excel ini TIDAK menulis x:num; teks tampilnya satu-satunya bahan angka.
const fixture = (n: string) => readFileSync(new URL(`./fixtures/lkjip-papan-klip/${n}`, import.meta.url), 'utf8')
const xid = htmlKeSel(fixture('excel-id.html')), xen = htmlKeSel(fixture('excel-en.html')), wrd = htmlKeSel(fixture('word.html'))
ok('I13 Excel asli (pemisah Indonesia): 4×3, gabungan A1:B1 & C1:C2, kepala tebal-tengah-kuning, "Ket" tegak bergaris bawah',
  !!xid && xid.length === 4 && xid[0].length === 3 && xid[0][0].cs === 2 && xid[0][2].rs === 2 && xid[1][2].h === true
  && xid[0][0].b && xid[0][0].al === 'center' && xid[0][0].va === 'middle' && xid[0][0].bg === 'FFF2CC' && xid[0][2].rot && xid[0][2].u, xid ? JSON.stringify(xid[0]) : 'null')
ok('I14 Excel asli: angka terbaca benar, 13% miring merah, baris baru, kode "0101" tetap teks, warna "black" bawaan bukan warna',
  !!xid && nilaiAngkaSel(xid, 2, 0) === 1250000 && nilaiAngkaSel(xid, 3, 1) === 57755803079.01 && xid[2][1].v === '13%' && xid[2][1].i && xid[2][1].fc === 'FF0000'
  && xid[2][2].v === 'baris\ndua & tiga' && xid[3][2].v === '0101' && xid[3][0].v === '2026' && xid[2][2].fc === undefined, xid ? nilai(xid) : '')
ok('I15 Excel asli bersetelan INGGRIS: "1,250,000" → "1.250.000", "57,755,803,079.01" → "57.755.803.079,01" (dulu 1,25 & 57,755)',
  !!xen && xen[2][0].v === '1.250.000' && xen[3][1].v === '57.755.803.079,01' && nilaiAngkaSel(xen, 3, 1) === 57755803079.01 && xen[2][1].v === '13%' && xen[3][0].v === '2026',
  xen ? nilai(xen) : '')
ok('I16 Word asli: rowspan di KOLOM PERTAMA menggeser sel baris berikutnya; tebal lewat <b>; latar; paragraf = baris baru; miring',
  !!wrd && wrd.length === 3 && wrd[0][0].v === 'Uraian' && wrd[0][0].rs === 2 && wrd[0][0].b && wrd[0][1].cs === 2 && wrd[0][1].v === 'Realisasi' && wrd[0][1].b && wrd[0][1].bg === 'FFF2CC'
  && wrd[1][0].h === true && wrd[1][1].v === 'Rp' && wrd[1][2].v === '%' && wrd[2][0].v === 'Baris satu\nbaris dua' && wrd[2][2].v === '12,5%' && wrd[2][2].i === true
  && nilaiAngkaSel(wrd, 2, 1) === 1250000, wrd ? nilai(wrd) : 'null')
ok('I17 angkaInggrisKeId: hanya angka bergaya Inggris yang dibalik; versi, daftar, teks dibiarkan',
  angkaInggrisKeId('1,250,000') === '1.250.000' && angkaInggrisKeId('-1,250.5') === '-1.250,5' && angkaInggrisKeId('12.5%') === '12,5%' && angkaInggrisKeId('Rp 2,000') === 'Rp 2.000'
  && angkaInggrisKeId('2026') === '2026' && angkaInggrisKeId('1,2,3') === '1,2,3' && angkaInggrisKeId('v1.2.3') === 'v1.2.3' && angkaInggrisKeId('Uraian') === 'Uraian')

// ─── J. Tempel menembus / membawa gabungan ────────────────────────────────────
console.log('\nJ. Tempel & gabungan')
const pj = pasteRange(sanitizeRows([[sel('Judul', { cs: 3 }), sel(''), sel('')], baris('a', 'b', 'c')], 3), 0, 1, [[sel('x')]], 3)
ok('J1 tempel ke sel yang tertutup gabungan dari LUAR blok: gabungan dilepas, isinya TAMPIL (dulu tersembunyi)',
  pj[0][0].cs === undefined && pj[0][1].h === undefined && pj[0][1].v === 'x' && pj[0][0].v === 'Judul')
const pj2 = pasteRange([baris('a', 'b', 'c'), baris('d', 'e', 'f')], 0, 0, sanitizeRows([[sel('G', { cs: 2 }), sel('')]], 2), 3)
ok('J2 gabungan dari tempelan ikut', pj2[0][0].cs === 2 && pj2[0][1].h === true && pj2[0][2].v === 'c')
const ab = ambilBlok(sanitizeRows([[sel('A', { cs: 3, rs: 2 }), sel(''), sel('')], baris('', '', ''), baris('x', 'y', 'z')], 3), { r1: 0, c1: 0, r2: 1, c2: 1 })
ok('J3 salin internal membawa gabungan, dipangkas ke tepi blok', ab[0][0].cs === 2 && ab[0][0].rs === 2 && ab[1][1].h === true && ab.length === 2 && ab[0].length === 2)
ok('J4 lepasGabunganDi tanpa gabungan = larik yang sama (tanpa salinan)', (() => { const r = [baris('a')]; return lepasGabunganDi(r, { r1: 0, c1: 0, r2: 0, c2: 0 }, 1) === r })())

// ─── K. Urutkan ───────────────────────────────────────────────────────────────
console.log('\nK. Urutkan blok')
const ur0 = [baris('Nama', 'Nilai', 'Dua kali'), [sel('c'), sel('10'), sel('=B2*2')], [sel('a'), sel('2'), sel('=B3*2')], [sel('b'), sel(''), sel('=B4*2')], [sel('d'), sel('1.000'), sel('=B5*2')]]
const semuaBadan = { r1: 1, c1: 0, r2: 4, c2: 2 }
const k1 = urutkanBlok(ur0, semuaBadan, 1, false, 1)
ok('K1 A→Z menurut angka: 2 < 10 < 1.000; kosong di bawah; kepala tetap', 'rows' in k1 && nilai(k1.rows).startsWith('Nama|Nilai|Dua kali / a|2|') && k1.rows.slice(1).map(r => r[0].v).join('') === 'acdb',
  'rows' in k1 ? nilai(k1.rows) : k1.galat)
ok('K2 rumus yang berpindah ikut barisnya (=B3*2 di baris 3 pindah ke baris 2 → =B2*2, nilainya tetap 4)',
  'rows' in k1 && k1.rows[1][2].v === '=B2*2' && displayValue(k1.rows, 1, 2) === '4' && displayValue(k1.rows, 3, 2) === '2.000')
const k2 = urutkanBlok(ur0, semuaBadan, 1, true, 1)
ok('K3 Z→A: kosong TETAP di bawah (cara Excel)', 'rows' in k2 && k2.rows.slice(1).map(r => r[0].v).join('') === 'dcab')
const k3 = urutkanBlok([baris('X'), baris('Sasaran 10'), baris('Sasaran 2'), baris('sasaran 1')], { r1: 0, c1: 0, r2: 3, c2: 0 }, 0, false, 1)
ok('K4 teks: urutan bilangan alami & tak peka huruf besar (Sasaran 2 < Sasaran 10)', 'rows' in k3 && nilai(k3.rows) === 'X / sasaran 1 / Sasaran 2 / Sasaran 10')
// JUMLAH sengaja jatuh di DEPAN bila ikut diurut — kalau tidak, hasilnya sama saja dan pagarnya tak teruji.
const k4 = urutkanBlok([baris('H'), baris('z'), baris('y'), baris('JUMLAH')], { r1: 0, c1: 0, r2: 3, c2: 0 }, 0, false, 1, true)
ok('K5 baris JUMLAH (gaya jumlah) tidak ikut diurut', 'rows' in k4 && nilai(k4.rows) === 'H / y / z / JUMLAH')
const k5 = urutkanBlok([baris('H', 'tetap'), baris('b', '1'), baris('a', '2')], { r1: 1, c1: 0, r2: 2, c2: 0 }, 0, false, 1)
ok('K6 hanya kolom BLOK yang berpindah (kolom di luar blok tetap)', 'rows' in k5 && nilai(k5.rows) === 'H|tetap / a|1 / b|2')
const k6 = urutkanBlok(sanitizeRows([baris('H', 'H'), [sel('x', { rs: 2 }), sel('1')], [sel(''), sel('2')]], 2), { r1: 1, c1: 0, r2: 2, c2: 1 }, 1, true, 1)
ok('K7 gabungan antarbaris ditolak dengan alasan', 'galat' in k6 && /gabungan/.test(k6.galat))
ok('K8 kurang dari dua baris badan ditolak', 'galat' in urutkanBlok([baris('H'), baris('a')], { r1: 0, c1: 0, r2: 1, c2: 0 }, 0, false, 1))

// ─── L. Cari & ganti ──────────────────────────────────────────────────────────
console.log('\nL. Cari & ganti')
const cg = [[sel('Apel'), sel('1250000', { nf: 'rp' })], [sel('apel merah'), sel('a.b (c)')], [sel('x', { h: true }), sel('=A1')]]
ok('L1 cari tak peka huruf besar; juga cocok di TAMPILAN angka berformat; sel tertutup dilewati',
  cariSel(cg, 'apel').length === 2 && cariSel(cg, '1.250.000').length === 1 && cariSel(cg, 'x').length === 0 && cariSel(cg, '').length === 0)
ok('L2 tanda regex dicari apa adanya', cariSel(cg, 'a.b (c)').length === 1 && cariSel(cg, '(c)').length === 1 && cariSel(cg, 'b (').length === 1 && cariSel(cg, 'a.b').length === 1)
const gs1 = gantiSemua(cg, 'apel', 'Jeruk')
ok('L3 ganti semua: 2 kecocokan di 2 sel', gs1.n === 2 && gs1.sel === 2 && gs1.rows[0][0].v === 'Jeruk' && gs1.rows[1][0].v === 'Jeruk merah')
const gs2 = gantiSemua(cg, '1.250.000', '2')
ok('L4 cocok hanya di tampilan → tidak diganti, dihitung "dilewati"; tabel tetap larik yang sama', gs2.n === 0 && gs2.ditahan === 1 && gs2.rows === cg)
const gs3 = gantiSemua(cg, 'apel', 'X', (r) => r !== 1)
ok('L5 sel terkunci dilewati & dihitung', gs3.n === 1 && gs3.ditahan === 1 && gs3.rows[1][0].v === 'apel merah')
ok('L6 ganti di sel: "$&" di pengganti tidak diartikan', gantiDiSel('a1a', 'a', '$&').v === '$&1$&')

// ─── M. Templat berkepala bertingkat ──────────────────────────────────────────
console.log('\nM. Templat berkepala bertingkat')
const kb = kepalaBertingkat(['No', 'Indikator', 'TW I', 'TW II', 'Capaian'], [{ judul: 'Realisasi', dari: 2, sampai: 3 }])
ok('M1 dua baris: kelompok di atas (digabung mendatar), judul kolom di bawah; kolom lain setinggi 2 baris',
  kb.kepala.length === 2 && kb.kepala[0][2].v === 'Realisasi' && kb.kepala[0][2].cs === 2 && kb.kepala[0][0].rs === 2 && kb.kepala[1][0].h === true
  && kb.kepala[1][2].v === 'TW I' && kb.kepala[1][3].v === 'TW II' && JSON.stringify(kb.letak) === '[0,0,1,1,0]')
ok('M2 tanpa kelompok = satu baris (templat lama tidak berubah)', kepalaBertingkat(['A', 'B']).kepala.length === 1)
const bertingkat = DAFTAR_TEMPLAT.filter(t => t.kelompok?.length)
ok('M3 templat bertingkat: rentang kelompok sah & tiap kunci sumbernya ADA di katalog sumbernya',
  bertingkat.length >= 2 && bertingkat.every(t => {
    const katalog = new Set(DAFTAR_SUMBER[t.sumber].kolom(DAFTAR_SUMBER[t.sumber].setelan(t.setelan, 2026)).map(k => k.kunci))
    return t.kelompok!.every(g => g.dari >= 0 && g.sampai < t.kolom.length && g.sampai > g.dari)
      && t.kolom.every(k => k.taut.isi.jenis !== 'sumber' || katalog.has(k.taut.isi.kunci))
  }), bertingkat.map(t => t.id).join(','))

// ─── N. Nomor per BAB & rujukan silang ────────────────────────────────────────
console.log('\nN. Nomor per BAB ("Tabel 3.1") & rujukan silang dari narasi')
const tabelP = (judul: string) => ({ judul, kolom: ['A'], headerRows: 1, rows: [[{ v: 'A' }], [{ v: '1' }]] })
const blok = (id: number, tipe: BlockNode['tipe'], payload: unknown, urutan = 0): BlockNode => ({ id, tipe, payload, urutan })
const simpul = (id: number, depth: number, judul: string, blocks: BlockNode[], children: SectionNode[] = [], nomorTampil = ''): SectionNode =>
  ({ id, parent_id: null, depth, urutan: 0, judul, locked: 0, nomor: nomorTampil, nomorPlain: nomorTampil, blocks, children })
const pohon: SectionNode[] = [
  simpul(1, 0, 'Pendahuluan', [blok(10, 'NARASI', { html: '<p>Lihat <span data-rujuk="31">Tabel 9</span> dan <span data-rujuk="999">Tabel 4</span>.</p>' })], [], 'BAB I'),
  simpul(2, 0, 'Perencanaan', [blok(20, 'TABEL', tabelP('Target'))], [], 'BAB II'),
  simpul(3, 0, 'Akuntabilitas', [blok(30, 'TABEL', tabelP('Capaian')), blok(31, 'TABEL', tabelP('Anggaran'), 1), blok(32, 'GAMBAR', { judul: 'Struktur', fileId: '' }, 2), blok(33, 'TABEL', { kolom: [] }, 3)],
    [simpul(4, 1, 'Realisasi', [blok(40, 'TABEL', tabelP('Rinci')), blok(41, 'GRAFIK', { judul: 'Tren' })], [], '3.1')], 'BAB III'),
]
const urut = nomorObjek(pohon), perBab = nomorObjek(pohon, true)
ok('N1 berurutan (bawaan) TIDAK berubah: Tabel 1–4, Gambar 1, Grafik 1; tabel tanpa kolom tidak dihitung',
  [20, 30, 31, 40].map(id => urut.get(id)!.label).join(',') === '1,2,3,4' && urut.get(32)!.label === '1' && urut.get(41)!.label === '1' && !urut.has(33) && urut.get(20)!.awalan === '')
ok('N2 per BAB: Tabel 2.1 · 3.1, 3.2, 3.3 (sub-bagian ikut BAB-nya) · Gambar 3.1 · Grafik 3.1; nomor SEQ mulai ulang',
  [20, 30, 31, 40].map(id => perBab.get(id)!.label).join(',') === '2.1,3.1,3.2,3.3' && perBab.get(32)!.label === '3.1' && perBab.get(41)!.label === '3.1'
  && perBab.get(30)!.nomor === 1 && perBab.get(30)!.awalan === '3.' && sebutObjek(perBab.get(40)!) === 'Tabel 3.3')
const capPerBab = buildTabelXml(tabelP('Capaian'), 'Arial', 24, 'EDEDED', { nomor: 1, awalan: '3.', blokId: 30 })
ok('N3 Word per BAB: "Tabel 3." + SEQ yang mulai ulang di Heading 1 (\\s 1), cache = nomor dalam BAB',
  capPerBab.includes('<w:t xml:space="preserve">Tabel 3.</w:t>') && capPerBab.includes('<w:instrText xml:space="preserve"> SEQ Tabel \\* ARABIC \\s 1 </w:instrText>')
  && /fldCharType="separate"\/><\/w:r><w:r><w:t xml:space="preserve">1<\/w:t>/.test(capPerBab), capPerBab.slice(0, 900))
ok('N4 bookmark judul menutup "Tabel 3.1" saja (bukan judulnya) — tujuan REF',
  /<w:bookmarkStart w:id="900030" w:name="_RefLkjip30"\/><w:r>.*?Tabel 3\.<\/w:t><\/w:r>.*?fldCharType="end"\/><\/w:r><w:bookmarkEnd w:id="900030"\/><w:r>[^]*?Capaian/.test(capPerBab) && namaPenanda(30) === '_RefLkjip30')
const capUrut = buildTabelXml(tabelP('Capaian'), 'Arial', 24, 'EDEDED', 2)
ok('N5 berurutan: tanpa awalan, tanpa \\s (dokumen lama tercetak sama)', capUrut.includes('<w:t xml:space="preserve">Tabel </w:t>') && capUrut.includes(' SEQ Tabel \\* ARABIC </w:instrText>') && !capUrut.includes('\\s 1'))
const rujuk = new Map([[31, 'Tabel 3.2']])
const nx = narasiToXml('<p>Lihat <span data-rujuk="31">Tabel 9</span> dan <span data-rujuk="999">Gambar 4</span> <strong>tebal <span data-rujuk="31">Tabel 1</span></strong>.</p>', 'Arial', 24, 0, undefined, false, rujuk)
ok('N6 narasi: rujukan → field REF ke bookmark, teks awalnya nomor SEKARANG (bukan "Tabel 9" yang tersimpan)',
  nx.includes(' REF _RefLkjip31 \\h </w:instrText>') && nx.includes('>Tabel 3.2</w:t>') && !nx.includes('Tabel 9') && !nx.includes('Tabel 1<'), nx)
ok('N7 rujukan ke blok yang sudah dihapus → "Gambar ?" (jenis dari teks tersimpan), tanpa REF', nx.includes('>Gambar ?</w:t>') && !nx.includes('_RefLkjip999'))
ok('N8 gaya sekitarnya ikut ke teks REF (tebal)', /<w:b\/>[^]*?<w:t xml:space="preserve">Tabel 3\.2<\/w:t>[^]*?fldCharType="end"/.test(nx.slice(nx.lastIndexOf('REF'))))
const nxTanpa = narasiToXml('<p>Lihat <span data-rujuk="31">Tabel 9</span>.</p>', 'Arial', 24)
ok('N9 tanpa peta (Kata Pengantar): teks tersimpan dipakai apa adanya', nxTanpa.includes('Tabel 9') && !nxTanpa.includes('REF'))
ok('N10 penyaring: data-rujuk hanya angka, atribut lain dibuang; NARASI menyimpannya',
  sanitizeNarasiHtml('<span data-rujuk="12" onclick="x()">Tabel 1</span>') === '<span data-rujuk="12">Tabel 1</span>'
  && sanitizeNarasiHtml('<span data-rujuk="1 onmouseover=x">T</span>') === '<span>T</span>'
  && NarasiPayloadSchema.parse({ html: '<p><span data-rujuk="7">Tabel 1</span></p>' }).html.includes('data-rujuk="7"'))
ok('N11 pengaturan dokumen: nomorPerBab bawaan mati, bisa dinyalakan, terdaftar di bawaan',
  StyleConfigSchema.parse({}).nomorPerBab === false && StyleConfigSchema.parse({ nomorPerBab: true }).nomorPerBab === true && DEFAULT_STYLE.nomorPerBab === false)
const ed = entriDaftar(pohon, perBab)
ok('N12 isi awal Daftar Tabel memakai nomor per BAB', ed.Tabel.map(e => e.teks).join('|') === 'Tabel 2.1 Target|Tabel 3.1 Capaian|Tabel 3.2 Anggaran|Tabel 3.3 Rinci', ed.Tabel.map(e => e.teks).join('|'))
const objek = daftarObjekRujukan(pohon, perBab)
ok('N13 daftar tujuan rujukan urut dokumen dgn judulnya', objek.map(o => `${o.id}:${o.sebut}:${o.judul}`).join('|') === '20:Tabel 2.1:Target|30:Tabel 3.1:Capaian|31:Tabel 3.2:Anggaran|32:Gambar 3.1:Struktur|40:Tabel 3.3:Rinci|41:Grafik 3.1:Tren')
ok('N14 rujukanDiHtml', JSON.stringify(rujukanDiHtml('<span data-rujuk="31">a</span><span data-rujuk="999">b</span>')) === '[31,999]')
const putus = kumpulkanRujukanPutus(pohon.map(s => ({ id: s.id, nomor: s.nomor, judul: s.judul, blocks: s.blocks })), new Set(perBab.keys()))
ok('N15 Finalisasi menyebut narasi yang merujuk blok hilang', putus.length === 1 && putus[0].blockId === 10 && putus[0].jumlah === 1 && putus[0].letak === 'BAB I Pendahuluan')
const docx = await rakitDocx({ tree: pohon, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE, nomorPerBab: true } })
const docXml = new PizZip(docx.buffer).file('word/document.xml')!.asText()
const penanda = [...docXml.matchAll(/w:name="(_RefLkjip\d+)"/g)].map(m => m[1])
ok('N16 dokumen utuh: REF menunjuk bookmark yang ADA; tiap objek bernomor punya bookmark sendiri (unik)',
  docXml.includes(' REF _RefLkjip31 \\h ') && penanda.includes('_RefLkjip31') && penanda.length === 6 && new Set(penanda).size === 6, penanda.join(','))
ok('N17 dokumen utuh: judul per BAB tertulis ("Tabel 3." + SEQ \\s 1) dan Daftar Tabel berisi "Tabel 3.2 Anggaran"',
  (docXml.match(/\\s 1 <\/w:instrText>/g) ?? []).length === 6 && docXml.includes('Tabel 3.2 Anggaran') && docXml.includes('>Tabel 3.</w:t>'))
const docxUrut = await rakitDocx({ tree: pohon, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE } })
const docUrut = new PizZip(docxUrut.buffer).file('word/document.xml')!.asText()
ok('N18 tanpa per BAB: tidak ada \\s 1, REF tetap ke bookmark, teks "Tabel 3"', !docUrut.includes('\\s 1') && docUrut.includes(' REF _RefLkjip31 \\h ') && docUrut.includes('>Tabel 3</w:t>'))

// ─── O. Pulihkan versi memetakan rujukan narasi ───────────────────────────────
console.log('\nO. Pulihkan versi: rujukan narasi ikut id blok baru')
const V = await import('../lib/lkjip/versi')
const sTabel = { id: 101, tipe: 'TABEL' as const, urutan: 0, payload: {} }
const sNarasi = { id: 102, tipe: 'NARASI' as const, urutan: 1, payload: { html: '<p><span data-rujuk="101">Tabel 1</span> &amp; <span data-rujuk="555">Tabel 9</span></p>', angka: {} } }
const o1 = V.petakanRujukanNarasi([{ idBaru: 501, sidLama: 9, snap: sTabel }, { idBaru: 502, sidLama: 9, snap: sNarasi }], [])
ok('O1 foto ber-id: data-rujuk 101 → 501; yang tak ditemukan dibiarkan (Finalisasi menyebutnya)',
  o1.length === 1 && o1[0].id === 502 && String(o1[0].payload.html).includes('data-rujuk="501"') && String(o1[0].payload.html).includes('data-rujuk="555"'), JSON.stringify(o1))
const tanpa = <T extends { id?: number }>(s: T) => ({ ...s, id: undefined })
const o2 = V.petakanRujukanNarasi([{ idBaru: 601, sidLama: 9, snap: tanpa(sTabel) }, { idBaru: 602, sidLama: 9, snap: tanpa(sNarasi) }], [{ id: 101, section_id: 9, urutan: 0, tipe: 'TABEL' }])
ok('O2 foto lama tanpa id: lewat letak blok tujuan sekarang', String(o2[0]?.payload.html).includes('data-rujuk="601"'), JSON.stringify(o2))
ok('O3 narasi tanpa rujukan tidak disentuh; grafik tetap lewat fungsi lamanya',
  V.petakanRujukanNarasi([{ idBaru: 1, sidLama: 9, snap: { id: 2, tipe: 'NARASI', urutan: 0, payload: { html: '<p>x</p>' } } }], []).length === 0
  && V.petakanRujukanGrafik([{ idBaru: 501, sidLama: 9, snap: sTabel }, { idBaru: 502, sidLama: 9, snap: { id: 103, tipe: 'GRAFIK', urutan: 1, payload: { tabelBlockId: 101 } } }], [])[0]?.payload.tabelBlockId === 501)

// ─── P. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nP. Sambungan layar')
const te = kode('components/tabel/TabelEditor.tsx')
const ec = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const tt = kode('app/(dashboard)/lkjip/[id]/TiptapNarasi.tsx')
const vs = kode('lib/lkjip/versi.ts')
const tm = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
const pasteB = badan(te, 'const onPaste = (e: React.ClipboardEvent) =>')
ok('P1 Ctrl+X = onCut (salin lalu kosongkan); Ctrl+Shift+V ditandai lalu dibaca di onPaste',
  te.includes('onCopy={salinKePapan} onCut={potongKePapan}') && badan(te, 'const potongKePapan = (e: React.ClipboardEvent) =>').includes('salinKePapan(e);')
  && badan(te, 'const potongKePapan = (e: React.ClipboardEvent) =>').includes('kosongkan();')
  && te.includes("if (ctrl && kl === 'v') { if (e.shiftKey) tempelNilaiPada.current = e.timeStamp; return; }")
  && pasteB.includes('const nilaiSaja = tempelNilaiPada.current > 0 && e.timeStamp - tempelNilaiPada.current < 1500;')
  && pasteB.includes('if (internal) { if (nilaiSaja) tempelNilaiDari(internal.nilai); else void tempel(internal.sel); return; }'))
ok('P2 tempel dari aplikasi lain: HTML (gabungan) dulu, TSV cadangan — juga untuk tempel nilai; papan internal BERSAMA semua tabel halaman',
  pasteB.includes('const dariHtml = html ? htmlKeSel(html, batasKolom) : null;') && pasteB.includes('void tempel(dariHtml || parseTSV(text));')
  && pasteB.includes("tempelNilaiDari(dariHtml ? dariHtml.map(r => r.map(c => (c.h ? '' : c.v)))") && te.includes('let papanInternal:')
  && badan(te, 'const isiPapanInternal = () =>').includes('simpanPapanInternal({ tsv: tsvPilihan, sel: ambilBlok(rowsTampil, rect), nilai });')
  && te.includes('const simpanPapanInternal = (p: NonNullable<typeof papanInternal>) => { papanInternal = p; };'))
ok('P3 badan tertaut: tempel hanya nilai ke kolom isian tangan, rumus ditolak',
  badan(te, 'async function tempel(').includes('if (kolomTempel.every(c => kolomTangan.has(c))) { tempelNilaiDari(')
  && badan(te, 'function tempelNilaiDari(').includes("const ok = bolehIsi(r, c) && !(diBadan(r) && teks.trimStart().startsWith('='));"))
ok('P4 pintasan: Ctrl+B/I/U, Alt+= jumlah, Ctrl+F/H cari, Esc membatalkan kuas/isi-seret',
  te.includes("if (ctrl && !e.shiftKey && (kl === 'b' || kl === 'i' || kl === 'u')) { e.preventDefault(); ubahGayaHuruf(kl); return; }")
  && te.includes("if (e.altKey && (k === '=' || k === '+')) { e.preventDefault(); jumlahOtomatis(); return; }")
  && te.includes("if (ctrl && (kl === 'f' || kl === 'h')) { e.preventDefault(); bukaCari(kl === 'h' && !readOnly); return; }")
  && te.includes("if (k === 'Escape' && (kuas || isi)) {"))
ok('P5 tebal/miring/garis bawah: patokan sel AKTIF (bukan dibalik per sel)', badan(te, "const ubahGayaHuruf = (k: 'b' | 'i' | 'u') =>").includes('const nyala = !(sel && rows[sel.ar]?.[sel.ac]?.[k]);'))
ok('P6 Alt+Enter = baris baru di sel; penyunting & bilah rumus berupa textarea (input membuang baris baru)',
  (te.match(/if \(e\.key === 'Enter' && e\.altKey\) \{ e\.preventDefault\(\); (if \(sel\) )?sisipGantiBaris\(/g) ?? []).length === 2
  && te.includes('<textarea autoFocus value={cell.v}') && te.includes('<textarea className="lk-fbar-in"'))
const lepasB = badan(te, 'const lepasTetikus = useEffectEvent(() =>')
ok('P7 isi-seret & kuas selesai saat tetikus dilepas — kuas hanya sesudah memilih TUJUAN (bukan klik tombolnya)',
  lepasB.includes('const h = isiSeret(rows, dari, ke, bolehIsi);') && lepasB.includes('if (kuas && kuasSiap.current) { kuasSiap.current = false; pakaiKuas(); }')
  && badan(te, 'const onSelDown = (r: number, c: number, e: React.MouseEvent) =>').includes('if (kuas) kuasSiap.current = true;'))
ok('P8 kuas: badan tertaut tidak menerima format', badan(te, 'const pakaiKuas = () =>').includes('if (rectBadan) {') && badan(te, 'const pakaiKuas = () =>').includes('tempelFormat(r, rect, pola, rr => !diBadan(rr))'))
ok('P9 urutkan: tertaut ditolak; satu sel = seluruh badan; baris JUMLAH dikecualikan',
  badan(te, 'function urutkan(turun: boolean)').includes("if (terkait) { toast.info(") && badan(te, 'function urutkan(turun: boolean)').includes('{ r1: headerRows, c1: 0, r2: rows.length - 1, c2: ncol - 1 }')
  && badan(te, 'function urutkan(turun: boolean)').includes('urutkanBlok(rows, blok, kol, turun, headerRows, !!atur.gaya.jumlah)'))
const menuB = te.slice(te.indexOf('{menu && rect && (() => {'), te.indexOf('{modalTaut && ('))
ok('P10 menu klik-kanan: 16 aksi; yang tak berlaku MATI dgn alasan (bukan disembunyikan); hapus memakai DeleteIcon',
  // 16 aksi, 15 bisa mati (Salin selalu boleh) — tiap yang bisa mati membawa alasannya.
  (menuB.match(/\{ icon: /g) ?? []).length === 16 && (menuB.match(/disabled: /g) ?? []).length === 15 && (menuB.match(/alasan: /g) ?? []).length === 15
  && (menuB.match(/<DeleteIcon size=\{14\} \/>/g) ?? []).length === 2
  && !menuB.includes('Trash2') && te.includes("onContextMenu={e => bukaMenu(e, () => pil.keSel(ri, ci), diPilih(ri, ci))}"))
const kunciMenu = [...menuB.matchAll(/kunci: '([^']+)'/g)].map(m => m[1])
const kasusMenu = [...badan(te, 'const pilihMenu = (kunci: string) =>').matchAll(/case '([^']+)':/g)].map(m => m[1])
ok('P10b tiap aksi menu punya jalannya di pilihMenu (dan sebaliknya) — aksi tanpa kasus diam saja saat diklik',
  kunciMenu.length === 16 && new Set(kunciMenu).size === 16 && kasusMenu.length === 16 && kunciMenu.every(k => kasusMenu.includes(k)), `${kunciMenu.length}/${kasusMenu.length}`)
ok('P11 menu klik-kanan baris/kolom memilih TANPA mode seret (contextmenu Windows datang sesudah mouseup)',
  te.includes('onContextMenu={e => bukaMenu(e, () => pil.setSel({ ar: 0, ac: ci, fr: rows.length - 1, fc: ci })') && te.includes('onContextMenu={e => bukaMenu(e, () => pil.setSel({ ar: ri, ac: 0, fr: ri, fc: ncol - 1 })'))
ok('P12 RowMenu satu komponen untuk pohon dokumen & tabel', ec.includes("import { RowMenu, type RowMenuItem } from '@/components/tabel/RowMenu';") && te.includes("import { RowMenu, type RowMenuItem } from './RowMenu';") && !ec.includes('function RowMenu('))
// CSS tabel pindah ke components/tabel/tabel-css.ts dan disisipkan ke ED_CSS (konsep iki-custom §3).
const css = ec.slice(ec.indexOf('const ED_CSS = `')).replace('${TABEL_CSS}', kode('components/tabel/tabel-css.ts'))
ok('P13 kepala & huruf kolom sticky dgn latar PEKAT; wadah bergulir sendiri; jarak atas tiap baris kepala diukur',
  css.includes('.lk-tabel-scroll { max-height: 70vh; overflow: auto; }') && css.includes('.lk-tabel-scroll .lk-tabel thead th { position: sticky; top: 0; z-index: 3; background: linear-gradient(rgba(255,255,255,0.03), rgba(255,255,255,0.03)), #042C53; }')
  // Kekhususan (0,2,2) WAJIB di atas `.lk-tabel th.lk-colhead { position: relative }` (0,2,1) — di bawahnya huruf kolom tergulir pergi.
  && css.includes('.lk-tabel th.lk-colhead { position: relative;') && css.includes('[data-theme="light"] .lk-tabel-scroll .lk-tabel thead th { background: #F3F4F6; }')
  && css.includes('.lk-tabel-scroll tr.lk-hrow > td { position: sticky; top: var(--lk-atas, 0); z-index: 2; background: linear-gradient(rgba(133,183,235,0.13), rgba(133,183,235,0.13)), #042C53; }')
  && te.includes("'--lk-atas': `${atasKepala[ri]}px`"))
ok('P14 teks panjang terbungkus seperti Word (dulu "…"); teks tegak tetap satu baris',
  css.includes('white-space: pre-wrap; overflow-wrap: break-word;') && !/\.lk-sel-isi \{[^}]*text-overflow: ellipsis/.test(css) && css.includes('.lk-sel-isi.tegak { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap;'))
ok('P15 bilah status tampil untuk ≥ 2 sel berisi', te.includes('{ringkas && ringkas.banyak >= 2 && (') && te.includes('const ringkas = useMemo(() => (rect ? ringkasBlok(rowsTampil, rect) : null), [rowsTampil, rect]);'))
ok('P16 templat bertingkat dipasang lewat kepalaBertingkat', badan(tm, 'function pakaiTemplat(t: TemplatTabel)').includes('kepalaBertingkat(t.kolom.map(k => k.judul), t.kelompok)'))
ok('P17 narasi: node rujukan terdaftar; penyegaran nomor tidak memunculkan Simpan; sisipan menyimpan id blok',
  /name: 'rujukTaut'[\s\S]*inline: true,[\s\S]*atom: true/.test(tt) && tt.includes("tag: 'span[data-rujuk]'") && tt.includes('AngkaTaut, RujukTaut]')
  && tt.includes('onUpdate: ({ transaction }) => { if (!transaction.getMeta(META_SEGAR)) setDirty(true); },')
  && tt.includes("insertContent({ type: 'rujukTaut', attrs: { id: String(o.id), teks: o.sebut } })"))
ok('P18 editor: daftar tujuan & nomor dari setelan dokumen; Finalisasi memeriksa rujukan putus; pilihan di Pengaturan',
  ec.includes('const daftarObjek = useMemo(() => daftarObjekRujukan(detail.tree, nomorBlok), [detail.tree, nomorBlok]);') && ec.includes('objek={daftarObjek}')
  && badan(ec, 'async function finalize()').includes('kumpulkanRujukanPutus(flat.map(f => f.node), new Set(nomorBlok.keys()))')
  && ec.includes("onChange={e => setStyleForm({ ...styleForm, nomorPerBab: e.target.value === '1' })}"))
ok('P19 Pulihkan versi menjalankan pemetaan grafik DAN narasi', vs.includes('for (const u of [...petakanRujukanGrafik(masuk, sekarang), ...petakanRujukanNarasi(masuk, sekarang)]) {'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('Gagal:\n' + gagal.map(g => '  - ' + g).join('\n')); process.exit(1) }
