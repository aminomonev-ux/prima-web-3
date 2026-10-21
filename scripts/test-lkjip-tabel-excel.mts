// scripts/test-lkjip-tabel-excel.mts — tabel LKJIP ala Excel + kepala tabel di modal (Tahap A).
// Konsep: docs/CONCEPT-lkjip-tabel-excel.md
//
// A: T1/T2 angka & rumus gaya Indonesia · B: sel galat (#ERR/#REF!) · C: rumus ikut bergeser (E6)
// D: sisip/hapus baris & kolom, gabungan menyesuaikan · E: memilih & melangkah
// F: kepala selalu sel (E1–E3) · G: kisi kepala di modal (§4) — gambar acuan pemakai disusun dari modal saja
// H: Word (W1, W2, T3, E7, E1 identik) · I: skema simpan · J: Finalisasi menyebut sel galat
// K: sambungan layar (komentar dibuang dulu — L82c)
//
// Jalankan: npx tsx scripts/test-lkjip-tabel-excel.mts

import { readFileSync } from 'node:fs'
import {
  displayValue, angkaSel, formatUmum, nilaiKetikan, teksSelWord, daftarSelGalat, geserRujukanRumus,
  sisipBaris, hapusBaris, sisipKolom, hapusKolom, sisipBarisSel, luaskanPilihan, langkahSel, lompatSel,
  selMilikKolom, namaKolomDariKepala, pastikanKepalaSel, ubahJumlahKepala, letakAwal, rapikanLetak,
  rencanaGabungKepala, gabungKepala, rapikanKepala, tukarKolomSel, kosongkanBlok, lebarKolomWord, paskanKeKertas,
  unmergeAt, sanitizeRows, kolomSegabung, LEBAR_TULIS_DXA, LEBAR_KERTAS_PX,
  type TabelCell, type BentukTabel,
} from '../lib/lkjip/tabel'
import { petakanRumusKolom, periksaRumusKolom, bangunBadan, type HasilTarik } from '../lib/lkjip/tautan'
import { kumpulkanSelGalat } from '../lib/lkjip/kesegaran'
import { TabelPayloadSchema } from '../lib/lkjip/schemas'
import { buildTabelXml, buildGambarXml } from '../lib/lkjip/docgen'

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
const teks = (rows: TabelCell[][]) => rows.map(r => r.map(c => (c.h ? '·' : c.v + (c.cs ? `[cs${c.cs}]` : '') + (c.rs ? `[rs${c.rs}]` : ''))).join('|')).join(' / ')
const bentuk = (rows: TabelCell[][], headerRows = 1): BentukTabel => {
  const n = rows[0].length
  return { rows: sanitizeRows(rows, n), kolom: Array.from({ length: n }, (_, i) => `K${i + 1}`), align: Array.from({ length: n }, () => 'left' as const), colWidths: Array.from({ length: n }, () => 140), headerRows }
}

// ─── A. T1/T2: angka & rumus gaya Indonesia ───────────────────────────────────
console.log('\nA. Angka & rumus gaya Indonesia (T1/T2)')
const anggaran = [baris('Uraian', 'Nilai'), baris('a', '1.250.000'), baris('b', '7,5'), baris('Jumlah', '=SUM(B2:B3)')]
ok('A1 T1: rumus membaca "1.250.000" + "7,5" sebagai 1.250.007,5 (dulu 1,25 + 75)', displayValue(anggaran, 3, 1) === '1.250.007,5', displayValue(anggaran, 3, 1))
ok('A2 T2: hasil rumus tanpa format ditulis gaya Indonesia, derau IEEE dibuang',
  formatUmum(1250000.5) === '1.250.000,5' && formatUmum(0.1 + 0.2) === '0,3' && formatUmum(-1234) === '-1.234' && formatUmum(7) === '7')
ok('A3 sel berformat menyimpan angka MESIN: "0.125" persen = 12,5 (bukan 125 gaya ribuan)',
  angkaSel([[sel('0.125', { nf: 'pct' })]], 0, 0) === 12.5 && displayValue([[sel('0.125', { nf: 'pct', dec: 1 })]], 0, 0) === '12,5%')
ok('A4 sel polos tetap dibaca gaya Indonesia ("0,125", "12.500")',
  angkaSel([[sel('0,125')]], 0, 0) === 0.125 && angkaSel([[sel('12.500')]], 0, 0) === 12500)
const rp = sel('', { nf: 'rp' })
ok('A5 ketikan di sel Rupiah disimpan sebagai angka mesin ("1.250.000" dulu tampil "Rp 1")',
  nilaiKetikan(rp, '1.250.000') === '1250000' && nilaiKetikan(rp, '1.250') === '1250' && nilaiKetikan(rp, '7,5') === '7.5' && nilaiKetikan(rp, '12.5') === '12.5')
ok('A6 teks tanpa angka, rumus, dan sel polos tidak diubah',
  nilaiKetikan(rp, '—') === '—' && nilaiKetikan(rp, '=A1') === '=A1' && nilaiKetikan(sel(''), '1.250.000') === '1.250.000')
