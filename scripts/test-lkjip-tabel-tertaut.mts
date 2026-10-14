// scripts/test-lkjip-tabel-tertaut.mts — tabel LKJIP yang tertaut ke E-Anggaran Rekap & Renaksi Cetak.
// Konsep: docs/CONCEPT-lkjip-tabel-tertaut.md
//
// A–F menguji PERILAKU lib/lkjip/tautan.ts (sel, rumus kolom, gabung otomatis, kepala, Perbarui).
// G: skema simpan (resep tidak boleh dibuang Zod). H–I: kedua penghubung dengan jawaban API
// tiruan. J: pemuat Rekap lama vs baru (kinerja-client → lib/kinerja/muat-rekap.ts) HARUS sama.
// K: sambungan editor (komentar dibuang dulu — L82c).
// Tahap 2 — L: kolom isian tangan · M: sumber Laporan per sumber dana · N: templat ·
// O: Periksa kesegaran & penahan Finalisasi.
//
// Jalankan: npx tsx scripts/test-lkjip-tabel-tertaut.mts

import { readFileSync } from 'node:fs'
import {
  selDariNilai, periksaRumusKolom, bangunBadan, pasangBadan, bandingPerbarui, kalimatPerbarui,
  lepasTautan, tulisWaktuTarik, sidikGrafik, jumlahBarisKepala, KOSONG, BATAS_BARIS,
  ambilIsianTangan, nilaiPerbarui, isianYatim, kalimatIsianYatim, jumlahIsianTangan,
  type HasilTarik, type KolomTaut, type Tautan, type PayloadTabel,
} from '../lib/lkjip/tautan'
import { kumpulkanTabelTertaut, periksaKesegaran } from '../lib/lkjip/kesegaran'
import { tarikKinerjaLaporan, setelanKinerjaLaporan, kolomLaporan, kolomBawaanLaporan } from '../lib/lkjip/sumber/kinerja-laporan'
import { DAFTAR_TEMPLAT } from '../lib/lkjip/sumber/templat'
import type { LaporanSumber } from '../app/(dashboard)/kinerja/_types'
import { displayValue, buildTableMeta, angkaSel, type TabelCell } from '../lib/lkjip/tabel'
import { TabelPayloadSchema, GrafikPayloadSchema } from '../lib/lkjip/schemas'
import { tarikKinerjaRekap, setelanKinerjaRekap, KOLOM_KINERJA_REKAP } from '../lib/lkjip/sumber/kinerja-rekap'
import { tarikRenaksiCetak, setelanRenaksiCetak, kolomRenaksi } from '../lib/lkjip/sumber/renaksi-cetak'
import { DAFTAR_SUMBER } from '../lib/lkjip/sumber'
import { muatBahanRekap, type AmbilJson } from '../lib/kinerja/muat-rekap'
import { hitungRekap, type ItemSskAktif } from '../lib/kinerja/rekap'
import { versiUntukPilihan, type PilihanVersiRekap, type SlotVersiSsk, type VersiSumberRekap } from '../lib/kinerja/versi'
import { recalcAllRealisasiServer, type RealRowRaw } from '../lib/data/kinerja-calc'
import { SUMBER_LIST, recalcAllRealisasi } from '../app/(dashboard)/kinerja/_utils'
import { REKAP_HEADER } from '../app/(dashboard)/kinerja/_exports'
import type { RealRow, SumberSSK, SskMonths } from '../app/(dashboard)/kinerja/_types'
import type { RaRow, RaLevel } from '../app/(dashboard)/rencana-aksi/_lib/types'
import type { ApiResult } from '../lib/shared/api'

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
const tampil = (rows: TabelCell[][], r: number, c: number) => displayValue(rows, r, c)

// ─── A. Sel dari nilai sumber ─────────────────────────────────────────────────
console.log('\nA. Sel dari nilai sumber')
const persen = [selDariNilai(55.07, 'persen', 'persen')]
ok('A1 persen sumber 55,07 → "55,07%" (dibagi 100: sel pct ber-aturan Excel)', tampil([persen], 0, 0) === '55,07%', tampil([persen], 0, 0))
ok('A2 ...disimpan sebagai pecahan', Math.abs(Number(persen[0].v) - 0.5507) < 1e-12 && persen[0].nf === 'pct')
ok('A3 persen kosong → "—"', selDariNilai(null, 'persen', 'persen').v === KOSONG)
ok('A4 angka/rupiah kosong → ""', selDariNilai(null, 'rp', 'angka').v === '' && selDariNilai(undefined, 'angka', 'angka').v === '')
const rp = [selDariNilai(1_250_000_000, 'rp', 'angka')]
ok('A5 rupiah bawaan → ribuan bertitik tanpa desimal', tampil([rp], 0, 0) === '1.250.000.000', tampil([rp], 0, 0))
const rpRp = [selDariNilai(1_250_000, 'rp', 'rp')]
ok('A6 format Rupiah → "Rp 1.250.000"', tampil([rpRp], 0, 0) === 'Rp 1.250.000', tampil([rpRp], 0, 0))
const desimal = [selDariNilai(7.5, 'angka', 'angka'), selDariNilai(7, 'angka', 'angka'), selDariNilai(2.675, 'angka', 'angka')]
ok('A7 desimal otomatis: 7,5 · 7 · 2,68', tampil([desimal], 0, 0) === '7,5' && tampil([desimal], 0, 1) === '7' && tampil([desimal], 0, 2) === '2,68',
  desimal.map((_, i) => tampil([desimal], 0, i)).join(' | '))
ok('A7b pembulatan sel tabel tidak tergelincir IEEE (dulu toFixed: 2,675 → 2,67)',
  tampil([[{ v: '2.675', nf: 'num', dec: 2 }]], 0, 0) === '2,68' && tampil([[{ v: '1.005', nf: 'num', dec: 2 }]], 0, 0) === '1,01')
ok('A8 desimal dipaksa 2', tampil([[selDariNilai(7.5, 'angka', 'angka', 2)]], 0, 0) === '7,50')
ok('A9 teks apa adanya', selDariNilai('Program A', 'teks', 'teks').v === 'Program A')
ok('A10 persen sumber dipilih tampil sbg angka → TIDAK dibagi 100', tampil([[selDariNilai(55.07, 'persen', 'angka')]], 0, 0) === '55,07')
// Grafik dari blok tabel membaca angka sel. Dulu: parseFloat("74.154.779.000") = 74,154.
const gr: TabelCell[][] = [[
  selDariNilai(74_154_779_000, 'rp', 'angka'), selDariNilai(85.5, 'persen', 'persen'), { v: '7,5' }, { v: '1.250.000' }, { v: '=A1/1000' }, { v: 'Rp 2.000' },
]]
ok('A11 angka sel untuk grafik: rupiah utuh, persen seperti tampil, teks gaya Indonesia, rumus',
  angkaSel(gr, 0, 0) === 74_154_779_000 && Math.abs(angkaSel(gr, 0, 1) - 85.5) < 1e-9 && angkaSel(gr, 0, 2) === 7.5
  && angkaSel(gr, 0, 3) === 1_250_000 && angkaSel(gr, 0, 4) === 74_154_779 && angkaSel(gr, 0, 5) === 2000,
  [0, 1, 2, 3, 4, 5].map(c => angkaSel(gr, 0, c)).join(' | '))

// ─── B. Rumus kolom ───────────────────────────────────────────────────────────
console.log('\nB. Rumus kolom')
const r1 = periksaRumusKolom('=C-D', 6, 4)
ok('B1 =C-D → rujukan C,D & terjemahan sebaris', 'rujukan' in r1 && r1.rujukan.join() === '2,3' && r1.terjemahan === 'C1-D1', JSON.stringify(r1))
const r2 = periksaRumusKolom('C5-D', 6, 4)
ok('B2 nomor baris ditolak dgn contoh yang benar', 'galat' in r2 && r2.galat.includes('C, bukan C5'), JSON.stringify(r2))
ok('B3 kolom di luar tabel ditolak', 'galat' in periksaRumusKolom('=Z-A', 6, 4))
ok('B4 merujuk diri sendiri ditolak', 'galat' in periksaRumusKolom('=E*2', 6, 4))
ok('B5 fungsi tak dikenal ditolak', 'galat' in periksaRumusKolom('=FOO(C)', 6, 4))
const r6 = periksaRumusKolom('=SUM(B:D)', 6, 4)
ok('B6 rentang B:D → B,C,D', 'rujukan' in r6 && r6.rujukan.join() === '1,2,3' && r6.terjemahan === 'SUM(B1:D1)', JSON.stringify(r6))
ok('B7 rentang yang melewati kolom sendiri ditolak', 'galat' in periksaRumusKolom('=SUM(A:F)', 6, 4))
ok('B8 ROUND & huruf kecil diterima', 'rujukan' in periksaRumusKolom('=round(d/c, 4)', 6, 4))
ok('B9 rumus kosong ditolak', 'galat' in periksaRumusKolom('=', 6, 4))

