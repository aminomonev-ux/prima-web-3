// scripts/test-iki-peran.mts — IKI CUSTOM Tahap 3: peran kolom (docs/CONCEPT-iki-custom.md §11).
//
//   npx tsx scripts/test-iki-peran.mts
//
// A peta peran & pergeserannya bersama kolom (mesin tabel bersama). B menebak dari judul. C impor mendatar
// (baris kosong dipakai dulu, di atas JUMLAH, gabung RHK atasan sama). D impor menurun (blok 4 baris, pola blok).
// E pembaca baris: pemeriksaan target & kaskade. F bentuk tersimpan, templat, skema. G sambungan layar & route.
// H MySQL sungguhan di tahun kotak pasir 2090 lewat fungsi data asli, lalu dibersihkan.

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
import {
  bacaPeran, tebakPeran, tataLetak, isiDariImpor, itemDariTabel, validasiTabelCustom, rhkAtasanDariTabel, perluCaraHitung,
  bacaCaraHitung, bacaNomorTw, lepasPeran, KUNCI_PERAN, type ItemImpor, type BentukBerperan,
} from '../lib/iki/peran'
import { bacaTabelCustom, tabelCustomAwal, bentukTemplat, BATAS_KOLOM_IKI, type TabelCustom } from '../lib/iki/custom'
import { sisipKolom, hapusKolom, aturPeranKolom, judulBertingkat, nomorUlang, sanitizeRows, type TabelCell } from '../lib/lkjip/tabel'
import { TabelCustomSchema } from '../lib/data/iki-schemas'

try {
  for (const b of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const t = b.trim()
    const i = t.indexOf('=')
    if (!t || t.startsWith('#') || i < 0) continue
    const k = t.slice(0, i).trim()
    if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
} catch { /* tanpa .env.local: bagian DB dilewati */ }

let lulus = 0
const gagal: string[] = []
function ok(nama: string, syarat: unknown, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`) }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`) }
}
const sumber = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sel = (v: string, x: Partial<TabelCell> = {}): TabelCell => ({ v, ...x })
const baris = (...v: string[]) => v.map(x => sel(x))
const tabel = (o: Record<string, unknown>): TabelCustom => bacaTabelCustom(o)
const impor = (t: TabelCustom, items: ItemImpor[], batas = 500) => isiDariImpor(t as BentukBerperan, items, batas)
const pasang = (t: TabelCustom, h: ReturnType<typeof impor>): TabelCustom => {
  if (!h.ok) throw new Error(h.pesan)
  return bacaTabelCustom({ ...t, ...h.bentuk })
}
const renaksi = (atasan: string, rhk: string, ind: string, tahunan: string, tw: string[], cara = 'Akumulatif'): ItemImpor =>
  ({ rhk_intervensi: atasan, rhk, indikator: ind, cara_hitung: cara, target_tahunan: tahunan, tw })

console.log('A. Peta peran & pergeserannya')
{
  ok('A1 kunci & kelompok: 5 isi, 4 TW mendatar, 2 TW menurun', KUNCI_PERAN.length === 11)
  const p = bacaPeran({ rhk: 1, indikator: 1, tw1: 3, target_tw: 4, asing: 2, target_tahunan: 9, cara_hitung: 2.5 }, 6)
  ok('A2 bacaPeran: satu kolom satu peran (yang belakangan menang), kunci asing/di luar tabel/bukan bulat dibuang',
    p.rhk === undefined && p.indikator === 1 && !('asing' in p) && p.target_tahunan === undefined && p.cara_hitung === undefined, JSON.stringify(p))
  ok('A3 bacaPeran: TW mendatar & menurun tidak hidup berdampingan (menurun dibaca belakangan → menang)', p.tw1 === undefined && p.target_tw === 4, JSON.stringify(p))
  ok('A4 lepasPeran: TW I melepas menurun, Target TW melepas mendatar, RHK tidak melepas apa pun',
    lepasPeran('tw1').join() === 'triwulan,target_tw' && lepasPeran('target_tw').join() === 'tw1,tw2,tw3,tw4' && lepasPeran('rhk').length === 0)
  const a = aturPeranKolom({ rhk: 1, tw1: 4, tw2: 5 }, 'target_tw', 6, lepasPeran('target_tw'))
  ok('A5 aturPeranKolom: menandai Target TW melepas TW I–IV', JSON.stringify(a) === JSON.stringify({ rhk: 1, target_tw: 6 }), JSON.stringify(a))
  ok('A6 aturPeranKolom: kolom yang sudah berperan lain pindah tangan; null melepas tanpa menyentuh yang lain',
    JSON.stringify(aturPeranKolom({ rhk: 1, indikator: 2 }, 'indikator', 1)) === JSON.stringify({ indikator: 1 })
    && JSON.stringify(aturPeranKolom({ rhk: 1, tw1: 4 }, 'target_tw', null, lepasPeran('target_tw'))) === JSON.stringify({ rhk: 1, tw1: 4 }))
  const b = { rows: [baris('A', 'B', 'C', 'D')], kolom: ['A', 'B', 'C', 'D'], align: ['left', 'left', 'left', 'left'] as const, colWidths: [80, 80, 80, 80], headerRows: 1, kolomNomor: 0, peran: { rhk: 1, indikator: 2, target_tahunan: 3 } }
  const s1 = sisipKolom({ ...b, align: [...b.align] }, 2, 2)
  ok('A7 sisip 2 kolom di C: peran di kanannya bergeser 2, yang di kiri tetap', JSON.stringify(s1.peran) === JSON.stringify({ rhk: 1, indikator: 4, target_tahunan: 5 }), JSON.stringify(s1.peran))
  const h1 = hapusKolom({ ...b, align: [...b.align] }, 1, 2)
  ok('A8 hapus kolom B–C: perannya lepas, yang di kanan bergeser', JSON.stringify(h1.peran) === JSON.stringify({ target_tahunan: 1 }), JSON.stringify(h1.peran))
  const tanpa = sisipKolom({ rows: [baris('A')], kolom: ['A'], align: ['left'], colWidths: [80], headerRows: 1 }, 0, 1)
  ok('A9 LKJIP (tanpa peran): bentuk hasil sisip/hapus kolom tidak mendapat kunci `peran`', !('peran' in tanpa) && !('peran' in hapusKolom({ ...tanpa }, 0, 0)))
  const kep = sanitizeRows([[sel('No', { rs: 2 }), sel('Target Triwulan', { cs: 2 }), sel('')], [sel(''), sel('I'), sel('II')]], 3)
  ok('A10 judulBertingkat menggabung kepala yang menutup kolom', judulBertingkat(kep, 2, 1) === 'Target Triwulan I' && judulBertingkat(kep, 2, 2) === 'Target Triwulan II' && judulBertingkat(kep, 2, 0) === 'No')
}