ok('A7 tampilan sel Rupiah dari ketikan lama "1.250.000" kini benar', displayValue([[sel('1.250.000', { nf: 'rp' })]], 0, 0) === 'Rp 1.250.000')
// Kolom rumus tabel tertaut juga lewat evaluator ini: 0,125 × 2 = 0,25 — bukan 250.
const hasilKecil: HasilTarik = {
  kolom: [{ kunci: 'label', label: 'Uraian', jenis: 'teks' }, { kunci: 'a', label: 'A', jenis: 'angka' }, { kunci: 'b', label: 'B', jenis: 'angka' }],
  baris: [{ kunci: 'x', label: 'x', sel: { label: 'x', a: 0.125, b: 2 } }], catatan: [], ringkas: 'uji',
}
const badanKecil = bangunBadan(hasilKecil, {
  kolom: [{ isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'sumber', kunci: 'a' } }, { isi: { jenis: 'sumber', kunci: 'b' } }, { isi: { jenis: 'rumus', ekspresi: '=B*C' }, desimal: 2 }],
  sembunyi: [], tebalInduk: false,
})
ok('A8 kolom rumus tertaut: 0,125 × 2 = 0,25 (sel bantu dibaca sebagai angka mesin)', displayValue(badanKecil.rows, 0, 3) === '0,25', displayValue(badanKecil.rows, 0, 3))

// ─── B. Sel galat ─────────────────────────────────────────────────────────────
console.log('\nB. Sel galat (E7)')
const galatRows = [baris('1', '=A1/0', '=#REF!+1', '=A1*2')]
ok('B1 bagi nol → #ERR, rujukan hilang → #REF!', displayValue(galatRows, 0, 1) === '#ERR' && displayValue(galatRows, 0, 2) === '#REF!')
ok('B2 Word menerima "—", bukan #ERR/#REF!', teksSelWord(galatRows, 0, 1) === '—' && teksSelWord(galatRows, 0, 2) === '—' && teksSelWord(galatRows, 0, 3) === '2')
ok('B3 alamat sel galat disebut', daftarSelGalat(galatRows).join() === 'B1,C1', daftarSelGalat(galatRows).join())

// ─── C. Rumus ikut bergeser (E6) ──────────────────────────────────────────────
console.log('\nC. Rumus ikut bergeser')
ok('C1 sisip 2 baris sebelum baris 2: A1 tetap, B2 → B4', geserRujukanRumus('=A1+B2', { sumbu: 'baris', sisip: 1, n: 2 }) === '=A1+B4')
ok('C2 rentang A1:A10, baris 5 dihapus → A1:A9 (contoh konsep §10)', geserRujukanRumus('=SUM(A1:A10)', { sumbu: 'baris', hapus: [4, 4] }) === '=SUM(A1:A9)')
ok('C3 rujukan ke baris yang dihapus → #REF!', geserRujukanRumus('=A5*2', { sumbu: 'baris', hapus: [4, 4] }) === '=#REF!*2')
ok('C4 rentang yang seluruhnya terhapus → #REF!', geserRujukanRumus('=SUM(A3:A4)', { sumbu: 'baris', hapus: [2, 3] }) === '=SUM(#REF!)')
ok('C5 sisip di DALAM rentang memanjangkannya', geserRujukanRumus('=SUM(B2:B3)', { sumbu: 'baris', sisip: 2, n: 1 }) === '=SUM(B2:B4)')
ok('C6 kolom: sisip sebelum D → C1-E1; hapus C → #REF!-C1',
  geserRujukanRumus('=C1-D1', { sumbu: 'kolom', sisip: 3, n: 1 }) === '=C1-E1' && geserRujukanRumus('=C1-D1', { sumbu: 'kolom', hapus: [2, 2] }) === '=#REF!-C1')
ok('C7 nama fungsi & angka tidak disentuh; teks biasa dibiarkan',
  geserRujukanRumus('=ROUND(B2,1)', { sumbu: 'baris', sisip: 0, n: 1 }) === '=ROUND(B3,1)' && geserRujukanRumus('A1 bukan rumus', { sumbu: 'baris', sisip: 0, n: 1 }) === 'A1 bukan rumus')
ok('C8 tanda $ dipertahankan', geserRujukanRumus('=$A$2+A$2', { sumbu: 'baris', sisip: 0, n: 1 }) === '=$A$3+A$3')
// Rujukan absolut dulu #ERR: tokenizer melewati `$`, jadi $B$2 terpecah jadi "B" + "2".
const mutlak = [baris('A', '10'), baris('B', '20'), baris('C', '5'), baris('X', '')]
const nilaiMutlak = (f: string) => { const r = mutlak.map(b => b.map(c => ({ ...c }))); r[3][1].v = f; return displayValue(r, 3, 1) }
ok('C9 rujukan absolut dinilai sama dengan rujukan biasa ($B$2, B$2, $B2, huruf kecil)',
  ['=$B$2', '=B$2', '=$B2', '=$b$2', '=B2'].every(f => nilaiMutlak(f) === '20'), ['=$B$2', '=B$2', '=$B2'].map(nilaiMutlak).join(','))
