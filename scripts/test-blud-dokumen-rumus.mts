// scripts/test-blud-dokumen-rumus.mts — rumus di Dokumen Excel DPA & Pergeseran.
//
// Kenapa ada: dilaporkan pemakai bahwa unduhan Excel penuh rumus yang berbunyi
// galat, dan dugaannya benar — sebabnya DPA hasil IMPOR.
//
// Berkas impor lumrah memuat baris berjumlah TANPA rincian vol × harga (sumbernya
// cuma memuat totalnya). Pada baris begitu, sel vol/harga ditulis sebagai teks
// kosong, sementara kolom nilainya diberi rumus `ROUND(C5*E5,0)` — dan `""*""`
// di Excel berbunyi #VALUE!. Di data 2026 ada 22 baris daun seperti itu, dan
// Pergeseran mewarisi 22 yang sama karena barisnya disalin dari DPA.
//
// Diuji lewat workbook SUNGGUHAN: `buatWorkbookDpa`/`buatWorkbookPergeseran` yang
// sama dengan tombol unduh, lalu selnya dibaca kembali.
//
// Jalankan: npx tsx scripts/test-blud-dokumen-rumus.mts

import type ExcelJS from 'exceljs'
import { buatWorkbookDpa, buatWorkbookPergeseran } from '../lib/blud/export/dpa-dokumen'
import type { DpaBaris, PergeseranBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok    ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}

const dasar = {
  id: 0, tahun_anggaran: 2026, versi_tanggal: '2026-01-31',
  kode_rekening: '', uraian: '', satuan: null, parent_id: null,
  anggaran_key: null, origin: null, usulan_item_id: null, usulan_no: null,
  penanggung_jawab: null, keterangan: null,
} as unknown as DpaBaris

/** Induk + dua daun: satu berincian vol × harga, satu hanya bertotal (khas impor). */
function barisDpa(): DpaBaris[] {
  return [
    { ...dasar, row_id: 'induk', tipe_baris: 'MASTER', urutan: 1,
      kode_rekening: '5.1', uraian: 'BELANJA OPERASI',
      vol: null, harga: null, jumlah: 7_000_000 },
    { ...dasar, row_id: 'rinci', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 2,
      kode_rekening: '5.1.01', uraian: 'Belanja rinci', satuan: 'th',
      vol: 2, harga: 1_000_000, jumlah: 2_000_000 },
    { ...dasar, row_id: 'total', parent_id: 'induk', tipe_baris: 'CHILD', urutan: 3,
      kode_rekening: '5.1.02', uraian: 'Belanja hasil impor (total saja)',
      vol: null, harga: null, jumlah: 5_000_000 },
  ] as unknown as DpaBaris[]
}

function barisPergeseran(): PergeseranBaris[] {
  return barisDpa().map(r => ({
    ...r, dpa_versi_tanggal: '2026-01-31',
    vol_p: r.vol, harga_p: r.harga, pergeseran: r.jumlah, bertambah_berkurang: 0,
  })) as unknown as PergeseranBaris[]
}

const cari = (ws: ExcelJS.Worksheet, uraian: string) => {
  for (let n = 1; n <= ws.rowCount; n++) {
    if (String(ws.getRow(n).getCell(2).value ?? '').includes(uraian)) return ws.getRow(n)
  }
  return null
}
const isRumus = (v: unknown) => !!v && typeof v === 'object' && 'formula' in (v as object)
const angka = (v: unknown) => (typeof v === 'number' ? v : null)

for (const [label, buat, kolNilai, kolVol] of [
  ['DPA',        () => buatWorkbookDpa({ rows: barisDpa(), tahun: 2026, versi: '2026-01-31' }),          6, 3],
  ['Pergeseran', () => buatWorkbookPergeseran({ rows: barisPergeseran(), tahun: 2026, versi: '2026-01-31' }), 9, 7],
] as const) {
  console.log(`\n── Dokumen ${label} ──`)
  const wb = await buat()
  const ws = wb.worksheets[0]

  const rinci = cari(ws, 'Belanja rinci')
  const total = cari(ws, 'hasil impor')
  const induk = cari(ws, 'BELANJA OPERASI')
  cek('Ketiga barisnya tertulis', !!rinci && !!total && !!induk)
  if (!rinci || !total || !induk) continue

  cek('Baris berincian tetap memakai rumus vol x harga',
    isRumus(rinci.getCell(kolNilai).value),
    'rumusnya memang berguna di sana — orang bisa mengubah vol lalu totalnya ikut')

  // Inti perbaikannya.
  cek('Baris tanpa vol/harga ditulis ANGKA, bukan rumus',
    !isRumus(total.getCell(kolNilai).value),
    'ROUND(""*"",0) berbunyi #VALUE! — rumus ada tapi galat')
  cek('…dan angkanya yang sebenarnya, bukan nol',
    angka(total.getCell(kolNilai).value) === 5_000_000,
    String(total.getCell(kolNilai).value))

  // Menulis 0 di sel vol supaya rumusnya "jalan" akan melahirkan total 0 pada
  // baris yang nilainya 5 juta — angka salah yang terlihat benar.
  cek('Sel vol-nya tidak dikarang jadi nol', angka(total.getCell(kolVol).value) !== 0,
    String(total.getCell(kolVol).value))

  cek('Induk tetap menjumlah anak-anaknya', isRumus(induk.getCell(kolNilai).value))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
