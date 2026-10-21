// scripts/test-lkjip-tabel-word.mts — tabel LKJIP "ala Word" (Tahap W).
// Konsep: docs/CONCEPT-lkjip-tabel-excel.md §12.2–12.4
//
// A: pengaturan cetak & lebar kertas · B: gaya tabel (format sel menang) · C: kolom No. otomatis
// D: salin HTML · E: nomor objek editor = cache SEQ · F: XML Word (dibangun sungguhan lewat rakitDocx)
// G: skema simpan · H: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-tabel-word.mts

import { readFileSync } from 'node:fs'
import PizZip from 'pizzip'
import {
  bacaAtur, teksSumber, ratakanLebar, lebarKolomWord, paskanKeKertas, lebarKertasPx, gayaSel, selBergaya, nomorUlang,
  blokKeHtml, angkaUntukExcel, selSalinan, perluPetunjukLebar, sisipKolom, hapusKolom, sanitizeRows, displayValue, posisiBarisBaru, sisipBarisBaru, normalizeCell, extractRange, tanpaFormat, tinggiBarisTegak, perkiraLebarTeks,
  ATUR_BAWAAN, WARNA_SELANG, GARIS_JUMLAH, LEBAR_TULIS_DXA, LEBAR_TULIS_MELINTANG_DXA,
  type TabelCell, type BentukTabel,
} from '../lib/lkjip/tabel'
import { nomorObjek, type SectionNode, type BlockNode } from '../lib/lkjip/numbering'
import { TabelPayloadSchema, DEFAULT_STYLE, type StyleConfig } from '../lib/lkjip/schemas'
import { buildTabelXml, rakitDocx, kelompokSection, entriDaftar, CATATAN_DAFTAR } from '../lib/lkjip/docgen'

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: boolean, ket = '') {
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
const hitung = (s: string, pola: RegExp) => (s.match(pola) ?? []).length
const trs = (xml: string): string[] => [...(xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [])]

// ─── A. Pengaturan cetak & lebar kertas ───────────────────────────────────────
console.log('\nA. Pengaturan cetak & lebar kertas (§12.2)')
ok('A1 payload lama tanpa pengaturan = bawaan (tegak, tengah, tanpa gaya, tanpa Sumber)',
  JSON.stringify(bacaAtur({ kolom: ['A'], rows: [] })) === JSON.stringify(ATUR_BAWAAN))
ok('A2 kolom No. di luar jangkauan / di tabel tertaut diabaikan',
  bacaAtur({ kolom: ['A', 'B'], kolomNomor: 2 }).kolomNomor === null
  && bacaAtur({ kolom: ['A', 'B'], kolomNomor: 1, tautan: {} }).kolomNomor === null
  && bacaAtur({ kolom: ['A', 'B'], kolomNomor: 1 }).kolomNomor === 1)
ok('A3 baris Sumber: diberi awalan sekali, "Sumber:" yang diketik sendiri tidak digandakan',
  teksSumber('') === '' && teksSumber('  ') === '' && teksSumber('Bagian Keuangan, 2026') === 'Sumber: Bagian Keuangan, 2026'
  && teksSumber('sumber : Bagian Umum') === 'Sumber: Bagian Umum')
const rata = ratakanLebar([100, 200, 301, 50], 0, 2)
ok('A4 ratakan lebar: kolom terpilih sama lebar, jumlahnya tetap, kolom lain utuh',
  rata.join() === '201,200,200,50' && rata.slice(0, 3).reduce((a, b) => a + b, 0) === 601, rata.join())
ok('A5 ratakan satu kolom tidak mengubah apa pun', ratakanLebar([100, 200], 1, 1).join() === '100,200')
const delapan = Array.from({ length: 8 }, () => 140)
const tegak8 = lebarKolomWord(delapan, 8), lintang8 = lebarKolomWord(delapan, 8, LEBAR_TULIS_MELINTANG_DXA)
ok('A6 tabel 8 kolom: tegak disusutkan ke 15,5 cm, melintang muat lebih lebar (± 1,9 → ± 3 cm)',
  tegak8.reduce((a, b) => a + b, 0) <= LEBAR_TULIS_DXA && lintang8.reduce((a, b) => a + b, 0) <= LEBAR_TULIS_MELINTANG_DXA
  && lintang8[0] > tegak8[0] * 1.5, `${tegak8[0]} vs ${lintang8[0]}`)
const penuh = lebarKolomWord([100, 200, 133], 3, LEBAR_TULIS_DXA, true)
ok('A7 "Selebar kertas": direntangkan sebanding sampai TEPAT bidang tulis',
  penuh.reduce((a, b) => a + b, 0) === LEBAR_TULIS_DXA && penuh[1] > penuh[0] * 1.9
  && lebarKolomWord(delapan, 8, LEBAR_TULIS_MELINTANG_DXA, true).reduce((a, b) => a + b, 0) === LEBAR_TULIS_MELINTANG_DXA, penuh.join())
ok('A8 garis kertas editor 585 px tegak / 914 px melintang; "Paskan" memakai lebar yang sama',
  lebarKertasPx(false) === 585 && lebarKertasPx(true) === 914
  && paskanKeKertas([600, 600], 914).reduce((a, b) => a + b, 0) <= 914 && paskanKeKertas([400, 400], 914).join() === '400,400')

// ─── B. Gaya tabel ────────────────────────────────────────────────────────────
console.log('\nB. Gaya tabel — dihitung saat menggambar, format sel menang (keputusan #8)')
const g = { selang: true, jumlah: true, mendatar: true }
ok('B1 berselang: badan ke-2, ke-4 berlatar; kepala tidak',
  !gayaSel({ selang: true }, 6, 1, 0).bg && !gayaSel({ selang: true }, 6, 1, 1).bg
  && gayaSel({ selang: true }, 6, 1, 2).bg === WARNA_SELANG && !gayaSel({ selang: true }, 6, 1, 3).bg && gayaSel({ selang: true }, 6, 1, 4).bg === WARNA_SELANG)
// 5 baris, kepala 1: baris terakhir (r=4) jatuh di urutan berlatar — jadi "tanpa latar" benar-benar diuji.
ok('B2 baris jumlah = baris terakhir: tebal + garis atas tebal, tanpa latar selang',
  gayaSel(g, 5, 1, 4).b === true && gayaSel(g, 5, 1, 4).bd?.t === GARIS_JUMLAH && !gayaSel(g, 5, 1, 4).bg
  && gayaSel({ selang: true }, 5, 1, 4).bg === WARNA_SELANG && !gayaSel(g, 5, 1, 3).b)
ok('B3 garis mendatar: tanpa garis tegak di kepala & badan',
  gayaSel({ mendatar: true }, 3, 1, 0).bd?.l === 0 && gayaSel({ mendatar: true }, 3, 1, 0).bd?.r === 0 && gayaSel({ mendatar: true }, 3, 1, 2).bd?.l === 0)
ok('B4 tabel yang seluruhnya kepala tidak punya baris jumlah', !gayaSel({ jumlah: true }, 2, 2, 1).b)
const bergaya = selBergaya(sel('x', { bg: 'FFF2CC', bd: { l: 4 } }), gayaSel(g, 5, 1, 2))
ok('B5 format sel menang: latar sel tetap, garis kiri sel tetap, garis kanan dari gaya',
  bergaya.bg === 'FFF2CC' && bergaya.bd?.l === 4 && bergaya.bd?.r === 0)
const polos = sel('x')
ok('B6 tanpa gaya: sel yang SAMA dipulangkan (tidak menulis apa pun ke sel)', selBergaya(polos, gayaSel({}, 3, 1, 2)) === polos)

// ─── C. Kolom No. otomatis ────────────────────────────────────────────────────
console.log('\nC. Kolom No. otomatis (§12.3)')
const daftar = sanitizeRows([
  baris('No', 'Uraian', 'Nilai'),
  baris('A. Program', '', ''),                  // judul kelompok: No digabung mendatar
  baris('x', 'Kegiatan 1', '10'),
  baris('', 'Kegiatan 2 (dua baris)', '20'),     // No digabung tegak
  baris('', 'lanjutan', ''),
  baris('', 'Kegiatan 3', '30'),
  baris('', 'JUMLAH', '60'),
], 3)
daftar[1][0].cs = 3
daftar[3][0].rs = 2
const dirapikan = sanitizeRows(daftar, 3)
const bernomor = nomorUlang(dirapikan, 1, 0, true)
ok('C1 badan diberi 1, 2, 3: judul kelompok, lanjutan baris gabung, & baris JUMLAH dilewati',
  bernomor.map(r => r[0].h ? '·' : r[0].v).join('|') === 'No|A. Program|1|2|·|3|', bernomor.map(r => r[0].h ? '·' : r[0].v).join('|'))
ok('C2 tanpa gaya jumlah, baris terakhir ikut bernomor', nomorUlang(dirapikan, 1, 0, false)[6][0].v === '4')
ok('C3 kepala tidak disentuh, sel lain tidak disentuh', bernomor[0][0].v === 'No' && bernomor[2][1].v === 'Kegiatan 1')
ok('C4 sudah urut → larik yang SAMA dipulangkan (memo layar tidak lepas)', nomorUlang(bernomor, 1, 0, true) === bernomor)
ok('C5 kolom No. dimatikan → baris apa adanya', nomorUlang(dirapikan, 1, null) === dirapikan)
const bt: BentukTabel = { rows: sanitizeRows([baris('No', 'U'), baris('1', 'a')], 2), kolom: ['No', 'U'], align: ['left', 'left'], colWidths: [60, 140], headerRows: 1, kolomNomor: 0 }
// Ditemukan di layar: Tab di sel terakhir dgn gaya JUMLAH menaruh baris kosong DI BAWAH JUMLAH —
// baris kosong itu yang jadi "jumlah" dan JUMLAH ikut bernomor.
ok('C8 baris baru masuk di atas JUMLAH bila gaya jumlah dipakai; tanpa gaya / badan kosong → di akhir',
  posisiBarisBaru(8, 2, true) === 7 && posisiBarisBaru(8, 2, false) === 8 && posisiBarisBaru(2, 2, true) === 2 && posisiBarisBaru(3, 2, true) === 2)
// SUM(B2:B2) berakhir BUKAN di baris data terakhir — tidak boleh ikut dipanjangkan.
const berjumlah = sanitizeRows([baris('U', 'Nilai'), baris('a', '10'), baris('b', '20'), [sel('=SUM($B$2:$B$3)'), sel('=SUM(B2:B3)+B2+B3+SUM(B2:B2)')]], 2)
const ditambah = sisipBarisBaru(berjumlah, 1, 2, true)
ok('C9 baris di atas JUMLAH ikut terhitung: rentang yang berakhir di baris data terakhir dipanjangkan (juga yg ber-$); rujukan tunggal & rentang lain tetap',
  ditambah.di === 3 && ditambah.rows[4][1].v === '=SUM(B2:B4)+B2+B3+SUM(B2:B2)' && ditambah.rows[4][0].v === '=SUM($B$2:$B$4)'
  && ditambah.rows[3].every(c => c.v === ''), ditambah.rows[4].map(c => c.v).join(' | '))
ditambah.rows[3][1].v = '5'
ok('C10 total ikut angka baris baru: SUM 35 + 10 + 20 + 10 = 75 (rentang lama memberi 70, diam-diam kurang)', displayValue(ditambah.rows, 4, 1) === '75', displayValue(ditambah.rows, 4, 1))
const tanpaJumlah = sisipBarisBaru(berjumlah, 1, 2, false)
ok('C11 tanpa gaya jumlah: baris di akhir, rumus apa adanya', tanpaJumlah.di === 4 && tanpaJumlah.rows[3][1].v === '=SUM(B2:B3)+B2+B3+SUM(B2:B2)')
ok('C6 kolom No. ikut bergeser saat kolom disisip di kirinya, tetap bila di kanannya',
  sisipKolom(bt, 0, 2).kolomNomor === 2 && sisipKolom(bt, 1, 1).kolomNomor === 0)
ok('C7 kolom No. dihapus → mati; kolom di kirinya dihapus → bergeser',
  hapusKolom(bt, 0, 0).kolomNomor === null && hapusKolom({ ...bt, kolomNomor: 1 }, 0, 0).kolomNomor === 0
  && hapusKolom({ ...bt, kolomNomor: null }, 0, 0).kolomNomor === null)

// ─── D. Salin ke Word/Excel ───────────────────────────────────────────────────
console.log('\nD. Salin sebagai tabel HTML (§12.4)')
const kepala2 = sanitizeRows([
  [sel('Uraian', { rs: 2 }), sel('Target', { cs: 2 }), sel('')],
  [sel('basi'), sel('TW I'), sel('TW II')],     // sel tertutup gabungan yang masih menyimpan teks lama
  [sel('A < B & "C"'), sel('5', { b: true }), sel('6', { bg: 'E2EFDA', al: 'right' })],
], 3)
const html = blokKeHtml(kepala2, { r1: 0, c1: 0, r2: 2, c2: 2 }, (r, c) => kepala2[r][c].v)
// Tiap sel membawa garisnya sendiri (aturan buildTabelXml: tanpa ketentuan = 0,5 pt).
const GARIS_X = 'border:.5pt solid windowtext'
const TEKS_X = `style="${GARIS_X};mso-number-format:'\\@'"`
ok('D1 gabungan jadi rowspan/colspan, sel tertutup tidak ditulis',
  html.includes(`<td rowspan="2" ${TEKS_X}>Uraian</td>`) && html.includes(`<td colspan="2" ${TEKS_X}>Target</td>`) && hitung(html, /<td/g) === 7, html)
ok('D2 teks di-escape, tebal/latar/perataan ikut',
  html.includes('A &lt; B &amp; &quot;C&quot;') && html.includes('font-weight:bold') && html.includes('background:#E2EFDA;text-align:right'))
const potongBlok = blokKeHtml(kepala2, { r1: 1, c1: 0, r2: 2, c2: 1 }, (r, c) => kepala2[r][c].v)
ok('D3 gabungan yang terpotong batas blok dipangkas; teks asal di luar blok tidak ikut',
  potongBlok.includes('<table') && potongBlok.includes(`<tr><td style="${GARIS_X}"></td><td ${TEKS_X}>TW I</td></tr>`) && !potongBlok.includes('Uraian')
  && !potongBlok.includes('basi') && !html.includes('basi'), potongBlok)
// Dibuktikan di Excel 2026-10-19: dengan pemisah gaya Inggris "1.250.000"/"79,01" tempelan jadi TEKS;
// x:num dihormati HANYA bila namespace-nya dinyatakan di <html> (di <table> saja tidak).
const ax = (v: string, x: Partial<TabelCell> = {}) => angkaUntukExcel([[sel(v, x)]], 0, 0)
ok('D4 angka polos gaya Indonesia → nilai mesin + format Excel (ribuan/desimal sesuai tampilan)',
  ax('1.250.000')?.nilai === 1250000 && ax('1.250.000')?.format === '\\#\\,\\#\\#0' && ax('7,5')?.nilai === 7.5 && ax('7,5')?.format === '0\\.0'
  && ax('12')?.nilai === 12 && ax('12')?.format === null && ax('-3')?.nilai === -3 && ax('1.250.000,25')?.format === '\\#\\,\\#\\#0\\.00', JSON.stringify(ax('7,5')))
ok('D5 yang BUKAN angka murni tetap teks: kode berawalan nol, kode rekening, NIP 18 digit, teks, titik desimal gaya Inggris',
  ['0101', '5.1.02', '196512311990031001', 'A1', '1.25', '', 'Rp', '%'].every(v => ax(v) === null),
  ['0101', '5.1.02', '196512311990031001', '1.25'].map(v => JSON.stringify(ax(v))).join(' '))
ok('D6 sel berformat: persen = pecahan, Rupiah & Angka dgn desimalnya',
  ax('0.125', { nf: 'pct', dec: 1 })?.nilai === 0.125 && ax('0.125', { nf: 'pct', dec: 1 })?.format === '0\\.0%'
  && ax('1250000', { nf: 'rp' })?.format === '\\0022Rp\\0022\\\\ \\#\\,\\#\\#0' && ax('1250000.5', { nf: 'num', dec: 2 })?.format === '\\#\\,\\#\\#0\\.00')
// Sel tertutup gabungan berisi ANGKA basi — kalau tidak, "bukan angka" lulus karena isinya teks.
const rumusX = [baris('10', '20'), [sel('=SUM(A1:B1)'), sel('=A1/0')], [sel('7', { h: true }), sel('5')]]
ok('D7 rumus → hasilnya; rumus galat & sel tertutup gabungan → bukan angka',
  angkaUntukExcel(rumusX, 1, 0)?.nilai === 30 && angkaUntukExcel(rumusX, 1, 0)?.format === null && angkaUntukExcel(rumusX, 1, 1) === null && angkaUntukExcel(rumusX, 2, 0) === null
  && angkaUntukExcel([[sel('1000'), sel('=A1*2')]], 0, 1)?.format === '\\#\\,\\#\\#0' && angkaUntukExcel([[sel('0.2'), sel('=A1/2', { nf: 'pct' })]], 0, 1)?.nilai === 0.1)
const htmlAngka = blokKeHtml([baris('Uraian', 'Nilai'), baris('Kode 0101', '1.250.000')], { r1: 0, c1: 0, r2: 1, c2: 1 }, (r, c) => [['Uraian', 'Nilai'], ['Kode 0101', '1.250.000']][r][c])
ok('D8 dibungkus <html xmlns:x>; x:num hanya di sel angka, teks tanpa x:num',
  htmlAngka.startsWith('<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table') && htmlAngka.endsWith('</table></body></html>')
  && htmlAngka.includes(`<td x:num="1250000" style="${GARIS_X};mso-number-format:'\\#\\,\\#\\#0'">1.250.000</td>`) && hitung(htmlAngka, /x:num=/g) === 1, htmlAngka)
// Ditemukan saat ditempel ke Excel: "0101" (teks) jadi angka 101 — Excel sendiri yang mengubahnya.
const htmlTeks = blokKeHtml([[sel('0101'), sel('Rp 2.000'), sel('85,5%'), sel('')]], { r1: 0, c1: 0, r2: 0, c2: 3 }, (r, c) => ['0101', 'Rp 2.000', '85,5%', ''][c])
ok('D9 teks diberi format Teks Excel (0101 tetap 0101); "Rp 2.000"/"85,5%" polos = angka; sel kosong tanpa format',
  htmlTeks.includes(`<td ${TEKS_X}>0101</td>`) && htmlTeks.includes('x:num="2000"') && htmlTeks.includes('x:num="0.855"')
  && htmlTeks.endsWith(`<td style="${GARIS_X}"></td></tr></table></body></html>`) && ax('Rp 2.000')?.format === '\\0022Rp\\0022\\\\ \\#\\,\\#\\#0' && ax('85,5%')?.format === '0\\.0%'
  && ax('Rp 5%') === null, htmlTeks)
// Susulan §14.3 — dibuktikan dgn menempel ke Word & Excel sungguhan 2026-10-19.
const sk = selSalinan(sel('No'), true, 'right', 'BDD7EE'), sb = selSalinan(sel('7'), false, 'right', 'BDD7EE')
const sw = selSalinan(sel('No', { bg: 'FFF2CC', al: 'left', va: 'top' }), true, undefined, 'BDD7EE')
ok('D10 sel salinan = sel Word: kepala tebal, rata & vertikal tengah, berlatar warna kepala dokumen; format sel menang; badan ikut kolom',
  sk.b === true && sk.al === 'center' && sk.va === 'middle' && sk.bg === 'BDD7EE'
  && !sb.b && sb.al === 'right' && sb.va === undefined && sb.bg === undefined
  && sw.bg === 'FFF2CC' && sw.al === 'left' && sw.va === 'top' && selSalinan(sel('x'), true, undefined, '').bg === undefined, JSON.stringify({ sk, sb, sw }))
const tbJ = [baris('Uraian', 'Nilai'), [sel('A'), sel('1', { bd: { t: 0 } })], baris('JUMLAH', '=SUM(B2:B2)')]
const salinGaya = (g: { jumlah: boolean; selang: boolean; mendatar: boolean }) => blokKeHtml(tbJ, { r1: 0, c1: 0, r2: 2, c2: 1 }, (r, c) => displayValue(tbJ, r, c),
  (r, c) => selSalinan(selBergaya(tbJ[r][c], gayaSel(g, 3, 1, r)), r < 1, undefined, 'EDEDED'))
const hJ = salinGaya({ jumlah: true, selang: false, mendatar: false }), hM = salinGaya({ jumlah: false, selang: false, mendatar: true })
const tebal = `border-top:${GARIS_JUMLAH / 8}pt solid windowtext;border-right:.5pt solid windowtext`
ok('D11 garis ikut aturan Word: baris JUMLAH bergaris atas tebal (w:sz/8 pt), garis 0 = none, gaya garis mendatar melepas kiri-kanan',
  hitung(hJ, new RegExp(tebal, 'g')) === 2 && hJ.includes('border-top:none') && hJ.includes('background:#EDEDED')
  && hitung(hM, /border-right:none;border-bottom:\.5pt solid windowtext;border-left:none/g) === 6
  && buildTabelXml({ kolom: ['Uraian', 'Nilai'], headerRows: 1, rows: tbJ, gaya: { jumlah: true } }, 'Arial', 24, 'EDEDED').includes(`<w:top w:val="single" w:sz="${GARIS_JUMLAH}"`), hJ)
const tg = [[sel('No'), sel('TW I', { rot: true })], baris('1', '2')]
const salinTg = (r: number, c: number) => selSalinan(tg[r][c], r < 1, undefined, '')
const hTg = blokKeHtml(tg, { r1: 0, c1: 0, r2: 1, c2: 1 }, (r, c) => tg[r][c].v, salinTg)
const tinggiTg = tinggiBarisTegak(tg.map((row, r) => row.map((_c, c) => salinTg(r, c))), 0, 12)[0] / 20
ok('D12 teks tegak: mso-rotate:90 + nowrap, TANPA layout-flow (Excel menumpuk hurufnya); hanya baris tegak diberi tinggi (untuk Word)',
  hTg.includes('mso-rotate:90;white-space:nowrap') && !hTg.includes('layout-flow') && tinggiTg > 0
  && hTg.includes(`<tr style="height:${tinggiTg}pt">`) && hitung(hTg, /<tr style=/g) === 1 && !html.includes('<tr style='), hTg)
ok('D13 ukuran huruf sel ikut', blokKeHtml([[sel('a', { fs: 9 })]], { r1: 0, c1: 0, r2: 0, c2: 0 }, () => 'a').includes('font-size:9pt'))
// Terlihat di Excel: JUMLAH "57.755.803.079,01" tertempel "57.755.803.079" — format tanpa desimal.
const rmD = [[sel('57755803000'), sel('79,01'), sel('=A1+B1'), sel('10'), sel('=D1/4'), sel('=D1/3', { nf: 'num', dec: 1 })]]
ok('D14 hasil rumus tanpa format: desimal Excel = desimal yang tampil; sel berformat tetap ikut desimal formatnya',
  angkaUntukExcel(rmD, 0, 2)?.nilai === 57755803079.01 && angkaUntukExcel(rmD, 0, 2)?.format === '\\#\\,\\#\\#0\\.00'
  && angkaUntukExcel(rmD, 0, 4)?.format === '0\\.0' && angkaUntukExcel(rmD, 0, 5)?.format === '\\#\\,\\#\\#0\\.0'
  && displayValue(rmD, 0, 2) === '57.755.803.079,01', JSON.stringify([angkaUntukExcel(rmD, 0, 2), angkaUntukExcel(rmD, 0, 4)]))
const lb = [[sel('1250000', { nf: 'num' }), sel('74154779000', { nf: 'rp' }), sel('Belanja Pegawai dan Barang Jasa'), sel('99999999999', { h: true })]]
const tLb = (r: number, c: number) => displayValue(lb, r, c)
ok('D15 petunjuk lebar kolom: hanya bila ada ANGKA lebih panjang dari "1.250.000" (teks meluber sendiri di Excel)',
  !perluPetunjukLebar(lb, { r1: 0, c1: 0, r2: 0, c2: 0 }, tLb) && perluPetunjukLebar(lb, { r1: 0, c1: 0, r2: 0, c2: 1 }, tLb)
  && !perluPetunjukLebar(lb, { r1: 0, c1: 2, r2: 0, c2: 3 }, tLb))


// ─── E. Nomor Tabel/Gambar/Grafik ─────────────────────────────────────────────
console.log('\nE. Nomor objek: editor = cache SEQ Word (§12.4)')
let idBlok = 0
const blok = (tipe: BlockNode['tipe'], payload: unknown): BlockNode => ({ id: ++idBlok, tipe, payload, urutan: idBlok })
// Heading Word = "nomor judul" (BAB di-huruf-besarkan) — judulnya dibuat unik supaya bisa dicari.
const node = (id: number, nomor: string, depth: number, blocks: BlockNode[], children: SectionNode[] = []): SectionNode =>
  ({ id, parent_id: null, depth, urutan: id, judul: `Bagian ${id}`, locked: 0, nomor, nomorPlain: nomor, blocks, children })
const tabel = (judul: string, x: Record<string, unknown> = {}) => blok('TABEL', {
  judul, kolom: ['No', 'Uraian', 'Nilai'], align: ['center', 'left', 'right'], colWidths: [60, 300, 140], headerRows: 1,
  rows: [baris('No', 'Uraian', 'Nilai'), baris('1', 'Satu', '10'), baris('2', 'Dua', '20')], ...x,
})
const narasi = (t: string) => blok('NARASI', { html: `<p>${t}</p>` })
const pohonE = [
  node(1, 'BAB I', 0, [tabel('T1'), blok('GAMBAR', { judul: 'G1' }), blok('TABEL', { judul: 'kosong', kolom: [] })],
    [node(2, '1.1', 1, [blok('GRAFIK', { judul: 'Gr1' }), tabel('T2')])]),
  node(3, 'BAB II', 0, [blok('GAMBAR', { judul: 'G2' }), tabel('T3')]),
]
const nomE = nomorObjek(pohonE)
const lihat = [...nomE.values()].map(n => `${n.jenis}${n.nomor}`).join(',')
ok('E1 urut pohon (blok induk dulu, lalu anak), dihitung per jenis; tabel tanpa kolom dilewati',
  lihat === 'Tabel1,Gambar1,Grafik1,Tabel2,Gambar2,Tabel3' && !nomE.has(3), lihat)

// ─── F. Word ──────────────────────────────────────────────────────────────────
console.log('\nF. XML Word — dibangun sungguhan')
const pTabel = (x: Record<string, unknown> = {}) => ({
  judul: 'Uji', kolom: ['No', 'Uraian', 'Nilai'], align: ['center', 'left', 'right'], colWidths: [60, 300, 140], headerRows: 1,
  rows: [baris('No', 'Uraian', 'Nilai'), baris('1', 'Satu', '10'), baris('2', 'Dua', '20'), baris('', 'JUMLAH', '30')], ...x,
})
const xmlLama = buildTabelXml(pTabel(), 'Arial', 24, 'EDEDED')
ok('F1 payload lama: tengah, garis lengkap, tanpa teks tegak & tanpa Sumber',
  xmlLama.includes('<w:jc w:val="center"/><w:tblBorders><w:top w:val="single"') && !xmlLama.includes('w:val="nil"')
  && !xmlLama.includes('textDirection') && !xmlLama.includes('Sumber:'))
const xmlTegak = buildTabelXml(pTabel({ rows: [[sel('No', { rot: true }), sel('Uraian'), sel('Nilai')], ...pTabel().rows.slice(1)] }), 'Arial', 24, 'EDEDED')
ok('F2 teks tegak → textDirection btLr, urutan tcPr sesuai skema (shd → textDirection → vAlign)',
  /<w:shd [^>]*\/><w:textDirection w:val="btLr"\/><w:vAlign w:val="center"\/><\/w:tcPr>/.test(xmlTegak) && hitung(xmlTegak, /textDirection/g) === 1)
const xmlGaya = buildTabelXml(pTabel({ gaya: { selang: true, jumlah: true, mendatar: true }, posisi: 'kiri' }), 'Arial', 24, 'EDEDED')
const barisGaya = trs(xmlGaya)
ok('F3 garis mendatar: tblBorders kiri/kanan/insideV nil, sel tanpa garis kiri-kanan',
  xmlGaya.includes('<w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="nil"/>')
  && xmlGaya.includes('<w:insideV w:val="nil"/>') && hitung(xmlGaya, /<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"\/><w:left w:val="nil"\/>/g) >= 9)
ok('F4 baris jumlah: garis atas sz 12 + tebal; selang: badan ke-2 berlatar F2F2F2',
  barisGaya[3].includes('<w:top w:val="single" w:sz="12"') && barisGaya[3].includes('<w:b/>')
  && barisGaya[2].includes(`w:fill="${WARNA_SELANG}"`) && !barisGaya[1].includes(`w:fill="${WARNA_SELANG}"`) && !barisGaya[3].includes(`w:fill="${WARNA_SELANG}"`))
ok('F5 posisi rata kiri → jc left', xmlGaya.includes('<w:tblW w:w="7500" w:type="dxa"/><w:jc w:val="left"/>'))
const xmlPenuh = buildTabelXml(pTabel({ posisi: 'penuh' }), 'Arial', 24, 'EDEDED')
const xmlPenuhLintang = buildTabelXml(pTabel({ posisi: 'penuh', melintang: true }), 'Arial', 24, 'EDEDED')
ok('F6 selebar kertas: tblW = 8788 tegak / 13720 melintang',
  xmlPenuh.includes(`<w:tblW w:w="${LEBAR_TULIS_DXA}"`) && xmlPenuhLintang.includes(`<w:tblW w:w="${LEBAR_TULIS_MELINTANG_DXA}"`))
const xmlSumber = buildTabelXml(pTabel({ sumber: 'Bagian Keuangan, 2026' }), 'Arial', 24, 'EDEDED')
const bSumber = trs(xmlSumber)
ok('F7 baris Sumber: miring rata kiri SESUDAH tabel; baris terakhir diikat ke Sumber',
  /<\/w:tbl><w:p><w:pPr><w:spacing w:before="60" w:after="0"\/><w:jc w:val="left"\/><\/w:pPr><w:r><w:rPr>[^]*?<w:i\/>[^]*?Sumber: Bagian Keuangan, 2026/.test(xmlSumber)
  && bSumber[3].includes('<w:keepNext/>') && !bSumber[2].includes('<w:keepNext/>'))
const bLama = trs(xmlLama)
ok('F8 tanpa Sumber & tanpa "jaga utuh": badan tidak diikat (kepala tetap diikat)',
  bLama[0].includes('<w:keepNext/>') && !bLama[1].includes('<w:keepNext/>') && !bLama[3].includes('<w:keepNext/>'))
const bUtuh = trs(buildTabelXml(pTabel({ utuh: true }), 'Arial', 24, 'EDEDED'))
ok('F9 jaga utuh: semua baris diikat KECUALI yang terakhir (cara Word)',
  bUtuh.slice(0, 3).every(t => t.includes('<w:keepNext/>')) && !bUtuh[3].includes('<w:keepNext/>'))
const xmlNo = buildTabelXml(pTabel({ kolomNomor: 0, gaya: { jumlah: true }, rows: [baris('No', 'Uraian', 'Nilai'), baris('9', 'Satu', '10'), baris('', 'Dua', '20'), baris('', 'JUMLAH', '30')] }), 'Arial', 24, 'EDEDED')
const noWord = trs(xmlNo).map(t => /<w:t xml:space="preserve">([^<]*)<\/w:t>/.exec(t)?.[1]).join('|')
ok('F10 kolom No. dicetak urut dari fungsi yang sama (baris JUMLAH tanpa nomor)', noWord === 'No|1|2|', noWord)
ok('F11 urutan pPr sel sesuai skema: keepNext → spacing → jc (tak ada jc mendahului spacing)',
  xmlLama.includes('<w:keepNext/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/>') && !/<w:jc w:val="[a-z]+"\/><w:spacing /.test(xmlLama))
// Dibuka di Word 2026-10-19: sel mewarisi spasi dokumen 1,5 sehingga tabel memanjang separuh lagi.
const xmlKepalaLama = buildTabelXml({ kolom: ['A', 'B'], rows: [baris('1', '2')] }, 'Arial', 24, 'EDEDED')
ok('F29 semua paragraf sel berspasi tunggal (juga kepala lama tanpa baris kepala); tak ada sel yang mewarisi spasi dokumen',
  hitung(xmlLama, /<w:tc>/g) === 12 && hitung(xmlLama, /<w:spacing w:after="0" w:line="240" w:lineRule="auto"\/>/g) === 12
  && hitung(xmlKepalaLama, /<w:spacing w:after="0" w:line="240" w:lineRule="auto"\/>/g) === 4 && !xmlLama.includes('<w:spacing w:after="0"/>'),
  `${hitung(xmlLama, /<w:tc>/g)} sel, ${hitung(xmlLama, /w:line="240"/g)} tunggal`)

// Dokumen utuh: tabel melintang di tengah BAB III
const tb = (judul: string, melintang = false) => tabel(judul, melintang ? { melintang: true } : {})
const pohonF = [
  node(11, 'BAB I', 0, [narasi('Pendahuluan')]),
  node(12, 'BAB II', 0, [narasi('Isi bab dua'), tb('Tegak satu')]),
  node(13, 'BAB III', 0, [], [
    node(14, '3.1', 1, [tb('Melintang satu', true), narasi('Penjelasan'), tb('Melintang dua', true), tb('Melintang tiga', true), narasi('Penutup')]),
  ]),
]
async function docx(tree: SectionNode[], cfg: Partial<StyleConfig> = {}) {
  const { buffer } = await rakitDocx({ tree, judul: 'Uji', tahun: 2099, canonical_id: 'LKJIP-UJI', style_config: { ...DEFAULT_STYLE, ...cfg } })
  return new PizZip(buffer)
}
const zipF = await docx(pohonF)
const dok = zipF.file('word/document.xml')!.asText()
const sect = [...dok.matchAll(/<w:sectPr>([\s\S]*?)<\/w:sectPr>/g)].map(m => ({ isi: m[1], akhir: m.index! + m[0].length }))
const lintang = (s: string) => s.includes('w:orient="landscape"')
ok('F12 section: sampul · daftar (romawi) · tegak · melintang · tegak · melintang · tegak',
  sect.map(s => (s.isi.includes('lowerRoman') ? 'R' : lintang(s.isi) ? 'L' : s.isi.includes('decimal') ? 'P' : 'S')).join('') === 'SRPLPLP',
  sect.map(s => (s.isi.includes('lowerRoman') ? 'R' : lintang(s.isi) ? 'L' : s.isi.includes('decimal') ? 'P' : 'S')).join(''))
ok('F13 nomor halaman isi mulai 1 HANYA di section isi pertama — sesudah tabel melintang bersambung',
  hitung(dok, /<w:pgNumType w:fmt="decimal" w:start="1"\/>/g) === 1 && sect[2].isi.includes('w:fmt="decimal" w:start="1"')
  && sect.slice(3).every(s => s.isi.includes('<w:pgNumType w:fmt="decimal"/>')))
ok('F14 halaman melintang: pgSz tertukar + orient, footer sendiri (rId5)',
  sect[3].isi.includes('<w:pgSz w:w="16839" w:h="11907" w:orient="landscape"/>') && sect[3].isi.includes('r:id="rId5"')
  && sect[4].isi.includes('<w:pgSz w:w="11907" w:h="16839"/>') && sect[4].isi.includes('r:id="rId4"'))
// Dicari SESUDAH halaman daftar: judul & keterangan kini juga tertulis di isi awal Daftar Isi/Tabel.
const posisi = (t: string) => dok.indexOf(t, sect[1].akhir)
const diSection = (t: string) => sect.findIndex(s => s.akhir > posisi(t))
ok('F15 judul BAB III & 3.1 yang langsung diikuti tabel melintang ikut halaman melintang',
  diSection('BAB III BAGIAN 13') === 3 && diSection('3.1 Bagian 14') === 3 && diSection('BAB II BAGIAN 12') === 2
  && diSection('Isi bab dua') === 2 && diSection('Penjelasan') === 4, `${diSection('BAB III BAGIAN 13')} ${diSection('3.1 Bagian 14')}`)
ok('F16 dua tabel melintang berurutan berbagi SATU section', diSection('Melintang dua') === 5 && diSection('Melintang tiga') === 5 && diSection('Penutup') === 6)
ok('F17 pemisah section di tengah isi dibuat setipis mungkin (tak melahirkan halaman kosong)',
  hitung(dok, /<w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"\/><w:rPr><w:sz w:val="2"\/><\/w:rPr><w:sectPr>/g) === 4)
const seq = [...dok.matchAll(/SEQ Tabel \\\* ARABIC <\/w:instrText><\/w:r><w:r><w:fldChar w:fldCharType="separate"\/><\/w:r><w:r><w:t xml:space="preserve">(\d+)</g)].map(m => m[1]).join(',')
ok('F18 cache SEQ = nomor editor (penampil yang tak menyegarkan field tidak menulis "Tabel 1" semua)', seq === '1,2,3,4', seq)
ok('F19 footer melintang: tab kanan di 13720; footer tegak tetap 8788; rels & content types terdaftar',
  (await docx(pohonF, { footerText: 'LKJIP' })).file('word/footer2.xml')!.asText().includes('w:pos="13720"')
  && (await docx(pohonF, { footerText: 'LKJIP' })).file('word/footer.xml')!.asText().includes('w:pos="8788"')
  && zipF.file('word/_rels/document.xml.rels')!.asText().includes('Id="rId5"') && zipF.file('[Content_Types].xml')!.asText().includes('/word/footer2.xml'))
const tanpaLintang = (await docx([node(21, 'BAB I', 0, [narasi('a'), tb('t')])])).file('word/document.xml')!.asText()
ok('F20 dokumen tanpa tabel melintang: tetap 3 section seperti dulu (sampul · daftar · isi)',
  hitung(tanpaLintang, /<w:sectPr>/g) === 3 && !tanpaLintang.includes('landscape') && hitung(tanpaLintang, /w:start="1"/g) === 2)
// Isi DIBUKA tabel melintang, nomor halaman tanpa romawi: daftar tetap tegak, nomor mulai 1 di daftar.
const bukaLintang = (await docx([node(31, 'BAB I', 0, [tb('Pembuka', true), narasi('lanjut')])], { romanFront: false })).file('word/document.xml')!.asText()
const sectB = [...bukaLintang.matchAll(/<w:sectPr>([\s\S]*?)<\/w:sectPr>/g)].map(m => m[1])
ok('F21 isi dibuka tabel melintang: daftar tetap tegak (section sendiri), nomor 1 di sana, melintang bersambung',
  sectB.length === 4 && !lintang(sectB[1]) && sectB[1].includes('w:start="1"') && lintang(sectB[2]) && !sectB[2].includes('w:start')
  && bukaLintang.indexOf('DAFTAR GRAFIK') < bukaLintang.indexOf(sectB[1]), sectB.map(s => (lintang(s) ? 'L' : 'P')).join(''))
const tanpaNomor = (await docx(pohonF, { pageNumber: false })).file('word/document.xml')!.asText()
ok('F22 tanpa nomor halaman: section melintang tanpa footer & tanpa pgNumType',
  !tanpaNomor.includes('footerReference') && !tanpaNomor.includes('pgNumType') && hitung(tanpaNomor, /orient="landscape"/g) === 2)
const kosongLintang = (await docx([node(41, 'BAB I', 0, [narasi('a'), blok('TABEL', { judul: 'x', kolom: [], melintang: true }), narasi('b')])])).file('word/document.xml')!.asText()
ok('F24 tabel tanpa kolom (tidak digambar) yang dicentang melintang tidak melahirkan halaman melintang kosong',
  !kosongLintang.includes('landscape') && hitung(kosongLintang, /<w:sectPr>/g) === 3)
// Terbukti di Word 2026-10-19: tanpa tinggi minimum "TW I" tegak terbungkus jadi "TW" / "I".
const kepalaTegak = sanitizeRows([
  [sel('No', { rs: 2 }), sel('Target', { cs: 2 }), sel(''), sel('Satuan', { rs: 2, rot: true })],
  [sel(''), sel('TW I', { rot: true }), sel('TW III', { rot: true }), sel('')],
  [sel('1'), sel('25'), sel('50'), sel('%')],
], 4)
const tinggiT = tinggiBarisTegak(kepalaTegak, 2, 11)
ok('F25 tinggi baris tegak: baris dgn teks tegak dapat tinggi minimum dari teks TERPANJANG; sel tegak 2 baris membagi kebutuhannya; badan 0',
  tinggiT[1] > tinggiT[0] && tinggiT[0] > 0 && tinggiT[2] === 0 && tinggiT[1] >= (perkiraLebarTeks('TW III', 11, true) + 6) * 20
  && tinggiT[1] % 20 === 0 && tinggiBarisTegak(kepalaTegak.map(r => r.map(c => ({ ...c, rot: undefined }))), 2, 11).every(t => t === 0), tinggiT.join())
ok('F26 lebar perkiraan: huruf sempit < huruf besar < M/W; tebal lebih lebar',
  perkiraLebarTeks('iii', 10, false) < perkiraLebarTeks('AAA', 10, false) && perkiraLebarTeks('AAA', 10, false) < perkiraLebarTeks('WWW', 10, false)
  && perkiraLebarTeks('TW', 10, true) > perkiraLebarTeks('TW', 10, false))
const bTegak = trs(xmlTegak)
ok('F27 Word: trHeight atLeast hanya di baris bertulisan tegak',
  /<w:trPr><w:tblHeader\/><w:cantSplit\/><w:trHeight w:val="\d+" w:hRule="atLeast"\/><\/w:trPr>/.test(bTegak[0]) && !bTegak[1].includes('trHeight') && !xmlLama.includes('trHeight'))
ok('F28 judul tabel rata kiri ikut rata kiri; posisi lain tetap di tengah',
  xmlGaya.includes('<w:pStyle w:val="Caption"/><w:keepNext/><w:jc w:val="left"/>') && xmlPenuh.includes('<w:pStyle w:val="Caption"/><w:keepNext/><w:jc w:val="center"/>'))
// Diuji 2026-10-19 (Word dibuka TANPA menyegarkan field = cara pratinjau Drive/ponsel membaca): daftar dulu
// cuma "Klik kanan → Update Field". Kini isi awalnya daftar itu sendiri, tanpa nomor halaman.
const hasilField = (instr: string) => {
  const i = dok.indexOf(instr), s = dok.indexOf('w:fldCharType="separate"', i), e = dok.indexOf('w:fldCharType="end"', s)
  return [...dok.slice(s, e).matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map(m => m[1])
}
const capIsi = [...dok.slice(sect[1].akhir).matchAll(/SEQ Tabel \\\* ARABIC <\/w:instrText>[\s\S]*?<w:t xml:space="preserve">(\d+)<\/w:t>[\s\S]*?<w:t xml:space="preserve">([^<]+)<\/w:t><\/w:r><\/w:p>/g)].map(m => `Tabel ${m[1]} ${m[2]}`)
const daftarIsi = hasilField(' TOC \\o "1-6"'), daftarTabel = hasilField(' TOC \\h \\z \\c "Tabel"')
ok('F30 isi awal Daftar Isi = judul bagian (berjenjang), Daftar Tabel = "Tabel n Judul" PERSIS seperti keterangan di isi, + catatan',
  JSON.stringify(daftarIsi.slice(0, -1)) === JSON.stringify(['BAB I BAGIAN 11', 'BAB II BAGIAN 12', 'BAB III BAGIAN 13', '3.1 Bagian 14'])
  && JSON.stringify(daftarTabel.slice(0, -1)) === JSON.stringify(capIsi) && capIsi.length === 4 && capIsi[2] === 'Tabel 3 Melintang dua'
  && daftarIsi.at(-1) === CATATAN_DAFTAR && daftarTabel.at(-1) === CATATAN_DAFTAR
  && dok.includes('<w:ind w:left="440"/><w:jc w:val="left"/></w:pPr><w:r>') && !dok.includes('untuk memuat daftar'), `${daftarTabel.join(' | ')} ≠ ${capIsi.join(' | ')}`)
ok('F31 daftar kosong menulis "Belum ada …"; tiap field tetap utuh (begin = separate = end)',
  JSON.stringify(hasilField(' TOC \\h \\z \\c "Gambar"')) === JSON.stringify(['Belum ada gambar.', CATATAN_DAFTAR])
  && hitung(dok, /w:fldCharType="begin"/g) === hitung(dok, /w:fldCharType="end"/g) && hitung(dok, /w:fldCharType="begin"/g) === hitung(dok, /w:fldCharType="separate"/g))
const t32 = [node(53, 'BAB I', 0, [blok('GRAFIK', { judul: 'Serapan', caption: 'per bulan' }), blok('GAMBAR', { judul: ' ', caption: '' }), blok('TABEL', { judul: 'x', kolom: [] })])]
const e32 = entriDaftar(t32, nomorObjek(t32))
ok('F32 entri grafik/gambar memakai rumusan keterangan yang sama (judul — keterangan); tabel tanpa kolom tidak didaftar',
  e32.isi[0].teks === 'BAB I BAGIAN 53' && e32.Grafik[0]?.teks === 'Grafik 1 Serapan — per bulan' && e32.Gambar[0]?.teks === 'Gambar 1' && e32.Tabel.length === 0, JSON.stringify(e32))
ok('F23 kelompokSection: potongan berurutan sama arah digabung; kosong = satu section tegak',
  JSON.stringify(kelompokSection([{ melintang: false, xml: 'a' }, { melintang: false, xml: 'b' }, { melintang: true, xml: 'c' }])) === '[{"melintang":false,"xml":"ab"},{"melintang":true,"xml":"c"}]'
  && JSON.stringify(kelompokSection([])) === '[{"melintang":false,"xml":""}]')

// ─── G. Skema simpan ──────────────────────────────────────────────────────────
console.log('\nG. Skema simpan — kunci baru WAJIB terdaftar (Zod membuang yang tak dikenal)')
const disimpan = TabelPayloadSchema.parse({
  kolom: ['No', 'U'], headerRows: 1, rows: [[{ v: 'No', rot: true }, { v: 'U' }], [{ v: '1' }, { v: 'a' }]],
  melintang: true, posisi: 'penuh', gaya: { selang: true, jumlah: true, mendatar: true }, sumber: 'BPS', utuh: true, kolomNomor: 0,
})
ok('G1 pengaturan cetak & teks tegak bertahan disimpan',
  disimpan.melintang === true && disimpan.posisi === 'penuh' && disimpan.gaya.mendatar === true && disimpan.sumber === 'BPS'
  && disimpan.utuh === true && disimpan.kolomNomor === 0 && (disimpan.rows[0][0] as TabelCell).rot === true)
const lama = TabelPayloadSchema.parse({ kolom: ['A'], rows: [] })
ok('G2 payload lama mendapat bawaan', lama.melintang === false && lama.posisi === 'tengah' && JSON.stringify(lama.gaya) === '{}' && lama.sumber === '' && lama.kolomNomor === null)
ok('G3 nilai ngawur ditolak', !TabelPayloadSchema.safeParse({ kolom: ['A'], posisi: 'atas' }).success
  && !TabelPayloadSchema.safeParse({ kolom: ['A'], kolomNomor: 12 }).success && !TabelPayloadSchema.safeParse({ kolom: ['A'], sumber: 'x'.repeat(301) }).success)
ok('G4 sel: rot dibaca normalizeCell, ikut disalin, dibuang "hapus format"',
  normalizeCell({ v: 'a', rot: true }).rot === true && normalizeCell({ v: 'a', rot: 'ya' }).rot === undefined
  && extractRange([[sel('a', { rot: true })]], 0, 0, 0, 0)[0][0].rot === true && tanpaFormat(sel('a', { rot: true })).rot === undefined)

// ─── H. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nH. Sambungan layar')
const te = kode('components/tabel/TabelEditor.tsx')
const ec = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
ok('H1 Simpan membawa pengaturan cetak & baris YANG TAMPIL (kolom No. terisi)',
  badan(te, 'const payloadSekarang = (): PayloadTabel & AturTabel =>').includes('rows: rowsTampil,')
  && badan(te, 'const payloadSekarang = (): PayloadTabel & AturTabel =>').includes('...atur, sumber: atur.sumber.trim(), kolomNomor: kolomNo,'))
ok('H2 Hubungkan/Perbarui/Lepas: pengaturan dibaca balik; kolom No. lepas begitu tertaut',
  badan(te, 'const pasangDanSimpan = (masuk: PayloadTabel) =>').includes('const p = masuk.tautan ? { ...masuk, kolomNomor: null } : masuk;')
  && badan(te, 'const pasangDanSimpan = (masuk: PayloadTabel) =>').includes('setAtur(bacaAtur(p));'))
ok('H3 Urungkan memulihkan pengaturan juga', te.includes('rows, atur });') && te.includes('setAtur(s.atur);'))
ok('H4 kolom No. turunan dari bentuk tabel; tertaut tidak pernah bernomor otomatis',
  te.includes('const kolomNo = terkait || atur.kolomNomor === null || atur.kolomNomor >= ncol ? null : atur.kolomNomor;')
  && te.includes('nomorUlang(rows, headerRows, kolomNo, !!atur.gaya.jumlah)')
  && badan(te, 'const mulaiSunting =').includes('if (diNomor(r, c)) {'))
ok('H5 kolom No. ikut sisip/hapus kolom lewat bentuk tabel',
  te.includes('kolomNomor: atur.kolomNomor });') && badan(te, 'const pasangBentuk = (b: BentukTabel) =>').includes('setAtur(a => ({ ...a, kolomNomor: b.kolomNomor ?? null }))'))
ok('H6 sel digambar lewat fungsi gaya yang SAMA dengan Word',
  te.includes('selBergaya(rowsTampil[r][c], gayaSel(atur.gaya, rowsTampil.length, headerRows, r))') && te.includes('const ef = efektif(ri, ci);')
  && te.includes("background: ef.bg ? `#${ef.bg}` : undefined, ...garisCss(ef.bd)"))
ok('H7 Tab di sel terakhir menambah baris — tidak di tabel tertaut / lewat batas',
  badan(te, 'const barisBaruDiAkhir = () =>').includes('if (terkait || rows.length >= BATAS_BARIS_TABEL) return false;')
  && badan(te, "if (k === 'Tab')").includes('if (!e.shiftKey && diSelTerakhir(sel.ar, sel.ac) && barisBaruDiAkhir()) return;')
  && te.includes('if (!e.shiftKey && diSelTerakhir(ri, ci)) { selesaiSunting(); barisBaruDiAkhir(); }')
  // Tab & "+ Baris" memakai SATU aturan (di atas JUMLAH + rentang dipanjangkan)
  && badan(te, 'const barisBaruDiAkhir = () =>').includes('setRows(r => sisipBarisBaru(r, headerRows, ncol, !!atur.gaya.jumlah).rows);')
  && te.includes('pushHist(); setRows(sisipBarisBaru(rows, headerRows, ncol, !!atur.gaya.jumlah).rows); }} disabled={terkait}')
  && te.includes('const barisBaruDi = () => posisiBarisBaru(rows.length, headerRows, !!atur.gaya.jumlah);')
  // Ditemukan di layar: kursor mendarat di kolom No. otomatis yang menolak ketikan.
  && badan(te, 'const barisBaruDiAkhir = () =>').includes('const ac = kolomNo === 0 && ncol > 1 ? 1 : 0;'))
ok('H8 Ctrl+C / tombol Salin mengisi papan klip dengan TSV DAN HTML',
  te.includes('onCopy={salinKePapan}') && badan(te, 'const salinKePapan = (e: React.ClipboardEvent) =>').includes("e.clipboardData.setData('text/html', html);")
  && badan(te, 'const salinKePapan = (e: React.ClipboardEvent) =>').includes("e.clipboardData.setData('text/plain', tsvPilihan);"))
ok('H9 teks tegak = format sel (kunci badan tertaut berlaku); garis kertas ikut orientasi',
  te.includes("disabled={kunciBlok}\n            onClick={() => { const tegak = !origin?.rot;") && te.includes('const kertasPx = kertas?.px ?? lebarKertasPx(atur.melintang);')
  && te.includes('paskanKeKertas(colWidths, kertasPx)'))
// Tahap C §12.5: nomor bisa per BAB — label ("3.1") dari fungsi yang sama, setelan dokumen ikut.
ok('H10 nomor blok & pemilih tabel grafik memakai nomorObjek (sama dengan Word)',
  ec.includes('const nomorBlok = useMemo(() => nomorObjek(detail.tree, detail.style_config.nomorPerBab), [detail.tree, detail.style_config.nomorPerBab]);') && ec.includes('nomor={nomorBlok.get(b.id)}')
  && ec.includes('`Tabel ${nomorBlok?.get(b.id)?.label ?? i + 1}`') && ec.includes('{nomor && <span className="lk-block-nomor">{sebutObjek(nomor)}</span>}'))
// 375 px: kerangka 320 px dulu menyisakan ± 55 px untuk isi, dan judul dokumen terjepit sampai lebar 0.
// Media query WAJIB sesudah aturan berkekhususan sama (sempat ditaruh di atas lalu kalah).
const iMedia = ec.indexOf('@media (max-width: 760px)'), mediaCss = ec.slice(iMedia, ec.indexOf('}\n`;', iMedia) + 1)
ok('H12 tata letak ponsel: kerangka di atas, isi selebar layar, judul berbaris sendiri — dan menang atas aturan sebelumnya',
  [ec.indexOf('.lk-tree { border-right: 1px solid'), ec.indexOf('.lk-editor { overflow-y: auto'), ec.indexOf('[data-theme="light"] .lk-tree { background')]
    .every(i => i > 0 && i < iMedia)
  && mediaCss.includes('.lk-ed-grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto 1fr; }')
  && mediaCss.includes('.lk-tree { border-right: none; border-bottom: 1px solid #0C447C; max-height: 34vh; }')
  && mediaCss.includes('.lk-ed-title { flex: 1 1 100%; }') && mediaCss.includes('flex-wrap: wrap'))
const alatTabel = te.slice(te.indexOf('className="lk-tabel-tools"'), te.indexOf('className="lk-fbar"'))
ok('H13 tiap tombol ikon bilah alat tabel bernama untuk pembaca layar (aria-label), bukan cuma tooltip',
  // 16 + Tahap B/C: miring, garis bawah, kuas, potong, Σ, urutkan ×2, cari.
  alatTabel.length > 1000 && hitung(alatTabel, /<button(?![^>]*aria-label=)/g) === 0 && hitung(alatTabel, /<button aria-label="[^"]+"/g) === 24, String(hitung(alatTabel, /<button aria-label="[^"]+"/g)))
const salinB = badan(te, 'const salinKePapan = (e: React.ClipboardEvent) =>')
ok('H14 salinan memakai selSalinan + warna kepala dokumen; petunjuk lebar kolom sekali per editor',
  salinB.includes('selSalinan(efektif(r, c), r < headerRows, align[c], warnaKepala)')
  && salinB.includes('if (!petunjukLebarRef.current && perluPetunjukLebar(rowsTampil, rect, teks)) {') && salinB.includes('petunjukLebarRef.current = true;')
  && ec.includes('warnaKepalaTabel={detail.style_config.tableHeaderFill}') && ec.includes('warnaKepala={warnaKepalaTabel}'))
// Terukur 2026-10-19 di 375 px: dock editor 514 px, "Daftar" & "Panduan" seluruhnya di luar layar.
const dockSrc = kode('components/ui/FloatingDock.tsx'), gcss = readFileSync('app/globals.css', 'utf8')
const iDock = gcss.indexOf('.prima-dock { max-width: calc(100vw - 16px); }'), dockCss = gcss.slice(gcss.lastIndexOf('@media (max-width: 560px)', iDock), gcss.indexOf('\n}\n', iDock))
ok('H15 dock di layar sempit: selebar layar, isinya bisa digeser (tombol tidak menyusut), latar tidak ikut memudar',
  dockSrc.includes('<div className="prima-dock" style={{ position: \'fixed\'') && dockSrc.includes('<div className="prima-dock-isi" style={{ position: \'relative\', display: \'flex\'')
  && iDock > 0 && dockCss.includes('.prima-dock-isi {') && dockCss.includes('overflow-x: auto;') && dockCss.includes('.prima-dock-isi > * { flex-shrink: 0; }')
  && dockCss.includes('mask-image:') && !/\.prima-dock \{[^}]*mask/.test(dockCss))
ok('H11 Sumber: satu langkah urungkan per sunting (bukan per huruf)', te.includes("onFocus={() => { if (!readOnly) pushHist(); }}") && te.includes('onChange={e => setAtur(a => ({ ...a, sumber: e.target.value }))}'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(' | ')); process.exit(1) }