console.log('\nB. Menebak dari judul')
{
  const std = tebakPeran(['No.', 'Rencana Hasil Kerja yang Diintervensi', 'Rencana Hasil Kerja', 'Indikator Kinerja Individu', 'Cara Hitung',
    'Target Tahunan', 'Target Triwulan I', 'Target Triwulan II', 'Target Triwulan III', 'Target Triwulan IV'])
  ok('B1 mendatar: semua peran terbaca di kolomnya', JSON.stringify(std) === JSON.stringify({ tw1: 6, tw2: 7, tw3: 8, tw4: 9, rhk_intervensi: 1, rhk: 2, indikator: 3, cara_hitung: 4, target_tahunan: 5 }), JSON.stringify(std))
  const bps = tebakPeran(['No', 'RHK Atasan yang Diintervensi', 'Rencana Hasil Kerja', 'Aspek', 'Indikator Kinerja Individu', 'Target',
    'Triwulan', 'Target Triwulan', 'Rencana Aksi', 'Target Aksi'])
  ok('B2 menurun ala BPSDMD: "Triwulan" = kolom TW, "Target Triwulan" = Target TW, Target Aksi tidak disangka target',
    bps.triwulan === 6 && bps.target_tw === 7 && bps.target_tahunan === 5 && bps.rhk_intervensi === 1 && bps.rhk === 2 && bps.indikator === 4 && tataLetak(bps) === 'menurun', JSON.stringify(bps))
  const bert = tebakPeran(['Target Triwulan TW', 'Target Triwulan Target', 'TW1', 'Indikator'])
  ok('B3 kepala bertingkat "Target Triwulan" + "TW"/"Target"; "TW1" tanpa spasi = TW I (mendatar menang, menurun tak ditebak)',
    bert.tw1 === 2 && bert.triwulan === undefined && bert.indikator === 3, JSON.stringify(bert))
  const bert2 = tebakPeran(['Target Triwulan TW', 'Target Triwulan Target'])
  ok('B4 tanpa TW bernomor: kepala bertingkat menurun terbaca', bert2.triwulan === 0 && bert2.target_tw === 1, JSON.stringify(bert2))
  ok('B5 judul tak dikenal → kosong', JSON.stringify(tebakPeran(['No.', 'Keterangan', 'Paraf'])) === '{}')
}

/** Tabel mendatar: No | RHK atasan | Indikator | Target, JUMLAH di bawah. */
function tabelJumlah(): TabelCustom {
  return tabel({
    kolom: ['No', 'RHK atasan', 'Indikator', 'Target'], headerRows: 1, kolomNomor: 0, gaya: { jumlah: true },
    rows: [baris('No', 'RHK atasan', 'Indikator', 'Target'), [sel(''), sel('Lama', { b: true }), sel('x'), sel('5', { al: 'right' })], baris('', 'JUMLAH', '', '=SUM(D2:D2)')],
    peran: { rhk_intervensi: 1, indikator: 2, target_tahunan: 3 },
  })
}