ok('C10 rentang & fungsi ber-$: SUM($B$1:$B$3) = 35, campuran + rujukan tunggal = 45, rentang telanjang = 35',
  nilaiMutlak('=SUM($B$1:$B$3)') === '35' && nilaiMutlak('=SUM($B1:B$3)+$B$1') === '45' && nilaiMutlak('=$B$1:$B$3') === '35' && nilaiMutlak('=MAX($B$1:$B$3)*2') === '40',
  [nilaiMutlak('=SUM($B$1:$B$3)'), nilaiMutlak('=SUM($B1:B$3)+$B$1'), nilaiMutlak('=$B$1:$B$3')].join(','))
const mutlakGeser = sisipBarisSel([...mutlak.slice(0, 3), [sel('X'), sel('=$B$2*2')]], 0, 1, 2)
ok('C11 sisip baris di atas: $B$2 bergeser jadi $B$3 (cara Excel) dan nilainya tetap 40',
  mutlakGeser[4][1].v === '=$B$3*2' && displayValue(mutlakGeser, 4, 1) === '40', `${mutlakGeser[4][1].v} = ${displayValue(mutlakGeser, 4, 1)}`)
ok('C12 `$` yang bukan bagian rujukan utuh = galat, bukan dilewati diam-diam (dulu =$$B2 terbaca 20, =$5 terbaca 5)',
  nilaiMutlak('=$B$') === '#ERR' && nilaiMutlak('=$$B2') === '#ERR' && nilaiMutlak('=$5') === '#ERR' && nilaiMutlak('=5') === '5',
  ['=$B$', '=$$B2', '=$5'].map(nilaiMutlak).join(','))
ok('C13 rumus KOLOM tertaut tetap menolak $ — dengan kalimat yang menunjuk cara benar',
  ((periksaRumusKolom('=$C-D', 4, 0) as { galat?: string }).galat ?? '').includes('Tanda $ tidak dipakai di rumus kolom')
  && ((periksaRumusKolom('=C-$D', 4, 0) as { galat?: string }).galat ?? '').includes('bukan $C-$D'))

// ─── D. Sisip / hapus baris & kolom ───────────────────────────────────────────
console.log('\nD. Sisip/hapus baris & kolom')
const gab = bentuk([baris('H', 'H2'), [sel('G', { rs: 3 }), sel('1')], baris('', '2'), baris('', '3')], 1)
ok('D1 sisip di DALAM gabungan → gabungan memanjang', teks(sisipBaris(gab, 2, 1).rows) === 'H|H2 / G[rs4]|1 / ·| / ·|2 / ·|3', teks(sisipBaris(gab, 2, 1).rows))
ok('D2 sisip di atas asal gabungan → gabungan bergeser utuh', teks(sisipBaris(gab, 1, 1).rows) === 'H|H2 / | / G[rs3]|1 / ·|2 / ·|3')
ok('D3 hapus baris di dalam gabungan → gabungan memendek', teks(hapusBaris(gab, 2, 2).rows) === 'H|H2 / G[rs2]|1 / ·|3')
ok('D4 baris ASAL gabungan dihapus → teksnya pindah ke baris pertama yang tersisa', teks(hapusBaris(gab, 1, 1).rows) === 'H|H2 / G[rs2]|2 / ·|3', teks(hapusBaris(gab, 1, 1).rows))
ok('D5 kepala: sisip sebelum baris kepala → kepala bertambah; di bawah kepala (ikut kepala) juga',
  sisipBaris(gab, 0, 1).headerRows === 2 && sisipBaris(gab, 1, 1).headerRows === 1 && sisipBaris(gab, 1, 1, true).headerRows === 2)
ok('D6 hapus baris kepala → jumlah kepala berkurang', hapusBaris(gab, 0, 0).headerRows === 0 && hapusBaris(gab, 1, 2).headerRows === 1)
const dgnRumus = bentuk(anggaran, 1)
const sisipR = sisipBaris(dgnRumus, 2, 1)
ok('D7 rumus sel ikut bergeser saat baris disisip, hasilnya tetap', sisipR.rows[4][1].v === '=SUM(B2:B4)' && displayValue(sisipR.rows, 4, 1) === '1.250.007,5')
const hapusR = hapusBaris(dgnRumus, 1, 1)
ok('D8 hapus baris dalam rentang → rentang memendek', hapusR.rows[2][1].v === '=SUM(B2:B2)' && displayValue(hapusR.rows, 2, 1) === '7,5')
const lebarGab = bentuk([[sel('X', { cs: 2 }), sel(''), sel('Y')], baris('a', 'b', 'c')], 1)
const sk = sisipKolom(lebarGab, 1, 1)
ok('D9 sisip kolom di dalam gabungan mendatar → gabungan melebar; larik kolom ikut',
  teks(sk.rows) === 'X[cs3]|·|·|Y / a||b|c' && sk.kolom.length === 4 && sk.align.length === 4 && sk.colWidths.length === 4, teks(sk.rows))