// ─── C. Badan tabel ───────────────────────────────────────────────────────────
console.log('\nC. Badan tabel')
const hasilUji: HasilTarik = {
  kolom: [
    { kunci: 'label', label: 'Uraian', jenis: 'teks' },
    { kunci: 'pagu', label: 'Anggaran (Rp)', jenis: 'rp' },
    { kunci: 'realKeu', label: 'Realisasi', jenis: 'rp' },
    { kunci: 'pctKeu', label: '%', jenis: 'persen' },
    { kunci: 'capaianFisik', label: 'Capaian', jenis: 'persen' },
  ],
  baris: [
    { kunci: 'T', label: 'Total', indent: 0, tebal: true, sel: { label: 'Total', pagu: 1000, realKeu: 850, pctKeu: 85, capaianFisik: 90 } },
    { kunci: 'P1', label: 'Program A', indent: 1, tebal: true, sel: { label: 'Program A', pagu: 600, realKeu: 600, pctKeu: 100, capaianFisik: null } },
    { kunci: 'K1', label: 'Kegiatan A1', indent: 2, sel: { label: 'Kegiatan A1', pagu: 0, realKeu: 0, pctKeu: 0, capaianFisik: null } },
    { kunci: 'P2', label: 'Program B', indent: 1, tebal: true, sel: { label: 'Program B', pagu: 400, realKeu: 250, pctKeu: 62.5, capaianFisik: 70 } },
  ],
  catatan: [], ringkas: 'uji',
}
const resepUji: KolomTaut[] = [
  { isi: { jenis: 'nomor' } },
  { isi: { jenis: 'sumber', kunci: 'label' }, bertingkat: true },
  { isi: { jenis: 'sumber', kunci: 'pagu' } },
  { isi: { jenis: 'sumber', kunci: 'realKeu' } },
  { isi: { jenis: 'rumus', ekspresi: '=C-D' } },
  { isi: { jenis: 'rumus', ekspresi: '=D/C' }, format: 'persen' },
  { isi: { jenis: 'sumber', kunci: 'capaianFisik' } },
]
const b1 = bangunBadan(hasilUji, { kolom: resepUji, sembunyi: ['P1'], tebalInduk: true })
ok('C1 baris tersembunyi tidak muncul, kunci sejajar', b1.kunciBaris.join() === 'T,K1,P2', b1.kunciBaris.join())
ok('C2 nomor urut dihitung ulang sesudah disembunyikan (1,2,3)', b1.rows.map(r => r[0].v).join() === '1,2,3')
ok('C3 uraian bertingkat menjorok', b1.rows[1][1].v === '        Kegiatan A1' && b1.rows[0][1].v === 'Total', JSON.stringify(b1.rows[1][1].v))
ok('C4 rumus Sisa = C−D → 150 (angka, bukan rumus)', b1.rows[2][4].v === '150' && !b1.rows[2][4].v.startsWith('='))
ok('C5 rumus D/C ber-format persen → "62,50%"', tampil(b1.rows, 2, 5) === '62,50%', tampil(b1.rows, 2, 5))
ok('C6 rumus bagi nol → "—", bukan #ERR', b1.rows[1][5].v === KOSONG && tampil(b1.rows, 1, 5) === KOSONG, b1.rows[1][5].v)
ok('C7 capaian kosong → "—"', b1.rows[1][6].v === KOSONG)
ok('C8 baris induk ditebalkan; baris biasa tidak', b1.rows[0].every(s => s.b) && !b1.rows[1].some(s => s.b))
const b1b = bangunBadan(hasilUji, { kolom: resepUji, sembunyi: [], tebalInduk: false })
ok('C9 tebalInduk mati → tidak ada yang tebal', b1b.rows.every(r => r.every(s => !s.b)))
// C = D dan D = C: siklus sungguhan (bukan merujuk diri sendiri, yang sudah ditolak periksaRumusKolom).
const kolomKosong: KolomTaut[] = [{ isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'rumus', ekspresi: '=A*2' } }, { isi: { jenis: 'rumus', ekspresi: '=D' } }, { isi: { jenis: 'rumus', ekspresi: '=C' } }]
const b2 = bangunBadan(hasilUji, { kolom: kolomKosong, sembunyi: [], tebalInduk: false })
ok('C10 rumus merujuk kolom teks → "—", bukan 0', b2.rows[0][1].v === KOSONG, b2.rows[0][1].v)
ok('C11 rumus saling merujuk (siklus) → "—"', b2.rows[0][2].v === KOSONG && b2.rows[0][3].v === KOSONG && b2.galatRumus.length === 0,
  `${b2.rows[0][2].v} / ${b2.rows[0][3].v} / galat ${b2.galatRumus.length}`)
const b3 = bangunBadan(hasilUji, { kolom: [{ isi: { jenis: 'sumber', kunci: 'hilang' } }, { isi: { jenis: 'rumus', ekspresi: '=X' } }], sembunyi: [], tebalInduk: false })
ok('C12 kolom sumber yang tidak ada dilaporkan', b3.kolomHilang.join() === '0' && b3.rows[0][0].v === '')
ok('C13 galat rumus dilaporkan', b3.galatRumus.length === 1 && b3.galatRumus[0].kolom === 1)
const rantai: KolomTaut[] = [{ isi: { jenis: 'sumber', kunci: 'pagu' } }, { isi: { jenis: 'rumus', ekspresi: '=C*2' } }, { isi: { jenis: 'rumus', ekspresi: '=A/2' } }]
const b4 = bangunBadan(hasilUji, { kolom: rantai, sembunyi: [], tebalInduk: false })
ok('C14 rumus merujuk rumus di KANANNYA tetap terhitung (B = C×2 = A)', b4.rows[0][1].v === '1000' && b4.rows[0][2].v === '500', `${b4.rows[0][1].v} / ${b4.rows[0][2].v}`)

// ─── D. Gabung otomatis ───────────────────────────────────────────────────────
console.log('\nD. Gabung otomatis')
const hasilGabung: HasilTarik = {
  kolom: [{ kunci: 'prog', label: 'Program', jenis: 'teks' }, { kunci: 'keg', label: 'Kegiatan', jenis: 'teks' }, { kunci: 'ind', label: 'Indikator', jenis: 'teks' }],
  baris: [
    ['P1', 'K', 'i1'], ['P1', 'K', 'i2'], ['P2', 'K', 'i3'], ['P2', 'K', 'i4'], ['P2', '', 'i5'], ['P2', '', 'i6'], ['P1', 'K', 'i7'],
  ].map(([prog, keg, ind]) => ({ kunci: ind, label: ind, sel: { prog, keg, ind } })),
  catatan: [], ringkas: 'uji',
}
const g = bangunBadan(hasilGabung, { kolom: [
  { isi: { jenis: 'sumber', kunci: 'prog' }, gabungSama: true },
  { isi: { jenis: 'sumber', kunci: 'keg' }, gabungSama: true },
  { isi: { jenis: 'sumber', kunci: 'ind' } },
], sembunyi: [], tebalInduk: false }).rows
ok('D1 Program P1 (2 baris) digabung', g[0][0].rs === 2 && g[1][0].h === true)
ok('D2 Program P2 (4 baris) digabung', g[2][0].rs === 4 && !!g[3][0].h && !!g[4][0].h && !!g[5][0].h)
ok('D3 P1 yang muncul lagi tidak berurutan → tidak ikut digabung', !g[6][0].rs && !g[6][0].h)
ok('D4 gaya pivot: kegiatan "K" tidak menyeberang batas program', g[0][1].rs === 2 && g[2][1].rs === 2 && !g[1][1].rs)
ok('D5 sel kosong tidak digabung', !g[4][1].rs && !g[4][1].h && !g[5][1].h)
ok('D6 kolom tanpa centang tidak digabung', g.every(r => !r[2].rs && !r[2].h))
const gKosong = bangunBadan({ ...hasilGabung, baris: [
  { kunci: 'a', label: 'a', sel: { prog: KOSONG } }, { kunci: 'b', label: 'b', sel: { prog: KOSONG } },
] }, { kolom: [{ isi: { jenis: 'sumber', kunci: 'prog' }, gabungSama: true }], sembunyi: [], tebalInduk: false }).rows
ok('D7 "—" tidak digabung (dua indikator kosong ≠ satu sel)', !gKosong[0][0].rs)