console.log('\nC. Impor mendatar')
{
  const awal = tabelCustomAwal()
  const h = impor(awal, [renaksi('S1', 'R1', 'I1', '100%', ['25%', '50%', '75%', '100%']), renaksi('S1', 'R2', 'I2', '4 Dok', ['1', '2', '3', '4'])])
  const t = h.ok ? pasang(awal, h) : null
  ok('C1 tabel baru: 3 baris kosong dipakai dulu (2 terisi, sisanya dibuang), kolom bertanda terisi', !!t && t.rows.length === 3
    && t.rows[1].map(c => c.v).join('|') === '|R1|I1|100%' && t.rows[2].map(c => c.v).join('|') === '|R2|I2|4 Dok', JSON.stringify(t?.rows.map(r => r.map(c => c.v))))
  ok('C2 isian tanpa kolom bertanda DISEBUT, bukan dibuang diam-diam', h.ok && h.tanpaKolom.join('|') === 'RHK yang diintervensi|Cara hitung|Target TW I|Target TW II|Target TW III|Target TW IV', h.ok ? h.tanpaKolom.join('|') : '')
  const tj = tabelJumlah()
  const hj = impor(tj, [{ rhk_intervensi: 'S1', indikator: 'a', target_tahunan: '1' }, { rhk_intervensi: 's1 ', indikator: 'b', target_tahunan: '2' }, { rhk_intervensi: 'S2', indikator: 'c', target_tahunan: '3' }])
  const j = hj.ok ? pasang(tj, hj) : null
  ok('C3 badan berisi: baris baru masuk DI ATAS baris JUMLAH, isi lama utuh', !!j && j.rows.length === 6 && j.rows[1][1].v === 'Lama' && j.rows[5][1].v === 'JUMLAH' && j.rows[4][2].v === 'c')
  ok('C4 rentang =SUM di baris JUMLAH ikut memanjang ke baris baru', j?.rows[5][3].v === '=SUM(D2:D5)', j?.rows[5][3].v)
  ok('C5 keputusan #6: RHK atasan sama berurutan (beda huruf/spasi pun) → satu sel tergabung + No. tergabung',
    j?.rows[2][1].rs === 2 && j.rows[3][1].h === true && j.rows[3][1].v === '' && j.rows[2][0].rs === 2 && j.rows[3][0].h === true && j.rows[4][1].v === 'S2' && !j.rows[4][1].rs)
  ok('C6 penomoran: satu nomor per RHK atasan (Lama=1, S1=2, S2=3), JUMLAH tidak bernomor',
    !!j && nomorUlang(j.rows, 1, 0, true).map(r => r[0].v).join('|') === 'No|1|2||3|', j ? nomorUlang(j.rows, 1, 0, true).map(r => r[0].v).join('|') : '')
  ok('C7 format baris pola (badan pertama) ikut, isinya tidak', j?.rows[2][1].b === true && j.rows[2][3].al === 'right' && j.rows[4][3].v === '3')
  const hs = impor(tj, [{ rhk_intervensi: 'S1', indikator: 'a' }, { rhk_intervensi: 'S2', indikator: 'b' }, { rhk_intervensi: 'S1', indikator: 'c' }])
  const js = hs.ok ? pasang(tj, hs) : null
  ok('C8 RHK atasan sama tapi tidak berurutan → tidak digabung', !!js && [2, 3, 4].every(r => !js.rows[r][1].rs && !js.rows[r][1].h))
  const kosong = tabel({ kolom: ['No', 'X'], headerRows: 1, rows: [baris('No', 'X'), baris('', '')] })
  const hk = impor(kosong, [renaksi('S', 'R', 'I', '1', ['1', '1', '1', '1'])])
  ok('C9 tanpa satu pun kolom bertanda → ditolak dengan petunjuk ke panel Peran kolom', !hk.ok && hk.pesan.includes('Peran kolom'))
  const hb = impor(awal, Array.from({ length: 4 }, (_, i) => renaksi('', `R${i}`, 'I', '1', [])), 4)
  ok('C10 lewat batas baris → ditolak, tabel tidak disentuh', !hb.ok && hb.pesan.includes('paling banyak 4 baris'))
  ok('C11 daftar kosong → ditolak', !impor(awal, []).ok)
  const ab = tabel({
    kolom: ['No', 'RHK', 'Ind'], headerRows: 1, kolomNomor: 0, peran: { rhk: 1, indikator: 2 },
    rows: [baris('No', 'RHK', 'Ind'), [sel(''), sel('Grup', { rs: 2 }), sel('a')], [sel(''), sel(''), sel('')]],
  })
  const ha = impor(ab, [{ rhk: 'Baru', indikator: 'n' }])
  const ja = ha.ok ? pasang(ab, ha) : null
  ok('C12 baris kosong yang tertutup gabungan dari atas BUKAN baris kosong — baris baru masuk sesudah gabungannya',
    !!ja && ja.rows.length === 4 && ja.rows[1][1].rs === 2 && ja.rows[3][1].v === 'Baru' && ja.rows[2][2].v === '', JSON.stringify(ja?.rows.map(r => r.map(c => c.v))))
}