const tigaGab = bentuk([[sel('X', { cs: 3 }), sel(''), sel('')], baris('a', 'b', 'c')], 1)
ok('D10 kolom ASAL gabungan dihapus → teksnya pindah ke kolom berikutnya', teks(hapusKolom(tigaGab, 0, 0).rows) === 'X[cs2]|· / b|c', teks(hapusKolom(tigaGab, 0, 0).rows))
ok('D11 hapus kolom: larik kolom/lebar/perataan ikut', hapusKolom(lebarGab, 2, 2).kolom.join() === 'K1,K2' && hapusKolom(lebarGab, 2, 2).colWidths.length === 2)
const rumusKolom = bentuk([baris('A', 'B', 'C'), baris('1', '2', '=A2+B2')], 1)
ok('D12 rumus ikut saat kolom disisip', sisipKolom(rumusKolom, 1, 1).rows[1][3].v === '=A2+C2')
ok('D13 Delete mengosongkan isi, format & gabungan tetap',
  teks(kosongkanBlok(lebarGab.rows, { r1: 0, c1: 0, r2: 1, c2: 1 })) === '[cs2]|·|Y / ||c'
  && kosongkanBlok([[sel('5', { b: true, nf: 'rp' })]], { r1: 0, c1: 0, r2: 0, c2: 0 })[0][0].b === true)
ok('D14 Delete menghormati kunci (badan tertaut)', kosongkanBlok([baris('a', 'b')], { r1: 0, c1: 0, r2: 0, c2: 1 }, (_r, c) => c === 1)[0].map(c => c.v).join() === 'a,')

// ─── E. Memilih & melangkah ───────────────────────────────────────────────────
console.log('\nE. Memilih & melangkah')
const kisi = sanitizeRows([[sel('a'), sel('B', { cs: 2, rs: 2 }), sel('')], baris('d', '', ''), baris('g', 'h', 'i')], 3)
ok('E1 blok yang menyentuh sebagian gabungan diluaskan sampai menutupnya',
  JSON.stringify(luaskanPilihan(kisi, { r1: 1, c1: 0, r2: 1, c2: 1 })) === JSON.stringify({ r1: 0, c1: 0, r2: 1, c2: 2 }))
ok('E2 panah melompati sel tersembunyi; tepi = diam', JSON.stringify(langkahSel(kisi, 3, 0, 0, 0, 1)) === '{"r":0,"c":1}'
  && JSON.stringify(langkahSel(kisi, 3, 0, 1, 0, 1)) === '{"r":0,"c":1}' && JSON.stringify(langkahSel(kisi, 3, 2, 2, -1, 0)) === '{"r":0,"c":1}'
  && JSON.stringify(langkahSel(kisi, 3, 0, 1, 1, 0)) === '{"r":2,"c":1}')
const deret = [baris('a', 'b', '', '', 'e')]
ok('E3 Ctrl+panah: menyusuri isi sampai ujungnya / melompat ke isi berikutnya / tepi',
  JSON.stringify(lompatSel(deret, 5, 0, 0, 0, 1)) === '{"r":0,"c":1}' && JSON.stringify(lompatSel(deret, 5, 0, 1, 0, 1)) === '{"r":0,"c":4}'
  && JSON.stringify(lompatSel(deret, 5, 0, 4, 0, 1)) === '{"r":0,"c":4}')

// ─── F. Kepala selalu sel (E1–E3) ─────────────────────────────────────────────
console.log('\nF. Kepala tabel')
const lama0 = { kolom: ['Uraian', 'Nilai'], rows: [baris('x', '1')], headerRows: 0 }
const jadi = pastikanKepalaSel(lama0)
ok('F1 E1: tabel ber-headerRows 0 dapat 1 baris kepala berisi nama kolom', jadi.headerRows === 1 && teks(jadi.rows) === 'Uraian|Nilai / x|1')
ok('F2 tabel yang sudah berkepala tidak disentuh', pastikanKepalaSel({ ...lama0, headerRows: 1 }).rows === lama0.rows)
const dua = sanitizeRows([baris('target fisik', 'realisasi fisik', 'Realisasi'), baris('', '', '')], 3)
ok('F3 §4.2 belum digabung → judul di baris 1', [0, 1, 2].map(c => selMilikKolom(dua, 2, c)).join() === '0,0,0')
const gabAB = sanitizeRows([[sel('Uraian', { cs: 2 }), sel(''), sel('Realisasi', { rs: 2 })], baris('target fisik', 'realisasi fisik', '')], 3)
ok('F4 §4.2 A1:B1 digabung → judul A & B di baris 2; C1:C2 → judul C di C1',
  [0, 1, 2].map(c => selMilikKolom(gabAB, 2, c)).join() === '1,1,0')