// ─── E. Kepala tabel milik pengguna ───────────────────────────────────────────
console.log('\nE. Kepala tabel & batas baris')
const kepala: TabelCell[][] = [
  [{ v: 'No', rs: 2 }, { v: 'Program', rs: 2 }, { v: 'Anggaran', cs: 2 }, { v: '', h: true }, { v: 'Capaian', rs: 2 }],
  [{ v: '', h: true }, { v: '', h: true }, { v: 'Pagu' }, { v: 'Realisasi' }, { v: '', h: true }],
]
const payloadKepala: PayloadTabel = { judul: 'Uji', kolom: ['A', 'B', 'C', 'D', 'E'], align: [], headerRows: 2, rows: [...kepala, [{ v: 'lama' }, { v: '' }, { v: '' }, { v: '' }, { v: '' }]] }
const resep5: KolomTaut[] = [
  { isi: { jenis: 'nomor' } }, { isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'sumber', kunci: 'pagu' } },
  { isi: { jenis: 'sumber', kunci: 'realKeu' } }, { isi: { jenis: 'sumber', kunci: 'pctKeu' } },
]
const badan5 = bangunBadan(hasilUji, { kolom: resep5, sembunyi: [], tebalInduk: true })
const rows5 = pasangBadan(payloadKepala, badan5)!
ok('E1 kepala 2 baris + gabungannya utuh', JSON.stringify(rows5.slice(0, 2)) === JSON.stringify(kepala), JSON.stringify(rows5.slice(0, 2)))
ok('E2 badan lama diganti hasil tarikan', rows5.length === 2 + 4 && rows5[2][1].v === 'Total')
const meta = buildTableMeta(rows5, 5)
ok('E3 Word melihat gabungan kepala (gridSpan & vMerge)', meta[0][2].kind === 'origin' && meta[0][2].cs === 2 && meta[1][0].kind === 'vcont')
ok('E4 jumlahBarisKepala dijepit ke jumlah baris', jumlahBarisKepala({ headerRows: 3, rows: [[{ v: '' }]] }) === 1)
const banyak: HasilTarik = { ...hasilUji, baris: Array.from({ length: BATAS_BARIS }, (_, i) => ({ kunci: `k${i}`, label: `b${i}`, sel: { label: `b${i}` } })) }
ok('E5 melewati 500 baris (kepala + badan) → ditolak, bukan dipotong', pasangBadan(payloadKepala, bangunBadan(banyak, { kolom: resep5, sembunyi: [], tebalInduk: false })) === null)

// ─── F. Perbarui ──────────────────────────────────────────────────────────────
console.log('\nF. Perbarui')
const lama = { rows: badan5.rows, kunciBaris: badan5.kunciBaris }
const sama = bandingPerbarui(lama, bangunBadan(hasilUji, { kolom: resep5, sembunyi: [], tebalInduk: true }), resep5)
ok('F1 tarikan identik → sama (tidak menulis)', sama.sama && sama.angkaBerubah === 0 && kalimatPerbarui(sama) === 'Tidak ada yang berubah.')
const hasilUbah: HasilTarik = { ...hasilUji, baris: [
  { ...hasilUji.baris[0], sel: { ...hasilUji.baris[0].sel, realKeu: 900 } },
  hasilUji.baris[1], hasilUji.baris[3],
  { kunci: 'P3', label: 'Program C', indent: 1, sel: { label: 'Program C', pagu: 10, realKeu: 0, pctKeu: 0 } },
] }
const ubah = bandingPerbarui(lama, bangunBadan(hasilUbah, { kolom: resep5, sembunyi: [], tebalInduk: true }), resep5)
ok('F2 satu angka berubah dihitung per kunci (bukan per nomor baris)', ubah.angkaBerubah === 1, String(ubah.angkaBerubah))
ok('F3 baris baru disebut namanya', ubah.barisBaru.join() === 'Program C')
ok('F4 baris hilang disebut namanya', ubah.barisHilang.join() === 'Kegiatan A1', ubah.barisHilang.join())
ok('F5 kalimat ringkasan', kalimatPerbarui(ubah) === '1 sel berubah · 1 baris baru (Program C) · 1 baris hilang (Kegiatan A1)', kalimatPerbarui(ubah))
const tukar = bandingPerbarui(lama, bangunBadan({ ...hasilUji, baris: [hasilUji.baris[1], hasilUji.baris[0], hasilUji.baris[2], hasilUji.baris[3]] }, { kolom: resep5, sembunyi: [], tebalInduk: true }), resep5)
ok('F6 urutan bergeser saja → bukan "sama", disebut', !tukar.sama && tukar.urutanBerubah && tukar.angkaBerubah === 0)
const nomorSaja = bandingPerbarui(lama, bangunBadan({ ...hasilUji, baris: hasilUji.baris.filter(b => b.kunci !== 'P1') }, { kolom: resep5, sembunyi: [], tebalInduk: true }), resep5)
ok('F6b baris hilang menggeser Nomor urut — tidak dihitung "sel berubah"', nomorSaja.angkaBerubah === 0 && nomorSaja.barisHilang.join() === 'Program A', String(nomorSaja.angkaBerubah))
ok('F7 lepasTautan membuang resep saja', JSON.stringify(lepasTautan({ judul: 'x', tautan: 1 })) === '{"judul":"x"}')
ok('F8 waktu tarik ditulis tanpa geser zona', tulisWaktuTarik('2026-10-14 10:12') === '14 Okt 2026 10.12')
ok('F9 sidik grafik berubah kalau datanya berubah', sidikGrafik([{ label: 'a', value: 1 }]) !== sidikGrafik([{ label: 'a', value: 2 }])
  && sidikGrafik([{ label: 'a', value: 1 }]) === sidikGrafik([{ label: 'a', value: 1 }]))

// ─── G. Skema simpan ──────────────────────────────────────────────────────────
console.log('\nG. Skema simpan')
const tautanUji: Tautan = {
  sumber: 'kinerja-rekap', setelan: { tahun: 2099, sdBulan: 12, versi: 'berlaku', kedalaman: 'program' },
  kolom: resep5, kunciBaris: badan5.kunciBaris, sembunyi: ['X'], tebalInduk: true,
  ditarikPada: '2099-12-31 10:00', ringkas: 'E-Anggaran · Rekap', catatan: ['c'],
}
const simpan = TabelPayloadSchema.safeParse({ ...payloadKepala, rows: rows5, tautan: tautanUji })
ok('G1 resep TIDAK dibuang Zod saat Simpan', simpan.success && JSON.stringify(simpan.data.tautan) === JSON.stringify(tautanUji),
  simpan.success ? JSON.stringify(simpan.data.tautan).slice(0, 80) : simpan.error.issues[0].message)
const kolomSalah = TabelPayloadSchema.safeParse({ ...payloadKepala, rows: rows5, tautan: { ...tautanUji, kolom: resep5.slice(1) } })
ok('G2 pemetaan tidak sejajar kolom → ditolak', !kolomSalah.success)
const barisSalah = TabelPayloadSchema.safeParse({ ...payloadKepala, rows: [...rows5, rows5[2]], tautan: tautanUji })
ok('G3 baris badan tak sejajar kunci (baris disisip) → ditolak', !barisSalah.success)
ok('G4 tabel biasa tetap diterima', TabelPayloadSchema.safeParse({ judul: '', kolom: ['A'], rows: [[{ v: 'x' }]] }).success)
ok('G5 sumber tak dikenal ditolak', !TabelPayloadSchema.safeParse({ ...payloadKepala, rows: rows5, tautan: { ...tautanUji, sumber: 'blud' } }).success)
ok('G6 grafik: tabelSidik ikut tersimpan', GrafikPayloadSchema.parse({ tabelSidik: 'abc' }).tabelSidik === 'abc' && GrafikPayloadSchema.parse({}).tabelSidik === '')