console.log('\nD. Impor menurun (4 baris per indikator)')
{
  const peranM = { rhk: 1, indikator: 2, target_tahunan: 3, triwulan: 4, target_tw: 5 }
  const kosong = tabel({ kolom: ['No', 'RHK', 'Indikator', 'Target', 'TW', 'Target TW', 'Rencana Aksi'], headerRows: 1, kolomNomor: 0, peran: peranM,
    rows: [baris('No', 'RHK', 'Indikator', 'Target', 'TW', 'Target TW', 'Rencana Aksi')] })
  const h = impor(kosong, [renaksi('', 'R1', 'I1', '100', ['10', '40', '70', '100']), renaksi('', 'R2', 'I2', '8', ['2', '2', '2', '2'])])
  const t = h.ok ? pasang(kosong, h) : null
  ok('D1 tiap butir = 4 baris; TW I–IV di Kolom TW, target TW per baris', !!t && t.rows.length === 9
    && [1, 2, 3, 4].map(r => t.rows[r][4].v).join() === 'I,II,III,IV' && [5, 6, 7, 8].map(r => t.rows[r][5].v).join() === '2,2,2,2' && t.rows[5][1].v === 'R2')
  ok('D2 tanpa pola: kolom per indikator digabung 4 baris (termasuk Rencana Aksi — §11.2), Kolom TW & Target TW tidak',
    !!t && [0, 1, 2, 3, 6].every(c => t.rows[1][c].rs === 4 && t.rows[2][c].h) && [4, 5].every(c => !t.rows[1][c].rs && !t.rows[2][c].h))
  ok('D3 nomor per butir (gabungan 4 baris = satu nomor)', !!t && nomorUlang(t.rows, 1, 0).map(r => r[0].v).filter(Boolean).join() === 'No,1,2')
  // Pola dari blok pertama: Rencana Aksi sengaja tidak digabung — blok berikutnya meniru.
  const pola = [sel(''), sel('Lama', { rs: 4 }), sel('i', { rs: 4 }), sel('9', { rs: 4 }), sel('I'), sel('1'), sel('aksi 1')]
  const ber = tabel({ kolom: ['No', 'RHK', 'Indikator', 'Target', 'TW', 'Target TW', 'Rencana Aksi'], headerRows: 1, kolomNomor: 0, peran: peranM,
    rows: [baris('No', 'RHK', 'Indikator', 'Target', 'TW', 'Target TW', 'Rencana Aksi'), [sel('', { rs: 4 }), ...pola.slice(1)],
      baris('', '', '', '', 'II', '2', 'aksi 2'), baris('', '', '', '', 'III', '3', 'aksi 3'), baris('', '', '', '', 'IV', '4', 'aksi 4')] })
  const hb = impor(ber, [renaksi('', 'Baru', 'n', '20', ['5', '10', '15', '20'])])
  const b = hb.ok ? pasang(ber, hb) : null
  ok('D4 pola blok pertama ditiru: Rencana Aksi per TW tidak digabung, kolom per indikator digabung; blok lama utuh',
    !!b && b.rows.length === 9 && b.rows[5][1].v === 'Baru' && b.rows[5][1].rs === 4 && !b.rows[5][6].rs && !b.rows[6][6].h && b.rows[6][6].v === '' && b.rows[1][1].v === 'Lama' && b.rows[4][6].v === 'aksi 4')
  const dua = tabel({ kolom: ['No', 'RHK', 'TW', 'Target TW'], headerRows: 1, kolomNomor: 0, peran: { rhk: 1, triwulan: 2, target_tw: 3 },
    rows: [baris('No', 'RHK', 'TW', 'Target TW'), [sel(''), sel('A', { rs: 2 }), sel('I'), sel('1')], baris('', '', 'II', '2')] })
  const hd = impor(dua, [{ rhk: 'B', tw: ['1', '2', '3', '4'] }])
  const d = hd.ok ? pasang(dua, hd) : null
  ok('D5 pola bukan 4 baris: kolom yang menutup seluruh pola digabung 4 baris, sisanya tidak', !!d && d.rows.length === 7 && d.rows[3][1].rs === 4 && !d.rows[3][2].rs && d.rows[6][3].v === '4')
  const dgn = tabel({ kolom: ['No', 'Atasan', 'RHK', 'TW', 'Target TW'], headerRows: 1, kolomNomor: 0, peran: { rhk_intervensi: 1, rhk: 2, triwulan: 3, target_tw: 4 },
    rows: [baris('No', 'Atasan', 'RHK', 'TW', 'Target TW')] })
  const hg = impor(dgn, [{ rhk_intervensi: 'S', rhk: 'a' }, { rhk_intervensi: 'S', rhk: 'b' }])
  const g = hg.ok ? pasang(dgn, hg) : null
  ok('D6 menurun + RHK atasan sama: sel atasan & No. tergabung 8 baris, RHK tetap per blok', !!g && g.rows[1][1].rs === 8 && g.rows[1][0].rs === 8 && g.rows[1][2].rs === 4 && g.rows[5][2].v === 'b')
  ok('D7 impor atasan (tanpa target) ke menurun tetap berbentuk blok berlabel I–IV', !!g && g.rows.length === 9 && g.rows[8][3].v === 'IV')
}