ok('F5 E2: nama kolom diambil dari sel milik kolomnya', namaKolomDariKepala(gabAB, 2, ['x', 'y', 'z']).join('|') === 'target fisik|realisasi fisik|Realisasi')
ok('F6 kolom tanpa sel milik mempertahankan nama lamanya',
  namaKolomDariKepala(sanitizeRows([[sel('Grup', { cs: 2 }), sel('')]], 2), 1, ['Lama A', 'Lama B']).join('|') === 'Lama A|Lama B')
const tabelBadan = bentuk([baris('Judul', 'Nilai'), baris('b1', '9')], 1)
const kepala2 = ubahJumlahKepala(tabelBadan, 2)
ok('F7 E3: kepala 1 → 2 menyisip baris di ATAS badan (baris data tidak dipinjam)', kepala2.headerRows === 2 && teks(kepala2.rows) === 'Judul|Nilai / | / b1|9')
ok('F8 kepala 2 → 1 membuang baris kepala terbawah, badan utuh', teks(ubahJumlahKepala(kepala2, 1).rows) === 'Judul|Nilai / b1|9' && ubahJumlahKepala(kepala2, 1).headerRows === 1)

// ─── G. Kisi kepala di modal (§4) ─────────────────────────────────────────────
console.log('\nG. Kisi kepala di modal — gambar acuan')
let kp = [baris('target fisik', 'realisasi fisik', 'Realisasi')]
let lt = letakAwal(kp, ['target fisik', 'realisasi fisik', 'Realisasi'])
kp = sisipBarisSel(kp, 1, 1, 3)                        // "Kepala: 2 baris"
const rencana = rencanaGabungKepala(kp, lt, { r1: 0, c1: 0, r2: 0, c2: 1 })
ok('G1 gabung A1:B1: kedua judul punya tempat turun, tak ada teks terbuang',
  rencana.turun.join() === '0,1' && !rencana.tanpaTempat.length && !rencana.terbuang.length)
let g = gabungKepala(kp, lt, rencana, false)
kp = g.kepala; lt = g.letak
ok('G2 judul turun ke A2/B2, A1:B1 kosong siap diketik', teks(kp) === '[cs2]|·|Realisasi / target fisik|realisasi fisik|' && lt.join() === '1,1,0', teks(kp))
kp = kp.map((r, i) => (i === 0 ? r.map((c, j) => (j === 0 ? { ...c, v: 'Uraian' } : c)) : r))
kp = rapikanKepala(kp, lt)
ok('G3 Rapikan ↓ menggabung "Realisasi" ke bawah → C1:C2 = gambar acuan',
  teks(kp) === 'Uraian[cs2]|·|Realisasi[rs2] / target fisik|realisasi fisik|·', teks(kp))
ok('G4 nama kolom hasil modal = judul di kisi', namaKolomDariKepala(kp, 2, ['', '', ''], lt).join('|') === 'target fisik|realisasi fisik|Realisasi')
const pisah = unmergeAt(kp, 0, 0, 3)
ok('G5 §4.4 pisah A1:B1: judul A TIDAK melompat ke A1 ("Uraian") — penunjuknya lengket',
  rapikanLetak(pisah, lt).join() === '1,1,0' && selMilikKolom(pisah, 2, 0) === 0)
const satu = [baris('a', 'b', 'c')]
const tanpaTempat = rencanaGabungKepala(satu, [0, 0, 0], { r1: 0, c1: 0, r2: 0, c2: 1 })
ok('G6 tak ada tempat turun (satu baris kepala) → ditanyakan', tanpaTempat.tanpaTempat.join() === '0,1' && !tanpaTempat.turun.length)
g = gabungKepala(satu, [0, 0, 0], tanpaTempat, true)
ok('G7 "Tambah 1 baris kepala & gabung": judul turun ke baris baru', teks(g.kepala) === '[cs2]|·|c / a|b|' && g.letak.join() === '1,1,0', teks(g.kepala))
g = gabungKepala(satu, [0, 0, 0], tanpaTempat, false)
ok('G8 "Gabung saja": seperti Excel, hanya kiri-atas yang tersisa; kolomnya tanpa sel judul',
  teks(g.kepala) === 'a[cs2]|·|c' && g.letak.join() === ',,0')
const tegak = sanitizeRows([baris('Grup', 'x'), baris('Judul', 'y')], 2)
ok('G9 gabung tegak dengan judul di bawah sel asal yang berisi → ditanyakan',
  rencanaGabungKepala(tegak, [1, 0], { r1: 0, c1: 0, r2: 1, c2: 0 }).tanpaTempat.join() === '0')
ok('G10 gabung tegak, sel asal kosong → judul naik ke sel asal',
  teks(gabungKepala(sanitizeRows([baris('', 'x'), baris('Judul', 'y')], 2), [1, 0], rencanaGabungKepala(sanitizeRows([baris('', 'x'), baris('Judul', 'y')], 2), [1, 0], { r1: 0, c1: 0, r2: 1, c2: 0 }), false).kepala) === 'Judul[rs2]|x / ·|y')