// ─── Data tiruan E-Anggaran ───────────────────────────────────────────────────
const MK: (keyof SskMonths)[] = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des']
const bulanan = (v: number): SskMonths => MK.reduce((a, m) => { a[m] = v; return a }, {} as SskMonths)
const ITEM: ItemSskAktif[] = [
  { canonical_id: 'A', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1', uraian_ssk: 'SSK A', uraian: 'Item A', pagu: 1_200_000, months: bulanan(100_000) },
  { canonical_id: 'B', program: 'Program 2', kegiatan: 'Kegiatan 2', subkegiatan: 'Sub 2', uraian_ssk: 'SSK B', uraian: 'Item B', pagu: 2_400_000, months: bulanan(200_000) },
]
const mentah: RealRowRaw[] = []
for (let b = 1; b <= 12; b++) {
  mentah.push({ bulan: b, keterangan: 'Item A', uraian_ssk: 'SSK A', program: 'Program 1', kegiatan: 'Kegiatan 1', subkegiatan: 'Sub 1',
    ssk_canonical_id: 'A', ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0, real_fisik: 90_000, real_keuangan: 80_000 })
  mentah.push({ bulan: b, keterangan: 'Item B', uraian_ssk: 'SSK B', program: 'Program 2', kegiatan: 'Kegiatan 2', subkegiatan: 'Sub 2',
    ssk_canonical_id: 'B', ssk_versi_tipe: 'MURNI', ssk_versi_seq: 0, real_fisik: 150_000, real_keuangan: 100_000 })
}
const peta = new Map(ITEM.map(i => [i.canonical_id, { pagu: i.pagu, months: i.months }]))
const ROWS_GAJI = recalcAllRealisasiServer(mentah, { sskByCanonical: peta }) as unknown as RealRow[]

type Jawab = ApiResult<unknown>
function ambilTiruan(atur: (sumber: SumberSSK, url: string) => Jawab | undefined): AmbilJson {
  return async url => {
    const m = /sumber=([A-Z]+)/.exec(url)
    const s = (m?.[1] ?? '') as SumberSSK
    const j = atur(s, url)
    if (j) return structuredClone(j)
    if (url.includes('versi-list')) return { ok: true, items: [] }
    return { ok: true, rows: [], itemSsk: [], versi: { tipe: 'MURNI', seq: 0, dinolkan: false } }
  }
}
const normal = ambilTiruan((s, url) => {
  if (s === 'GAJI' && url.includes('versi-list')) return { ok: true, items: [{ versi_tipe: 'MURNI', versi_seq: 0 }, { versi_tipe: 'PERUBAHAN', versi_seq: 1 }] }
  // Deviasi BASI di baris DB (rumus lama) — `recalcAllRealisasi` pemuat yang membetulkannya.
  if (s === 'GAJI') return { ok: true, rows: ROWS_GAJI.map(r => ({ ...r, deviasi_keuangan: 999 })), itemSsk: ITEM, versi: { tipe: url.includes('versi_tipe=MURNI') ? 'MURNI' : 'PERUBAHAN', seq: url.includes('versi_tipe=MURNI') ? 0 : 1, dinolkan: false } }
  if (s === 'BLUD' && url.includes('versi-list')) return { ok: true, items: [{ versi_tipe: 'PERUBAHAN', versi_seq: 1 }] }
  if (s === 'BLUD') return { ok: true, rows: [], itemSsk: [], versi: { tipe: 'PERUBAHAN', seq: 1, dinolkan: true } }
  if (s === 'HARLEP') return { ok: false, status: 500, message: 'Server bermasalah' }
  return undefined
})

// ─── H. Penghubung E-Anggaran ─────────────────────────────────────────────────
console.log('\nH. Penghubung E-Anggaran Rekap')
const sKin = setelanKinerjaRekap({}, 2099)
ok('H1 bawaan: tahun dokumen, s/d Desember, versi berlaku, s/d program',
  sKin.tahun === 2099 && sKin.sdBulan === 12 && sKin.versi === 'berlaku' && sKin.kedalaman === 'program')
const sRusak = setelanKinerjaRekap({ tahun: 'x', sdBulan: 13, versi: 'aneh', kedalaman: 'semua' }, 2099)
ok('H2 setelan rusak jatuh ke bawaan', sRusak.tahun === 2099 && sRusak.sdBulan === 12 && sRusak.versi === 'berlaku' && sRusak.kedalaman === 'program')
ok('H3 judul kolom = judul unduhan Rekap (satu sumber)', KOLOM_KINERJA_REKAP.length === 13 && KOLOM_KINERJA_REKAP.every((k, i) => k.label === REKAP_HEADER[i]))
const tKin = await tarikKinerjaRekap({ ...sKin, kedalaman: 'ssk' }, normal)
const bahanKin = await muatBahanRekap('2099', 'berlaku', normal)
const pembanding = hitungRekap(bahanKin.rows, bahanKin.items, 12, 'ssk', 'RSJD Dr. Amino Gondohutomo')
ok('H4 angka = hitungRekap layar Cetak (pagu, realisasi, % setiap baris)',
  tKin.baris.length === pembanding.baris.length && tKin.baris.every((b, i) =>
    b.sel.pagu === pembanding.baris[i].pagu && b.sel.realKeu === pembanding.baris[i].realKeu && b.sel.pctKeu === pembanding.baris[i].pctKeu))
ok('H5 kunci baris unik & total berkunci tetap', new Set(tKin.baris.map(b => b.kunci)).size === tKin.baris.length && tKin.baris[0].kunci === '["T"]')
ok('H6 kunci program = jalur nama', tKin.baris.some(b => b.kunci === '["P","Program 2"]'))
ok('H7 catatan dinol-kan & sumber gagal ikut', tKin.catatan.some(c => c.includes('BLUD dinol-kan')) && tKin.catatan.some(c => c.includes('HARLEP gagal dimuat')), tKin.catatan.join(' | '))
ok('H8 ringkasan menyebut bulan, tahun, kedalaman, versi', tKin.ringkas.includes('Rekap s/d Desember 2099') && tKin.ringkas.includes('S/D Uraian SSK') && tKin.ringkas.includes('GAJI'), tKin.ringkas)
const tolak = (status: number) => ambilTiruan(() => ({ ok: false, status, message: 'x' }))
let pesan403 = ''
try { await tarikKinerjaRekap(sKin, tolak(403)) } catch (e) { pesan403 = (e as Error).message }
ok('H9 tanpa akses E-Anggaran → kalimat menyebut modulnya', pesan403.startsWith('Butuh akses E-Anggaran'), pesan403)
let pesan503 = ''
try { await tarikKinerjaRekap(sKin, tolak(503)) } catch (e) { pesan503 = (e as Error).message }
ok('H10 maintenance → kalimat pemeliharaan', pesan503.includes('pemeliharaan'), pesan503)
const tKinKosong = await tarikKinerjaRekap({ ...sKin, tahun: 2098 }, ambilTiruan(() => undefined))
ok('H11 data kosong (bukan ditolak) → tabel kosong tanpa galat', tKinKosong.baris.length === 0)
const tMurni = await tarikKinerjaRekap({ ...sKin, versi: 'murni' }, normal)
ok('H12 versi murni diresolusi lewat versi-list (BLUD tanpa murni disebut)', tMurni.ringkas.includes('GAJI MURNI') && tMurni.ringkas.includes('BLUD tidak punya versi murni'), tMurni.ringkas)

// ─── I. Penghubung Renaksi ────────────────────────────────────────────────────
console.log('\nI. Penghubung Renaksi Cetak')
const raDasar = {
  tahun: 2099, kode: null, tujuan: null, outcome_program: null, outcome_kegiatan: null, outcome_sub_kegiatan: null,
  kegiatan: null, sub_kegiatan: null, satuan: '%', target_rpjmd: 0,
  q1_target: 0, q1_realisasi: null, q2_target: 0, q2_realisasi: null, q3_target: 0, q3_realisasi: null, q4_target: 0, q4_realisasi: null,
  anggaran_nominal: null, bulan_target: null, bulan_realisasi: null, version: 1,
}
const RA: RaRow[] = [
  { ...raDasar, id: 11, level: 'sasaran', program: 'Meningkatnya Mutu', sasaran: null, indikator: 'Indeks Kepuasan', jenis: 'Akumulatif', target_tahunan: 80, q1_realisasi: 40, q2_realisasi: 44 },
  { ...raDasar, id: 12, level: 'sasaran', program: 'Meningkatnya Mutu', sasaran: null, indikator: 'Net Death Rate', jenis: 'Progres Negatif', target_tahunan: 4 },
  { ...raDasar, id: 13, level: 'sasaran', program: 'Menurunnya Kejadian', sasaran: null, indikator: 'Angka Kejadian', jenis: 'Progres Negatif', target_tahunan: 10, q4_realisasi: 8 },
  { ...raDasar, id: 21, level: 'program', program: 'Program Mutu', sasaran: 'Meningkatnya Mutu', indikator: 'Akreditasi', jenis: 'Akumulatif', target_tahunan: 1, q4_realisasi: 1 },
]
const ambilRa: AmbilJson = async url => {
  const lv = /level=([a-z-]+)/.exec(url)?.[1] as RaLevel
  return { ok: true, data: structuredClone(RA.filter(r => r.level === lv)) }
}
const sRa = setelanRenaksiCetak({ mode: 'flat', levels: { tujuan: false, sasaran: true, program: false, kegiatan: false, 'sub-kegiatan': false } }, 2099)
const tRa = await tarikRenaksiCetak(sRa, ambilRa)
ok('I1 daftar per level: hanya indikator sasaran', tRa.baris.length === 3 && tRa.baris.every(b => b.kunci.startsWith('ra:1')), tRa.baris.map(b => b.kunci).join())
const katalog = kolomRenaksi()
ok('I2 katalog memuat Target (Data Entry) & Realisasi & Capaian', katalog.some(k => k.kunci === 'tahunan' && k.grup === 'Target (Data Entry)')
  && katalog.some(k => k.kunci === 'akhir' && k.grup === 'Realisasi') && katalog.some(k => k.kunci === 'capaian' && k.jenis === 'persen'))
ok('I3 judul TW jelas, bukan "T"/"R"', katalog.find(k => k.kunci === 'tw1t')?.label === 'Target TW I' && katalog.find(k => k.kunci === 'tw4r')?.label === 'Realisasi TW IV')
const bRa = bangunBadan(tRa, { kolom: [
  { isi: { jenis: 'sumber', kunci: 'sasaran' }, gabungSama: true },
  { isi: { jenis: 'sumber', kunci: 'indikator' } },
  { isi: { jenis: 'sumber', kunci: 'tahunan' } },
  { isi: { jenis: 'sumber', kunci: 'akhir' } },
  { isi: { jenis: 'sumber', kunci: 'capaian' } },
], sembunyi: [], tebalInduk: true })
const iNdr = bRa.rows.findIndex(r => r[1].v === 'Net Death Rate')
const iKepuasan = bRa.rows.findIndex(r => r[1].v === 'Indeks Kepuasan')
ok('I4 tabel Pengukuran Kinerja: sasaran yang punya 2 indikator digabung', bRa.rows[Math.min(iNdr, iKepuasan)][0].rs === 2)
ok('I5 Progres Negatif belum diisi → "—", bukan 200%', bRa.rows[iNdr][4].v === KOSONG, bRa.rows[iNdr][4].v)
ok('I5b Real Akhir yang belum diisi → "—", bukan sel kosong', bRa.rows[iNdr][3].v === KOSONG, JSON.stringify(bRa.rows[iNdr][3]))
const tRaNol = await tarikRenaksiCetak(sRa, async url => {
  const lv = /level=([a-z-]+)/.exec(url)?.[1] as RaLevel
  return { ok: true, data: structuredClone(RA.filter(r => r.level === lv).map(r => (r.id === 12 ? { ...r, q1_realisasi: 0 } : r))) }
})
const bRaNol = bangunBadan(tRaNol, { kolom: [{ isi: { jenis: 'sumber', kunci: 'indikator' } }, { isi: { jenis: 'sumber', kunci: 'akhir' } }, { isi: { jenis: 'sumber', kunci: 'capaian' } }], sembunyi: [], tebalInduk: false })
const iNdrNol = bRaNol.rows.findIndex(r => r[0].v === 'Net Death Rate')
ok('I5c NDR yang memang 0 → Real Akhir 0, Capaian 200%', bRaNol.rows[iNdrNol][1].v === '0' && tampil(bRaNol.rows, iNdrNol, 2) === '200,00%',
  `${bRaNol.rows[iNdrNol][1].v} / ${tampil(bRaNol.rows, iNdrNol, 2)}`)
ok('I6 capaian berisi: 84 dari 80 → "105,00%"', tampil(bRa.rows, iKepuasan, 4) === '105,00%', tampil(bRa.rows, iKepuasan, 4))
ok('I7 catatan menjelaskan "—"', tRa.catatan.some(c => c.includes('Progres Negatif belum diisi')), tRa.catatan.join(' | '))
ok('I8 pilihan fokus dari data', tRa.fokus.sasaran.join() === 'Meningkatnya Mutu,Menurunnya Kejadian' && tRa.fokus.program.join() === 'Program Mutu')
let pesanRa = ''
try { await tarikRenaksiCetak(sRa, async () => ({ ok: false, status: 403, message: 'Akses ditolak' })) } catch (e) { pesanRa = (e as Error).message }
ok('I9 tanpa akses Rencana Aksi → kalimat menyebut modulnya', pesanRa.startsWith('Butuh akses Rencana Aksi'), pesanRa)
const tFokus = await tarikRenaksiCetak({ ...setelanRenaksiCetak({}, 2099), fProgram: 'Program Mutu' }, ambilRa)
ok('I10 fokus program menyaring pohon (+ leluhurnya)', tFokus.baris.some(b => b.kunci === 'ra:21') && !tFokus.baris.some(b => b.kunci === 'ra:13'))
ok('I11 daftar sumber: dua penghubung, kolom bawaan ada di katalognya',
  Object.values(DAFTAR_SUMBER).every(s => s.kolomBawaan().every(k => s.kolom().some(x => x.kunci === k))))

// ─── J. Pemuat Rekap lama vs baru ─────────────────────────────────────────────
console.log('\nJ. Pemuat Rekap: lama (kinerja-client sebelum dipindah) = baru')
// Salinan logika `fetchRealisasiAll` SEBELUM dipindah ke lib/kinerja/muat-rekap.ts, apa adanya
// minus setState — pembanding supaya pemindahan terbukti tidak mengubah layar Cetak.
async function muatLama(tahun: string, pilihan: PilihanVersiRekap, fetchJson: AmbilJson) {
  const results = await Promise.all(
    SUMBER_LIST.map(async s => {
      const kosong = { sumber: s, rows: [] as RealRow[], itemSsk: [] as ItemSskAktif[], dinolkan: false, versi: null as VersiSumberRekap | null }
      let param = ''
      if (pilihan === 'murni') {
        const dv = await fetchJson(`/api/kinerja/ssk/versi-list?tahun=${tahun}&sumber=${s}`)
        const slot = dv.ok ? ((dv as { items?: SlotVersiSsk[] }).items ?? []) : []
        const diminta = versiUntukPilihan(slot, pilihan)
        if (!diminta) return slot.length > 0 ? { ...kosong, versi: { sumber: s, tipe: null, seq: 0 } } : kosong
        param = `&versi_tipe=${diminta.tipe}&versi_seq=${diminta.seq}`
      }
      const d = await fetchJson(`/api/kinerja/realisasi?tahun=${tahun}&sumber=${s}${param}`)
      if (!d.ok) return kosong
      const j = d as { rows?: RealRow[]; itemSsk?: ItemSskAktif[]; versi?: { tipe?: 'MURNI'|'PERUBAHAN'; seq?: number; dinolkan?: boolean } }
      return {
        sumber: s, rows: (j.rows ?? []).map(r => ({ ...r, sumber: s })), itemSsk: j.itemSsk ?? [],
        dinolkan: j.versi?.dinolkan === true,
        versi: { sumber: s, tipe: j.versi?.tipe ?? 'MURNI', seq: Number(j.versi?.seq ?? 0) },
      }
    }),
  )
  return {
    rows: recalcAllRealisasi(results.flatMap(x => x.rows)),
    items: results.flatMap(x => x.itemSsk),
    dinolkan: results.filter(x => x.dinolkan).map(x => x.sumber),
    versiRekap: results.filter(x => x.versi !== null && (x.versi.tipe === null || x.dinolkan || x.itemSsk.length > 0 || x.rows.length > 0)).map(x => x.versi as VersiSumberRekap),
  }
}
for (const pilihan of ['berlaku', 'murni'] as PilihanVersiRekap[]) {
  const a = await muatLama('2099', pilihan, normal)
  const { rows, items, dinolkan, versiRekap } = await muatBahanRekap('2099', pilihan, normal)
  const b = { rows, items, dinolkan, versiRekap }
  ok(`J ${pilihan}: rows, items, dinolkan, versiRekap identik`, JSON.stringify(a) === JSON.stringify(b))
}
ok('J deviasi basi dari DB dihitung ulang', (await muatBahanRekap('2099', 'berlaku', normal)).rows.every(r => r.deviasi_keuangan !== 999))
const bahanGagal = await muatBahanRekap('2099', 'murni', normal)
ok('J gagal per sumber kini dilaporkan (dulu diam)', bahanGagal.gagal.some(g => g.sumber === 'HARLEP' && g.status === 500))

// ─── K. Sambungan editor ──────────────────────────────────────────────────────
console.log('\nK. Sambungan editor & lain-lain')
const ed = kode('app/(dashboard)/lkjip/[id]/editor-client.tsx')
const tabelEd = ed.slice(ed.indexOf('function TabelEditor('), ed.indexOf('function GambarEditor('))
ok('K1 Simpan Tabel menyimpan resep juga — dengan isian tangan terbaru (payloadSekarang)',
  tabelEd.includes('onClick={() => onSave(payloadSekarang())}')
  && tabelEd.includes('...(tautan ? { tautan: ambilIsianTangan(tautan, rows.slice(jumlahBarisKepala({ headerRows, rows }))) } : {})'))
ok('K2 sunting/format/gabung/tempel dikunci di badan tertaut (kecuali kolom isian tangan untuk mengetik)',
  tabelEd.includes('const rectBadan = terkait && !!rect && rect.r2 >= headerRows;')
  && tabelEd.includes('if (!rect || rectBadan) return;')
  && tabelEd.includes('const canMerge = !!rect && !rectBadan')
  && tabelEd.includes('const terkunci = (r: number, c: number) => diBadan(r) && !kolomTangan.has(c);')
  && tabelEd.includes('if (readOnly || terkunci(ri, ci)) return;')
  && tabelEd.includes("!readOnly && !terkunci(ri, ci) && (e.key === 'Enter'")
  && tabelEd.includes('disabled={!sel || terkunci(sel.ar, sel.ac)}'))
ok('K3 tombol format memakai kunci badan (Salin tetap boleh)',
  (tabelEd.match(/disabled=\{!rect \|\| rectBadan\}/g) ?? []).length === 14 && tabelEd.includes('data-tooltip="Salin (Ctrl+C)" data-tooltip-pos="below" disabled={!rect}'))
ok('K4 tambah/hapus baris & kolom dimatikan selama tertaut',
  tabelEd.includes('onClick={addRow} disabled={terkait}') && tabelEd.includes('disabled={ncol >= 12 || terkait}')
  && tabelEd.includes('disabled={ncol <= 1 || terkait}') && tabelEd.includes('!readOnly && !diBadan(ri) && <button'))
const kepalaFn = badan(tabelEd, 'const gantiBarisKepala =')
ok('K5 jumlah baris kepala diubah tanpa memakan baris badan', tabelEd.includes('onChange={e => gantiBarisKepala(Number(e.target.value))}')
  && kepalaFn.includes('if (!terkait) { setHeaderRows(n); return; }') && kepalaFn.includes('...r.slice(hr)]')
  && kepalaFn.includes('sanitizeRows([...r.slice(0, n), ...r.slice(hr)], ncol)'))
ok('K6 riwayat urungkan dikosongkan saat resep berganti', badan(tabelEd, 'const pasangDanSimpan =').includes('setPast([]); setFuture([]);'))
const perb = badan(tabelEd, 'async function perbarui(')
ok('K7 Perbarui: bandingkan dulu, tidak menulis kalau sama, tanya sebelum menulis',
  perb.indexOf('if (nilai.sama) {') > 0 && perb.indexOf('if (nilai.sama) {') < perb.indexOf('await confirmDialog(')
  && perb.indexOf('await confirmDialog(') < perb.indexOf('pasangDanSimpan(') && /if \(!ok\) return;\s*pasangDanSimpan\(/.test(perb))
ok('K8 Perbarui memakai penilaian BERSAMA (nilaiPerbarui) & resep sesudahnya',
  perb.includes('const nilai = nilaiPerbarui(sekarang, hasil);') && perb.includes('tautan: { ...nilai.tautanBaru, ditarikPada:')
  && perb.includes('kalimatIsianYatim(nilai.yatim,') && !perb.includes('bangunBadan('))
ok('K9 modal dimuat saat dibuka saja', /const TautanModal = dynamic\(\(\) => import\('\.\/TautanModal'\), \{ ssr: false \}\)/.test(ed))
ok('K10 keterangan sumber TIDAK masuk Word (docgen tak mengenal tautan)', !/tautan|ringkas|ditarikPada/.test(kode('lib/lkjip/docgen.ts')))
ok('K11 audit simpan blok menyebut sumbernya', kode('app/api/lkjip/block/route.ts').includes('` · tertaut: ${ringkas.slice(0, 200)}`'))
ok('K12 grafik menyimpan sidik data tabel & menandai gambar basi',
  ed.includes("tabelSidik: source === 'tabel' ? sidikGrafik(chartData) : ''") && ed.includes('p0.tabelSidik !== sidikGrafik(chartData)'))
ok('K12b grafik membaca ANGKA sel (bukan teks tampil) & melewati baris kepala',
  ed.includes('value: angkaSel(tableRows, kepalaGrafik + i, valueCol)') && ed.includes('tableRows.slice(kepalaGrafik).map(')
  && !/parseFloat\(String\(displayValue\(/.test(ed))
const kin = kode('lib/lkjip/sumber/kinerja-rekap.ts')
ok('K13 penghubung E-Anggaran memakai pemuat & hitungan layar Cetak, judul unduhan',
  kin.includes('await muatBahanRekap(') && kin.includes('hitungRekap(bahan.rows, bahan.items') && kin.includes('label: REKAP_HEADER[i]'))
const ra = kode('lib/lkjip/sumber/renaksi-cetak.ts')
ok('K14 penghubung Renaksi memakai buildCetakRows & cetakHeader layar Cetak',
  ra.includes('buildCetakRows(semua, filter)') && ra.includes('cetakHeader(filter).flat') && ra.includes('cetakRollupBase(semua, filter)'))
const modal = kode('app/(dashboard)/lkjip/[id]/TautanModal.tsx')
ok('K15 modal berhenti di FORM — tidak memanggil API tulis', !/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(modal) && modal.includes('onTerapkan({ ...dasar, rows: rowsBaru, tautan })'))
ok('K16 modal menolak Masukkan selama ada masalah (rumus, kolom hilang, batas, basi)',
  modal.includes('if (!hasil || !badan || !rowsBaru || !resep || masalah.length) return;') && modal.includes('disabled={memuat || masalah.length > 0}'))

// ─── L. Kolom isian tangan (Tahap 2) ──────────────────────────────────────────
console.log('\nL. Kolom isian tangan')
const hasilT: HasilTarik = {
  kolom: [{ kunci: 'label', label: 'Uraian', jenis: 'teks' }, { kunci: 'nilai', label: 'Nilai', jenis: 'angka' }], catatan: [], ringkas: 'uji',
  baris: ['A', 'B', 'C'].map((h, i) => ({ kunci: h.toLowerCase(), label: `Program ${h}`, sel: { label: `Program ${h}`, nilai: i + 1 } })),
}
const kolomT: KolomTaut[] = [{ isi: { jenis: 'sumber', kunci: 'label' } }, { isi: { jenis: 'tangan', nilai: { b: 'Kendala anggaran', c: 'Tercapai' } } }]
const bT = bangunBadan(hasilT, { kolom: kolomT, sembunyi: [], tebalInduk: false })
ok('L1 isian tangan dipasang per KUNCI baris', bT.rows[0][1].v === '' && bT.rows[1][1].v === 'Kendala anggaran' && bT.rows[2][1].v === 'Tercapai',
  bT.rows.map(r => r[1].v).join(' | '))
const bAcak = bangunBadan({ ...hasilT, baris: [hasilT.baris[2], hasilT.baris[0], hasilT.baris[1]] }, { kolom: kolomT, sembunyi: [], tebalInduk: false })
ok('L2 urutan sumber berubah → isian ikut barisnya, bukan nomor barisnya', bAcak.rows[0][1].v === 'Tercapai' && bAcak.rows[2][1].v === 'Kendala anggaran')
const bKembar = bangunBadan(hasilT, { kolom: [kolomT[0], { isi: { jenis: 'tangan', nilai: { b: 'Sama', c: 'Sama' } }, gabungSama: true }], sembunyi: [], tebalInduk: false })
ok('L3 "Gabung sama" tidak berlaku untuk kolom tangan (sel tertutup kehilangan ketikannya)',
  bKembar.rows[1][1].v === 'Sama' && bKembar.rows[2][1].v === 'Sama' && !bKembar.rows[1][1].rs && !bKembar.rows[2][1].h)
const tautT: Tautan = { sumber: 'kinerja-rekap', setelan: {}, kolom: kolomT, kunciBaris: bT.kunciBaris, sembunyi: [], tebalInduk: false, ditarikPada: '2099-01-01 00:00', ringkas: 'uji', catatan: [] }
const nilaiTangan = (t: Tautan, c = 1) => (t.kolom[c].isi as { jenis: 'tangan'; nilai: Record<string, string> }).nilai
const badanKetik = bT.rows.map((r, i) => r.map((s, c) => (c !== 1 ? s : i === 0 ? { v: 'Baru diketik' } : i === 2 ? { v: '  ' } : s)))
const tSinkron = ambilIsianTangan(tautT, badanKetik)
ok('L4 ketikan terbaru masuk peta, yang dikosongkan dibuang', JSON.stringify(nilaiTangan(tSinkron)) === JSON.stringify({ b: 'Kendala anggaran', a: 'Baru diketik' }),
  JSON.stringify(nilaiTangan(tSinkron)))
const tSembunyi: Tautan = { ...tautT, kolom: [kolomT[0], { isi: { jenis: 'tangan', nilai: { b: 'Kendala anggaran', z: 'Isian baris tersembunyi' } } }] }
ok('L5 isian baris yang disembunyikan tidak disentuh (tidak ada di badan)', nilaiTangan(ambilIsianTangan(tSembunyi, bT.rows)).z === 'Isian baris tersembunyi')
const payloadT: PayloadTabel & { tautan: Tautan } = { judul: '', kolom: ['Uraian', 'Ket'], align: [], headerRows: 0, rows: bT.rows, tautan: tautT }
const hasilTanpaC: HasilTarik = { ...hasilT, baris: hasilT.baris.slice(0, 2) }
const nT = nilaiPerbarui(payloadT, hasilTanpaC)
ok('L6 baris sumber hilang → isiannya yatim, disebut, dan dibuang dari resep baru',
  nT.yatim.length === 1 && nT.yatim[0].kunci === 'c' && !nT.sama && !('c' in nilaiTangan(nT.tautanBaru)) && nilaiTangan(nT.tautanBaru).b === 'Kendala anggaran')
ok('L7 kalimat yatim menyebut baris & isinya', kalimatIsianYatim(nT.yatim, { rows: bT.rows, kunciBaris: bT.kunciBaris }).includes('Program C: "Tercapai"'),
  kalimatIsianYatim(nT.yatim, { rows: bT.rows, kunciBaris: bT.kunciBaris }))
ok('L8 tanpa perubahan apa pun → sama (isian tangan tidak dihitung sebagai perubahan)', nilaiPerbarui(payloadT, hasilT).sama)
const nSembunyiHilang = nilaiPerbarui({ ...payloadT, tautan: tSembunyi }, hasilT)
ok('L9 baris TERSEMBUNYI yang hilang dari sumber: isiannya ikut dibuang, Perbarui tetap menulis',
  !nSembunyiHilang.sama && nSembunyiHilang.ringkas.sama && isianYatim(tSembunyi, new Set(hasilT.baris.map(b => b.kunci))).map(y => y.kunci).join() === 'z')
const zT = TabelPayloadSchema.safeParse({ ...payloadT, tautan: tSinkron })
ok('L10 skema menyimpan isian tangan (tidak dibuang Zod)', zT.success && JSON.stringify(nilaiTangan(zT.data.tautan as Tautan)) === JSON.stringify(nilaiTangan(tSinkron)))
ok('L11 jumlahIsianTangan', jumlahIsianTangan(kolomT[1]) === 2 && jumlahIsianTangan(kolomT[0]) === 0 && jumlahIsianTangan(null) === 0)
ok('L12 editor: kolom tangan menolak rumus (nomor baris bergeser tiap Perbarui)',
  tabelEd.includes("if (diBadan(r) && kolomTangan.has(c) && v.trimStart().startsWith('=')) {") && tabelEd.includes('onChange={e => ubahSel(ri, ci, e.target.value)} />'))
ok('L13 modal: opsi isian tangan + tanya dulu sebelum isian terbuang',
  modal.includes('<option value="tangan">') && modal.includes('if (tanganHilang > 0 && !(await confirmDialog({'))

// ─── M. Sumber Laporan per sumber dana ────────────────────────────────────────
console.log('\nM. E-Anggaran · Laporan per sumber dana')
const yatimNol = { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] }
const lap = (sumber: SumberSSK, pagu: number, real: number, lain: Partial<LaporanSumber> = {}): LaporanSumber => ({
  // Target fisik SENGAJA ≠ pagu: kalau sama, "÷ pagu" dan "÷ target" memberi angka yang sama (M4 buta).
  sumber, total_pagu: pagu, total_target_fisik: pagu * 0.8, total_real_keuangan: real, total_real_fisik: real * 0.9,
  pct_serapan: pagu > 0 ? Math.round((real / pagu) * 10000) / 100 : 0, pct_fisik: pagu > 0 ? Math.round(((real * 0.9) / pagu) * 10000) / 100 : 0,
  bulan_terakhir: 3, trend: [], yatim: yatimNol, versi_aktif: { tipe: 'MURNI', seq: 0 }, versi_dinolkan: false, ...lain,
})
const LAP: LaporanSumber[] = SUMBER_LIST.map(s => (s === 'GAJI'
  ? lap('GAJI', 1_000_000_000, 333_333_333, {
    versi_aktif: { tipe: 'PERUBAHAN', seq: 1 },
    trend: [1, 2, 3].map(b => ({ bulan: b, real_keuangan: 111_111_111, pct_keuangan: 11.11, akum_keuangan: 111_111_111 * b, akum_pct_keuangan: 11.11 * b, real_fisik: 99_999_999.9, akum_pct_fisik: 10 * b })),
  })
  : s === 'BLUD' ? lap('BLUD', 2_000_000_000, 1_500_000_000, { yatim: { jumlahBaris: 2, jumlahItem: 1, nominal: 5_000_000, contoh: [] } })
    : lap(s, 0, 0)))
const ambilLap: AmbilJson = async url => {
  const m = /sumber=([A-Z]+)/.exec(url)
  return { ok: true, data: m ? LAP.find(x => x.sumber === m[1]) : LAP }
}
const tL = await tarikKinerjaLaporan(setelanKinerjaLaporan({}, 2099), ambilLap)
ok('M1 per sumber dana: hanya sumber yang punya pagu/realisasi, JUMLAH di akhir', tL.baris.map(b => b.kunci).join() === 'lap:GAJI,lap:BLUD,lap:JUMLAH',
  tL.baris.map(b => b.kunci).join())
ok('M2 angka baris = angka server apa adanya (layar Laporan)',
  tL.baris[0].sel.pctKeu === LAP[0].pct_serapan && tL.baris[0].sel.pagu === 1_000_000_000 && tL.baris[0].sel.sisa === 1_000_000_000 - 333_333_333)
const jmlL = tL.baris[2].sel
ok('M3 JUMLAH dijumlah dalam RUPIAH lalu persennya diturunkan (L89), bukan rata-rata persen',
  jmlL.pagu === 3_000_000_000 && jmlL.realKeu === 1_833_333_333 && jmlL.pctKeu === Math.round((1_833_333_333 / 3_000_000_000) * 10000) / 100
  && jmlL.pctKeu !== (LAP[0].pct_serapan + LAP[1].pct_serapan) / 2, JSON.stringify(jmlL))
ok('M4 Capaian Fisik JUMLAH = real fisik ÷ PAGU (rumus server), nomornya kosong',
  jmlL.pctFisik === Math.round(((333_333_333 * 0.9 + 1_500_000_000 * 0.9) / 3_000_000_000) * 10000) / 100 && jmlL.no === null)
ok('M5 versi acuan ditulis per sumber', tL.baris[0].sel.versi === 'Perubahan-1' && tL.ringkas.includes('GAJI Perubahan-1') && tL.ringkas.includes('BLUD Murni'), tL.ringkas)
ok('M6 catatan: yatim & sumber tanpa data disebut',
  tL.catatan.some(c => c.includes('TIDAK ikut dihitung') && c.includes('(BLUD)')) && tL.catatan.some(c => c.includes('HARLEP') && c.includes('tidak ditampilkan')),
  tL.catatan.join(' | '))
const tB = await tarikKinerjaLaporan(setelanKinerjaLaporan({ tampilan: 'bulanan', sumber: 'GAJI' }, 2099), ambilLap)
ok('M7 per bulan: 12 bulan + JUMLAH', tB.baris.length === 13 && tB.baris[12].kunci === 'bln:JUMLAH' && tB.baris[0].label === 'Januari', tB.baris[0].label)
ok('M8 bulan tanpa realisasi → kosong, bukan 0', tB.baris[11].sel.realKeu === null && tB.baris[2].sel.akumKeu === 333_333_333)
ok('M9 JUMLAH per bulan = total & persen server', tB.baris[12].sel.realKeu === LAP[0].total_real_keuangan && tB.baris[12].sel.akumPctKeu === LAP[0].pct_serapan)
let pesanLap = ''
try { await tarikKinerjaLaporan(setelanKinerjaLaporan({}, 2099), async () => ({ ok: false, status: 403, message: 'Akses ditolak' })) } catch (e) { pesanLap = (e as Error).message }
ok('M10 tanpa akses → kalimat menyebut modulnya', pesanLap.startsWith('Butuh akses E-Anggaran'), pesanLap)
ok('M11 kolom & kolom bawaan mengikuti tampilan',
  kolomLaporan({ tampilan: 'bulanan' }).some(k => k.kunci === 'akumKeu') && !kolomLaporan({}).some(k => k.kunci === 'akumKeu')
  && (['sumber', 'bulanan'] as const).every(t => kolomBawaanLaporan({ tampilan: t }).every(k => kolomLaporan({ tampilan: t }).some(x => x.kunci === k))))
ok('M12 terdaftar di DAFTAR_SUMBER & diterima skema simpan',
  DAFTAR_SUMBER['kinerja-laporan'].modul === 'E-Anggaran' && TabelPayloadSchema.safeParse({ ...payloadT, tautan: { ...tautT, sumber: 'kinerja-laporan' } }).success)
ok('M13 memakai endpoint layar Laporan yang sudah ada (nol endpoint baru)', kode('lib/lkjip/sumber/kinerja-laporan.ts').includes('`/api/kinerja/laporan?tahun=${tahun}`'))

// ─── N. Templat satu klik ────────────────────────────────────────────────────
console.log('\nN. Templat')
for (const t of DAFTAR_TEMPLAT) {
  const s = DAFTAR_SUMBER[t.sumber].setelan({ ...t.setelan, tahun: 2099 }, 2099)
  const katalog = new Set(DAFTAR_SUMBER[t.sumber].kolom(s).map(k => k.kunci))
  ok(`N ${t.id}: kolom menunjuk kolom sumber yang ada & rumusnya sah`,
    t.kolom.length <= 12 && t.kolom.every((k, i) => (k.taut.isi.jenis === 'sumber' ? katalog.has(k.taut.isi.kunci)
      : k.taut.isi.jenis === 'rumus' ? !('galat' in periksaRumusKolom(k.taut.isi.ekspresi, t.kolom.length, i)) : true)))
  ok(`N ${t.id}: setelannya lolos normalisasi tanpa berubah arti`, Object.entries(t.setelan).every(([k, v]) => JSON.stringify(s[k]) === JSON.stringify(v)))
}
const tProg = DAFTAR_TEMPLAT.find(t => t.id === 'anggaran-program')!
const bProg = bangunBadan({ kolom: KOLOM_KINERJA_REKAP, catatan: [], ringkas: 'x',
  baris: [{ kunci: '["T"]', label: 'RSJD', tebal: true, sel: { label: 'RSJD', pagu: 1000, realKeu: 400, pctKeu: 40 } }] },
{ kolom: tProg.kolom.map(k => k.taut), sembunyi: [], tebalInduk: true })
ok('N anggaran-program: Sisa = Anggaran − Realisasi', angkaSel(bProg.rows, 0, 4) === 600 && bProg.kolomHilang.length === 0, String(angkaSel(bProg.rows, 0, 4)))
const tPk = DAFTAR_TEMPLAT.find(t => t.id === 'pengukuran-kinerja')!
const bPk = bangunBadan(await tarikRenaksiCetak(setelanRenaksiCetak(tPk.setelan, 2099), ambilRa), { kolom: tPk.kolom.map(k => k.taut), sembunyi: [], tebalInduk: true })
ok('N pengukuran-kinerja: sasaran ber-2 indikator digabung, nomor urut per indikator',
  bPk.rows.some(r => (r[1].rs ?? 1) === 2) && bPk.rows.map(r => r[0].v).join() === '1,2,3' && bPk.kolomHilang.length === 0, bPk.rows.map(r => r[0].v).join())
const tSd = DAFTAR_TEMPLAT.find(t => t.id === 'anggaran-sumber-dana')!
const bSd = bangunBadan(tL, { kolom: tSd.kolom.map(k => k.taut), sembunyi: [], tebalInduk: true })
ok('N anggaran-sumber-dana: JUMLAH di akhir, tanpa nomor, tebal', bSd.rows[2][0].v === '' && bSd.rows[2][1].v === 'JUMLAH' && !!bSd.rows[2][1].b && bSd.rows[0][0].v === '1')
ok('N modal: templat hanya untuk tabel baru & cuma mengisi form', modal.includes('{kosongAwal && (') && badan(modal, 'function pakaiTemplat(').includes('void tarik(t.sumber, s);'))

// ─── O. Periksa kesegaran & Finalisasi ────────────────────────────────────────
console.log('\nO. Periksa tabel tertaut')
const blokTabel = (id: number, tautan?: Tautan) => ({ id, tipe: 'TABEL', payload: { judul: `T${id}`, kolom: ['Uraian', 'Ket'], align: [], headerRows: 0, rows: bT.rows, ...(tautan ? { tautan } : {}) } })
const dokO = [
  { id: 1, nomor: 'BAB III', judul: 'AKUNTABILITAS', blocks: [blokTabel(11, tautT), blokTabel(12), { id: 13, tipe: 'NARASI', payload: { html: '' } }] },
  { id: 2, nomor: '3.2', judul: 'Anggaran', blocks: [blokTabel(21, { ...tautT }), blokTabel(22, { ...tautT, sumber: 'renaksi-cetak', setelan: { x: 1 } })] },
]
const daftarO = kumpulkanTabelTertaut(dokO)
ok('O1 hanya blok TABEL bertautan yang dikumpulkan, beserta letaknya', daftarO.map(t => t.blockId).join() === '11,21,22' && daftarO[0].letak === 'BAB III AKUNTABILITAS')
let jumlahTarik = 0
const hasilO = await periksaKesegaran(daftarO, async sumber => {
  jumlahTarik++
  if (sumber === 'renaksi-cetak') throw Object.assign(new Error('Butuh akses Rencana Aksi.'), { name: 'GagalTarik' })
  return hasilT
})
ok('O2 resep sumber yang sama ditarik SEKALI', jumlahTarik === 2, String(jumlahTarik))
ok('O3 status sama / gagal dengan kalimat modulnya',
  hasilO[0].status === 'sama' && hasilO[1].status === 'sama' && hasilO[2].status === 'gagal' && hasilO[2].pesan === 'Butuh akses Rencana Aksi.')
const hasilO2 = await periksaKesegaran(daftarO.slice(0, 1), async () => hasilTanpaC)
const ringkasO2 = hasilO2[0].status === 'berubah' ? hasilO2[0].ringkas : ''
ok('O4 berubah: kalimat menyebut baris hilang & isian tangan yatim', ringkasO2.includes('1 baris hilang') && ringkasO2.includes('1 isian tangan kehilangan barisnya'), ringkasO2)
const finalFn = badan(ed, 'async function finalize(')
ok('O5 Finalisasi memeriksa tabel tertaut DULU & menawarkan memperbaruinya',
  finalFn.indexOf('await jalankanPeriksa(tertaut)') > 0 && finalFn.indexOf('await jalankanPeriksa(tertaut)') < finalFn.indexOf('await kirimFinal()')
  && finalFn.includes("confirmLabel: 'Lihat & perbarui dulu', altLabel: 'Tetap finalisasi'"))
ok('O6 panel Periksa hanya membaca (tak ada simpan blok di jalurnya)',
  !badan(ed, 'async function bukaPeriksa(').includes('saveBlock') && !badan(ed, 'async function jalankanPeriksa(').includes('saveBlock') && !kode('lib/lkjip/kesegaran.ts').includes('fetch('))
ok('O7 Periksa & tombol Perbarui memakai penilaian yang SAMA', kode('lib/lkjip/kesegaran.ts').includes('nilaiPerbarui(t.payload, await tarikan.get(kunci)!)'))

console.log(`\n${lulus} lulus, ${gagal.length} gagal`)
if (gagal.length) { console.log('GAGAL: ' + gagal.join(' | ')); process.exit(1) }