console.log('\nE. Pembaca baris: pemeriksaan target & kaskade')
{
  const t = tabel({
    kolom: ['No', 'RHK', 'Cara', 'Target', 'TW1', 'TW2', 'TW3', 'TW4'], headerRows: 1, kolomNomor: 0, gaya: { jumlah: true },
    peran: { rhk: 1, cara_hitung: 2, target_tahunan: 3, tw1: 4, tw2: 5, tw3: 6, tw4: 7 },
    rows: [baris('No', 'RHK', 'Cara', 'Target', 'TW1', 'TW2', 'TW3', 'TW4'),
      baris('', 'A', 'Akumulatif', '100', '25', '25', '25', '20'),
      baris('', 'B', 'progres positif', '80%', '20%', '40%', '60%', '80%'),
      baris('', 'C', 'Progres Negatif', '10', '15', '14', '12', '12'),
      baris('', 'D', 'Pengulangan', '4', '1', '1', '1', '9'),
      baris('', 'E', 'entah', '4', '1', '1', '1', '9'),
      baris('', 'F', 'Akumulatif', '=10+15', '5', '5', '5', '10'),
      baris('', 'JUMLAH', 'Akumulatif', '1', '9', '9', '9', '9')],
  })
  const w = validasiTabelCustom(t)
  ok('E1 Akumulatif (jumlah TW ≠ tahunan) & Progres Negatif (TW IV ≠ tahunan) diperingatkan; Progres Positif cocok; Pengulangan & cara tak dikenal dilewati',
    w.length === 2 && w[0].message.startsWith('Baris 2 — ') && w[0].message.includes('jumlah target TW I–IV = 95') && w[1].message.startsWith('Baris 4 — '), JSON.stringify(w.map(x => x.message)))
  ok('E2 rumus dihitung dulu (=10+15 → 25 = 5+5+5+10), baris JUMLAH bukan baris data', !w.some(x => x.message.startsWith('Baris 7') || x.message.startsWith('Baris 8')))
  const gab = tabel({
    kolom: ['RHK', 'Ind', 'Cara', 'Target', 'TW1', 'TW2', 'TW3', 'TW4'], headerRows: 1, peran: { rhk: 0, indikator: 1, cara_hitung: 2, target_tahunan: 3, tw1: 4, tw2: 5, tw3: 6, tw4: 7 },
    rows: [baris('RHK', 'Ind', 'Cara', 'Target', 'TW1', 'TW2', 'TW3', 'TW4'),
      [sel('Satu', { rs: 2 }), sel('a'), sel('Akumulatif'), sel('4'), sel('1'), sel('1'), sel('1'), sel('1')],
      baris('', 'b', 'Akumulatif', '8', '2', '2', '2', '1'),
      baris('Dua', 'c', 'Akumulatif', '', '', '', '', '')],
  })
  const it = itemDariTabel(gab)
  ok('E3 mendatar: RHK tergabung 2 baris → dua butir (per indikator), RHK terbaca di keduanya', it.length === 3 && it[1].rhk === 'Satu' && it[1].indikator === 'b')
  ok('E4 butir berbaris gabungan diperiksa per baris (b: 2+2+2+1 ≠ 8)', validasiTabelCustom(gab).length === 1 && validasiTabelCustom(gab)[0].message.startsWith('Baris 3'))
  const at = rhkAtasanDariTabel(gab)
  ok('E5 kaskade: RHK tergabung dihitung SEKALI, nomor urut per RHK, cara hitung ikut', at.length === 2 && at[0].rhk === 'Satu' && at[0].no_urut === 1 && at[1].no_urut === 2 && at[0].aspek_b === 'Akumulatif', JSON.stringify(at))
  const menurun = tabel({
    kolom: ['RHK', 'Cara', 'Target', 'TW', 'Target TW'], headerRows: 1, peran: { rhk: 0, cara_hitung: 1, target_tahunan: 2, triwulan: 3, target_tw: 4 },
    rows: [baris('RHK', 'Cara', 'Target', 'TW', 'Target TW'),
      [sel('X', { rs: 4 }), sel('Progres Positif', { rs: 4 }), sel('100', { rs: 4 }), sel('TW IV'), sel('100')],
      baris('', '', '', 'III', '75'), baris('', '', '', '2', '50'), baris('', '', '', 'Triwulan I', '25')],
  })
  const im = itemDariTabel(menurun)
  ok('E6 menurun: blok menurut gabungan jangkar; TW dibaca dari LABEL-nya walau urutannya terbalik', im.length === 1 && im[0].tw.join() === '25,50,75,100' && validasiTabelCustom(menurun).length === 0, JSON.stringify(im))
  const urut = tabel({
    kolom: ['Ind', 'Cara', 'Target', 'Target TW'], headerRows: 1, peran: { indikator: 0, cara_hitung: 1, target_tahunan: 2, target_tw: 3 },
    rows: [baris('Ind', 'Cara', 'Target', 'Target TW'), [sel('Y', { rs: 4 }), sel('Akumulatif', { rs: 4 }), sel('10', { rs: 4 }), sel('1')], baris('', '', '', '2'), baris('', '', '', '3'), baris('', '', '', '5')],
  })
  ok('E7 menurun tanpa Kolom TW: urutan baris = TW I–IV (1+2+3+5 ≠ 10 diperingatkan)', itemDariTabel(urut)[0].tw.join() === '1,2,3,5' && validasiTabelCustom(urut).length === 1)
  ok('E8 perluCaraHitung: TW + target tahunan tanpa Cara hitung = disebut; ada Cara hitung atau tanpa TW = diam',
    perluCaraHitung({ target_tahunan: 1, tw1: 2 }) && perluCaraHitung({ target_tahunan: 1, target_tw: 2 }) && !perluCaraHitung({ target_tahunan: 1, tw1: 2, cara_hitung: 3 }) && !perluCaraHitung({ target_tahunan: 1 }))
  ok('E9 tanpa kolom Cara hitung tidak ada peringatan (tidak menebak)', validasiTabelCustom({ ...t, peran: { ...t.peran, cara_hitung: undefined } }).length === 0)
  ok('E10 atasan tanpa kolom RHK bertanda → kosong', rhkAtasanDariTabel({ ...gab, peran: { indikator: 1 } }).length === 0)
  ok('E11 cara hitung dikenali dari teks sel; yang tidak dikenali = null', bacaCaraHitung('AKUMULATIF') === 'Akumulatif' && bacaCaraHitung('Kumulatif') === 'Akumulatif'
    && bacaCaraHitung('Progress Negatif') === 'Progres Negatif' && bacaCaraHitung('berulang') === 'Pengulangan' && bacaCaraHitung('') === null && bacaCaraHitung('rata-rata') === null)
  ok('E12 label TW: I / 2 / TW III / Triwulan IV; selain itu null', bacaNomorTw('I') === 0 && bacaNomorTw('2') === 1 && bacaNomorTw('tw iii') === 2 && bacaNomorTw('Triwulan IV') === 3 && bacaNomorTw('V') === null && bacaNomorTw('Target') === null)
}