const rapi = rapikanKepala(sanitizeRows([baris('A', 'B'), baris('', ''), baris('isi', '')], 2), [0, 0])
ok('G11 Rapikan tidak menelan sel berisi', teks(rapi) === 'A[rs2]|B[rs3] / ·|· / isi|·', teks(rapi))
ok('G12 teks bukan judul yang tertelan gabungan disebut', rencanaGabungKepala(sanitizeRows([baris('a', 'b'), baris('c', 'lain')], 2), [0, 0], { r1: 0, c1: 0, r2: 1, c2: 1 }).terbuang.join() === 'c,lain')
const kepalaTukar = sanitizeRows([[sel('Uraian', { cs: 2 }), sel(''), sel('X')], baris('a', 'b', 'c')], 3)
ok('G13 tukar kolom: gabungan yang menutup KEDUANYA tetap', teks(tukarKolomSel(kepalaTukar, 0, 1, 3)) === 'Uraian[cs2]|·|X / b|a|c', teks(tukarKolomSel(kepalaTukar, 0, 1, 3)))
ok('G14 tukar kolom: gabungan yang hanya menyentuh salah satunya dipisah (tidak tertukar setengah)',
  teks(tukarKolomSel(kepalaTukar, 1, 2, 3)) === 'Uraian|X| / a|c|b', teks(tukarKolomSel(kepalaTukar, 1, 2, 3)))
ok('G15 kolom tertutup gabungan menyebut kolom pasangannya', kolomSegabung(sanitizeRows([[sel('G', { cs: 2 }), sel('')]], 2), 1).join() === '0')
ok('G16 T4: rumus kolom ikut saat kolom dipindah', petakanRumusKolom('=C-D', [0, 1, 3, 2]) === '=D-C' && petakanRumusKolom('=ROUND(C,2)', [0, 1, 3, 2]) === '=ROUND(D,2)')
const hapusC = petakanRumusKolom('=C-D', [0, 1, null, 2])
ok('G17 T4: kolom yang dirujuk dihapus → #REF! dan rumusnya ditolak (Masukkan ditahan)', hapusC === '=#REF!-C' && (periksaRumusKolom(hapusC, 3, 2) as { galat?: string }).galat?.includes('sudah dihapus') === true)

// ─── H. Word ──────────────────────────────────────────────────────────────────
console.log('\nH. Word')
const xml = buildTabelXml({ judul: 'Uji', kolom: ['A', 'B'], headerRows: 1, rows: [baris('A', 'B'), baris('x', '=1/0')] }, 'Arial', 24, 'D9D9D9')
ok('H1 W1: judul tabel diikat ke tabelnya (keepNext)', xml.startsWith('<w:p><w:pPr><w:pStyle w:val="Caption"/><w:keepNext/>'))
ok('H2 W2: baris badan juga tidak boleh terbelah halaman (cantSplit)', /<w:tr><w:trPr><w:cantSplit\/><\/w:trPr><w:tc>/.test(xml) && (xml.match(/<w:cantSplit\/>/g) ?? []).length === 2)
ok('H3 E7: sel galat dicetak "—", Word tak pernah menerima #ERR', xml.includes('>—</w:t>') && !xml.includes('#ERR'))
// Ditemukan saat dibuka di Microsoft Word: sejak W2, baris data yang tak muat pindah utuh ke
// halaman berikut dan KEPALA-nya tertinggal sendirian di dasar halaman.
const parBaris = (x: string, i: number) => (x.split('<w:tr>')[i + 1] ?? '').match(/<w:p><w:pPr>.*?<\/w:pPr>/g) ?? []
ok('H2b kepala diikat ke baris sesudahnya (keepNext di tiap paragraf kepala), badan tidak',
  parBaris(xml, 0).length === 2 && parBaris(xml, 0).every(p => p.includes('<w:keepNext/>')) && parBaris(xml, 1).every(p => !p.includes('<w:keepNext/>')))