console.log('\nF. Bentuk tersimpan, templat, skema')
{
  const awal = tabelCustomAwal()
  ok('F1 tabel awal langsung bertanda RHK/Indikator/Target tahunan (impor jalan tanpa menandai)', JSON.stringify(awal.peran) === JSON.stringify({ rhk: 1, indikator: 2, target_tahunan: 3 }))
  const lama = bacaTabelCustom({ kolom: ['A', 'B'], rows: [baris('A', 'B')] })
  ok('F2 dokumen CUSTOM lama (tanpa kunci peran) terbaca peran kosong', JSON.stringify(lama.peran) === '{}')
  ok('F3 bacaTabelCustom membuang peran yang kolomnya sudah tidak ada', JSON.stringify(bacaTabelCustom({ kolom: ['A', 'B'], rows: [baris('A', 'B')], peran: { rhk: 0, indikator: 5 } }).peran) === '{"rhk":0}')
  const parsed = TabelCustomSchema.safeParse({ ...awal, peran: { rhk: 1, tw1: 3 } })
  ok('F4 skema server MENDAFTAR `peran` (kunci tak terdaftar dibuang Zod diam-diam)', parsed.success && JSON.stringify(parsed.data.peran) === JSON.stringify({ rhk: 1, tw1: 3 }), JSON.stringify(parsed))
  ok('F5 skema menolak peran asing & kolom di luar 24', !TabelCustomSchema.safeParse({ ...awal, peran: { asing: 1 } }).success
    && !TabelCustomSchema.safeParse({ ...awal, peran: { rhk: BATAS_KOLOM_IKI } }).success)
  ok('F6 tanpa kunci peran (payload lama) → {}', (TabelCustomSchema.parse({ kolom: ['A'], rows: [[{ v: 'A' }]] }) as { peran: object }).peran !== undefined)
  const blok = tabel({
    kolom: ['No', 'RHK', 'TW', 'Target TW'], headerRows: 1, kolomNomor: 0, peran: { rhk: 1, triwulan: 2, target_tw: 3 },
    rows: [baris('No', 'RHK', 'TW', 'Target TW'), [sel('', { rs: 4 }), sel('A', { rs: 4, b: true }), sel('I'), sel('1')], baris('', '', 'II', '2'), baris('', '', 'III', '3'), baris('', '', 'IV', '4'),
      [sel('', { rs: 4 }), sel('B', { rs: 4 }), sel('I'), sel('1')], baris('', '', 'II', '2'), baris('', '', 'III', '3'), baris('', '', 'IV', '4')],
  })
  const tpl = bentukTemplat(blok, false)
  ok('F7 templat dari tabel menurun membawa BLOK pertama (4 baris, gabungannya utuh, tanpa teks) + perannya',
    tpl.rows.length === 5 && tpl.rows[1][1].rs === 4 && tpl.rows[1][1].b === true && tpl.rows.slice(1).every(r => r.every(c => c.v === '')) && JSON.stringify(tpl.peran) === JSON.stringify(blok.peran))
  const dariTpl = impor(bacaTabelCustom(tpl), [{ rhk: 'Baru', tw: ['5', '6', '7', '8'] }])
  ok('F8 impor ke tabel dari templat itu: blok kosong dipakai, pola gabungannya ditiru', dariTpl.ok && dariTpl.bentuk.rows.length === 5 && dariTpl.bentuk.rows[1][1].v === 'Baru' && dariTpl.bentuk.rows[1][1].rs === 4 && dariTpl.bentuk.rows[4][3].v === '8')
  const datar = bentukTemplat(tabelCustomAwal(), false)
  ok('F9 templat mendatar tetap kepala + satu baris pola (perilaku Tahap 2)', datar.rows.length === 2)
}