ok('H2c tabel membawa jarak isi sel (teks tidak menempel ke garis)', xml.includes('<w:tblCellMar><w:left w:w="108" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>'))
const lebar8 = buildTabelXml({ kolom: Array.from({ length: 8 }, (_, i) => `K${i}`), colWidths: Array.from({ length: 8 }, () => 140), headerRows: 1, rows: [Array.from({ length: 8 }, () => sel('x'))] }, 'Arial', 24, 'D9D9D9')
const grid8 = [...lebar8.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map(m => Number(m[1]))
ok('H4 T3: 8 kolom bawaan (16.800 dxa) disusutkan ke bidang tulis A4', grid8.reduce((a, b) => a + b, 0) <= LEBAR_TULIS_DXA && grid8.every(w => w === grid8[0]), String(grid8))
ok('H5 tabel yang muat tidak disusutkan', lebarKolomWord([140, 200], 2).join() === '2100,3000')
ok('H6 "Paskan ke lebar kertas" di editor memakai batas yang sama', paskanKeKertas([300, 300, 300]).reduce((a, b) => a + b, 0) <= LEBAR_KERTAS_PX && paskanKeKertas([100, 200]).join() === '100,200')
const xml0 = buildTabelXml({ judul: 'L', kolom: ['Uraian', 'Nilai'], headerRows: 0, rows: [baris('x', '1')] }, 'Arial', 24, 'D9D9D9')
const xml1 = buildTabelXml({ judul: 'L', ...pastikanKepalaSel({ kolom: ['Uraian', 'Nilai'], headerRows: 0, rows: [baris('x', '1')] }) }, 'Arial', 24, 'D9D9D9')
ok('H7 E1: tabel lama yang kepalanya dijadikan sel tercetak SAMA (beda cuma perataan tegak sel satu baris)',
  xml0 === xml1.replace(/<w:vAlign w:val="center"\/>/g, ''))
const gbr = buildGambarXml({ fileId: 'f' }, 'Arial', 24, new Map([['f', { id: 1, relId: 'rId9', mediaName: 'm.png', ext: 'png', wEmu: 10, hEmu: 10 }]]))
ok('H8 W1: gambar diikat ke judulnya yang ada di BAWAH (judul gambar sendiri tidak keepNext)',
  gbr.startsWith('<w:p><w:pPr><w:keepNext/>') && !/w:val="Caption"\/><w:keepNext\/>/.test(gbr))

// ─── I. Skema simpan ──────────────────────────────────────────────────────────
console.log('\nI. Skema simpan')
const tautanUji = {
  sumber: 'kinerja-rekap' as const, setelan: {}, kolom: [{ isi: { jenis: 'nomor' as const } }, { isi: { jenis: 'nomor' as const } }],
  kunciBaris: ['k1'], sembunyi: [], tebalInduk: true, ditarikPada: '2099-01-01 00:00', ringkas: 'uji', catatan: [],
}
const tertautLama = { judul: '', kolom: ['A', 'B'], align: [], headerRows: 0, rows: [baris('1', '2')], tautan: tautanUji }
ok('I1 tabel tertaut lama yang kepalanya dijadikan sel tetap lolos pagar sejajar (kunci baris badan)',
  TabelPayloadSchema.safeParse(pastikanKepalaSel(tertautLama)).success && TabelPayloadSchema.safeParse(tertautLama).success)
ok('I2 kepala 3 baris + gabungan tersimpan utuh', (() => {
  const p = TabelPayloadSchema.safeParse({ judul: '', kolom: ['a', 'b', 'c'], headerRows: 2, rows: kp })
  return p.success && teks(p.data.rows as TabelCell[][]) === teks(kp)
})())

// ─── J. Finalisasi menyebut sel galat ─────────────────────────────────────────
console.log('\nJ. Finalisasi')
const dok = [{ id: 3, nomor: '3.1', judul: 'Anggaran', blocks: [
  { id: 11, tipe: 'TABEL', payload: { judul: 'Rumus rusak', rows: galatRows } },
  { id: 12, tipe: 'TABEL', payload: { judul: 'Sehat', rows: anggaran } },
  { id: 13, tipe: 'NARASI', payload: { html: '<p>=1/0</p>' } },
] }]
const gl = kumpulkanSelGalat(dok)
ok('J1 hanya tabel bergalat yang disebut, lengkap dengan alamat selnya', gl.length === 1 && gl[0].blockId === 11 && gl[0].sel.join() === 'B1,C1' && gl[0].letak === '3.1 Anggaran')

// ─── K. Sambungan layar ───────────────────────────────────────────────────────
console.log('\nK. Sambungan layar')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const te = kode('components/tabel/TabelEditor.tsx')
const kisiSrc = kode('app/(dashboard)/lkjip/[id]/KisiKepala.tsx')
const modal = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
const docgen = kode('lib/lkjip/docgen.ts')
ok('K1 E1: editor menjadikan kepala sel saat dibuka; tabel baru lahir dengan 1 baris kepala',
  te.includes('pastikanKepalaSel({ kolom: kolom0, rows: sanitizeRows(normalizeRows(p0.rows), kolom0.length), headerRows: p0.headerRows ?? 0 })')
  && ed.includes("headerRows: 1, rows: [[{ v: 'Kolom 1' }, { v: 'Kolom 2' }], [{ v: '' }, { v: '' }]]"))
ok('K2 E2: Simpan menulis nama kolom dari kepala', badan(te, 'const payloadSekarang = ():').includes('kolom: namaKolomDariKepala(rows, headerRows, kolom)'))
ok('K3 baris nama kolom (isian + perataan + ×) hilang, diganti bilah huruf kolom',
  !te.includes('lk-colctl') && te.includes('pil.pilihKolom(ci, e.shiftKey)') && te.includes('pil.pilihBaris(ri, e.shiftKey)') && !/delRow|delCol/.test(te))
ok('K4 sisip/hapus memakai fungsi bersama (gabungan & rumus ikut)',
  te.includes('pasangBentuk(sisipBaris(bentuk(), di, n, keKepala));') && te.includes('pasangBentuk(sisipKolom(bentuk(), di, n));')
  && te.includes('pasangBentuk(hapusBaris(bentuk(), r1, r2));') && te.includes('pasangBentuk(hapusKolom(bentuk(), c1, c2));'))
const kunciKey = badan(te, 'const onGridKey = (e: React.KeyboardEvent) =>')
ok('K5 Delete/Backspace mengosongkan blok; mengetik langsung menimpa; Ctrl+− / Ctrl+Shift+=',
  kunciKey.includes("if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); kosongkan(); return; }")
  && kunciKey.includes('mulaiSunting(sel.ar, sel.ac, k);') && kunciKey.includes('void hapusDariPintasan();') && kunciKey.includes('void sisipDariPintasan();'))
ok('K6 T7: Esc membatalkan suntingan (sel & formula bar)',
  badan(te, 'const batalSunting = () =>').includes('setCell(s.r, s.c, s.awal);') && te.includes("else if (e.key === 'Escape') { e.preventDefault(); batalSunting(); }")
  && te.includes("else if (e.key === 'Escape') { e.preventDefault(); if (sel) { setCell(sel.ar, sel.ac, barAwal.current);"))
const tempelFn = badan(te, 'async function tempel(')
ok('K7 T6: tempelan lebih lebar ditawari tambah kolom, sisanya DISEBUT',
  tempelFn.includes('if (p === \'utama\') b = sisipKolom(b, ncol, muat);') && tempelFn.includes('kolom terakhir tempelan tidak muat'))
ok('K8 ketikan di sel berformat dirapikan dari keadaan TERKINI (bukan closure lama)', badan(te, 'const rapikanKetikan =').includes('nilaiKetikan(c, c.v)') && badan(te, 'const selesaiSunting = (arah?: { dr: number; dc: number }) =>').includes('rapikanKetikan(s.r, s.c);'))
ok('K9 kepala N baris = sisip/buang di atas badan (E3) untuk SEMUA tabel', badan(te, 'const gantiBarisKepala = async').includes('pasangBentuk(ubahJumlahKepala(bentuk(), n));'))
ok('K10 lebar kolom: pegangan tiap garis + cm + dobel-klik paskan + garis batas kertas',
  te.includes('onDoubleClick={e => { e.stopPropagation(); paskanIsi(ci); }}') && te.includes('{cm(lebarTip.px)} cm') && te.includes('left: 38 + kertasPx'))
ok('K11 editor & kisi modal memakai SATU hook pilihan (E5)', te.includes("import { usePilihanSel } from './usePilihanSel';") && kisiSrc.includes("import { usePilihanSel } from '@/components/tabel/usePilihanSel';"))
ok('K12 kisi modal tidak punya aturan gabung sendiri (pakai gabungKepala/rapikanKepala/unmergeAt)',
  !kisiSrc.includes('mergeCells(') && kisiSrc.includes('gabungKepala(kepala, letak, rencana, tambahBaris)') && kisiSrc.includes('rapikanKepala(kepala, letak)') && kisiSrc.includes('unmergeAt(kepala, k.r1, k.c1, ncol)'))
ok('K13 modal: kisi kepala ada, judul kolom = sel di kisi (E4), petunjuk "periksa lagi" lama hilang',
  modal.includes('<KisiKepala ') && modal.includes('value={judulKolom(bentuk, i)}') && !modal.includes('periksa lagi sesudahnya') && !modal.includes('kepalaBaru'))
ok('K14 modal T4: hapus & geser kolom memetakan rumus kolom',
  badan(modal, 'const hapusKolom = (i: number) => setBentuk(b =>').includes('petakanRumus(') && badan(modal, 'const geser = (i: number, arah: -1 | 1) => setBentuk(b =>').includes('petakanRumus(ks, peta)'))
ok('K15 modal tetap berhenti di FORM', !/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(modal + kisiSrc) && modal.includes('onTerapkan({ ...dasar, rows: rowsBaru, tautan })'))
const fin = badan(ed, 'async function finalize(')
ok('K16 E7: Finalisasi menyebut sel galat SEBELUM mengirim', fin.includes('kumpulkanSelGalat(flat.map(f => f.node))') && fin.indexOf('kumpulkanSelGalat(') < fin.indexOf('await kirimFinal()'))
// Tahap B: isi sel lewat `runSel` (miring/garis bawah/warna + baris baru) — yang dicetak tetap teksSelWord.
ok('K17 docgen mencetak lewat teksSelWord (bukan displayValue mentah)', docgen.includes('runSel(teksSelWord(rows, r, c), font, csz,') && docgen.includes('<w:t xml:space="preserve">${escapeXml(t)}</w:t>') && !docgen.includes('displayValue('))
ok('K18 batas kolom/baris SATU tempat (tautan memakai milik tabel)', kode('lib/lkjip/tautan.ts').includes('export const BATAS_KOLOM = BATAS_KOLOM_TABEL;'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('Gagal:\n - ' + gagal.join('\n - ')); process.exit(1) }