console.log('\nG. Sambungan layar & route')
{
  const te = tanpaKomentar(sumber('components/tabel/TabelEditor.tsx'))
  const ed = tanpaKomentar(sumber('app/(dashboard)/iki/[id]/editor-client.tsx'))
  ok('G1 editor bersama: peran ikut riwayat urungkan (snap & pulihkan)', te.includes('const snap = (): Snap => ({ kolom, align, colWidths, headerRows, rows, atur, peran });') && te.includes('setAtur(s.atur); setPeran(s.peran);'))
  ok('G2 editor bersama: peran ikut bergeser bersama kolom (bentuk → sisip/hapus kolom → pasangBentuk)', te.includes('kolomNomor: atur.kolomNomor, ...(peranKolom ? { peran } : {}) });') && te.includes('if (b.peran) setPeran(b.peran);'))
  ok('G3 editor bersama: peran masuk payload HANYA bila pemakai menyalakannya (LKJIP tak berubah) & ikut dilaporkan',
    te.includes('...(peranKolom ? { peran } : {}),\n  });') && te.includes('atur, tautan, peran]);'))
  ok('G4 LKJIP tidak menyalakan panel peran', !sumber('app/(dashboard)/lkjip/[id]/editor-client.tsx').includes('peranKolom'))
  ok('G5 pegangan editor: pengubah dari luar lewat riwayat urungkan, ditolak saat hanya-baca/tertaut',
    /ubahBentuk: ubah => \{\s*if \(readOnly \|\| terkait\) return false;[\s\S]{0,200}pushHist\(\);\s*pasangBentuk\(hasil\);/.test(te))
  ok('G6 IKI: tabel CUSTOM dipasangi pegangan + panel peran', ed.includes('ref={tabelRef}') && ed.includes('peranKolom={FITUR_PERAN}'))
  ok('G7 IKI: impor CUSTOM lewat isiDariImpor di dalam ubahBentuk (bukan menulis server — L78)',
    /tabelRef\.current\?\.ubahBentuk\(b => \{\s*keluar\.hasil = isiDariImpor\(/.test(ed) && ed.includes('if (isCustom) { imporKeTabel(groups); return; }'))
  ok('G8 IKI: peringatan target CUSTOM dari tabel, satu daftar untuk layar & Finalisasi', ed.includes('(tabel ? validasiTabelCustom(tabel) : validateRhkTargets(doc.rhk))'))
  ok('G9 IKI: tombol impor CUSTOM mati dengan alasan bila belum ada kolom isian bertanda', ed.includes('disabled={!adaPeranIsi}') && ed.includes("Object.keys(tabel.peran).some(k => k !== 'triwulan')"))
  ok('G10 modal: pilihan baris atasan tidak bergantung id (atasan CUSTOM tanpa id baris) & catatan server tampil',
    ed.includes('a.atasan_rhk_id != null ?') && ed.includes("catatanAtasan ?? 'Dokumen atasan belum punya baris RHK.'") && !ed.includes('selected.has(`a${a.atasan_rhk_id}`)'))
  const rt = tanpaKomentar(sumber('app/api/iki/import-atasan/route.ts'))
  ok('G11 route import-atasan: guard dulu, lalu getRhkAtasan (satu jalur untuk semua varian), catatan ikut balasan',
    rt.indexOf('await guard()') < rt.indexOf('getRhkAtasan(') && rt.includes('{ ok: true, atasan, rows, catatan }') && !rt.includes('FROM iki_rhk'))
  const ty = sumber('app/(dashboard)/iki/_lib/types.ts')
  ok('G12 tipe klien: atasan_rhk_id boleh kosong', ty.includes('atasan_rhk_id: number | null;'))
}

console.log('\nH. MySQL sungguhan (kotak pasir 2090)')
let c: mysql.Connection | null = null
try {
  c = await mysql.createConnection({
    host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE,
  })
} catch (e) {
  console.log(`DILEWATI bagian DB: MySQL tidak bisa dihubungi (${(e as { code?: string }).code ?? e})`)
}
const NAMA = 'UJI-PERAN'
if (c) {
  const k = c
  const bersih = () => k.query("DELETE FROM iki_dokumen WHERE tahun = '2090' AND nama LIKE ?", [`${NAMA}%`])
  await bersih()
  const D = await import('../lib/data/iki')
  const S = await import('../lib/data/iki-schemas')
  const [u] = await k.query('SELECT id FROM users ORDER BY id LIMIT 1') as [Array<{ id: number }>, unknown]
  const userId = Number(u[0]?.id ?? 0)
  // Lewat skema Zod yang SAMA dengan route PUT — kunci yang tak terdaftar hilang di sini.
  const simpan = async (id: number, tabelCustom: unknown, varian: 'CUSTOM' | 'STANDAR' = 'CUSTOM', rhk: unknown[] = []) => {
    const doc = await D.getDokumen(id)
    const masuk = S.SaveDokumenSchema.parse({
      expected_version: doc!.version, varian, jenis: 'MURNI', opd: 'RSJD', nama: doc!.nama, nip: doc!.nip, jabatan: doc!.jabatan,
      kota_ttd: 'Semarang', rhk, tabel_custom: tabelCustom,
      ...(varian === 'STANDAR' ? { nama_atasan: 'Atasan Uji', jabatan_atasan: 'KABID UJI' } : {}),
    })
    return D.saveDokumen(id, masuk, userId)
  }
  try {
    const idAtasan = await D.createDokumen({ tahun: '2090', varian: 'CUSTOM', nama: `${NAMA} Atasan`, nip: 'UJI-P1', jabatan: 'KABID UJI' }, userId)
    const t = tabel({
      kolom: ['No', 'RHK', 'Indikator', 'Cara', 'Target'], headerRows: 1, kolomNomor: 0, peran: { rhk: 1, indikator: 2, cara_hitung: 3, target_tahunan: 4 },
      rows: [baris('No', 'RHK', 'Indikator', 'Cara', 'Target'), [sel(''), sel('RHK Kabid', { rs: 2 }), sel('ind a'), sel('Progres Positif'), sel('90%')],
        baris('', '', 'ind b', 'Akumulatif', '4'), baris('', 'RHK Kedua', 'ind c', '', '1')],
    })
    await simpan(idAtasan, t)
    const tersimpan = await D.getDokumen(idAtasan)
    ok('H1 peran bertahan lewat Zod + simpan + baca ulang', JSON.stringify(bacaTabelCustom(tersimpan!.tabel_custom).peran) === JSON.stringify(t.peran), JSON.stringify((tersimpan?.tabel_custom as { peran?: unknown })?.peran))
    const ra = await D.getRhkAtasan(idAtasan)
    ok('H2 kaskade dari atasan CUSTOM: satu baris per RHK, id kosong, cara hitung ikut, tanpa catatan',
      ra?.atasan.varian === 'CUSTOM' && ra.rows.length === 2 && ra.rows[0].atasan_rhk_id === null && ra.rows[0].rhk === 'RHK Kabid' && ra.rows[0].aspek_b === 'Progres Positif' && ra.rows[1].aspek_b === 'Akumulatif' && ra.catatan === null, JSON.stringify(ra))
    await simpan(idAtasan, { ...t, peran: { indikator: 2 } })
    const tanpaRhk = await D.getRhkAtasan(idAtasan)
    ok('H3 atasan CUSTOM tanpa kolom RHK bertanda: kosong + kalimat sebabnya', tanpaRhk?.rows.length === 0 && !!tanpaRhk.catatan?.includes('Peran kolom'))
    const idStd = await D.createDokumen({ tahun: '2090', varian: 'STANDAR', nama: `${NAMA} Std`, nip: 'UJI-P2', jabatan: 'KASI UJI' }, userId)
    const rhkStd = { no_urut: 1, rhk_intervensi: 'RHK Kabid', rhk: 'RHK std', aspek_a: 'Kuantitatif', aspek_b: 'Akumulatif', aspek_c: 'Utama', indikator: 'ind std', target_tahunan: '4',
      formulasi: null, ekspektasi: null, renaksi_id: null, atasan_rhk_id: null,
      triwulan: [1, 2, 3, 4].map(n => ({ triwulan: n, target_tw: '1', uraian: null, target_aksi: '1' })) }
    await simpan(idStd, null, 'STANDAR', [rhkStd])
    const rs = await D.getRhkAtasan(idStd)
    ok('H4 atasan STANDAR tetap dari iki_rhk dengan id barisnya', rs?.rows.length === 1 && typeof rs.rows[0].atasan_rhk_id === 'number' && rs.rows[0].rhk === 'RHK std' && rs.catatan === null)
    ok('H5 dokumen tak ada → null (route 404)', (await D.getRhkAtasan(999999999)) === null)
  } finally {
    await bersih()
    const [sisa] = await k.query("SELECT COUNT(*) AS n FROM iki_dokumen WHERE tahun = '2090'") as [Array<{ n: number }>, unknown]
    ok('H6 kotak pasir bersih', Number(sisa[0].n) === 0, JSON.stringify(sisa[0]))
    await k.end()
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log(gagal.map(g => `  - ${g}`).join('\n')); process.exit(1) }
process.exit(0)
