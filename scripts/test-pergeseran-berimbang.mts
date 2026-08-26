// scripts/test-pergeseran-berimbang.mts
// Penjaga regresi aturan B6 "pergeseran wajib berimbang" (pagu tetap).
//
// Yang dijaga BUKAN "rumusnya ada", tapi tiga keputusan yang gampang dibatalkan
// tanpa tsc protes, karena tipenya sama-sama `number | null`:
//
//   1. Kolom P adalah salinan PENUH kolom DPA. Kalau dikosongkan lagi
//      (`vol_p: null`), `recalcPergeseranJumlah` membaca `pergeseran = 0` — itu
//      "pagunya dinolkan", bukan "belum digeser". Salinan segar langsung
//      melaporkan seluruh DPA lenyap dan Simpan ditolak sebelum digeser. Lebih
//      buruk: `getPaguEfektif` membaca pagu tahun itu dari kolom `pergeseran`,
//      jadi nol di situ = Realisasi & Buku Kas menolak belanja.
//   2. Sinkronkan DPA (`injectDpaKePergeseran`) harus MEMBAWA baris yang belum
//      digeser ikut DPA baru, sekaligus TIDAK MENYENTUH yang sudah digeser.
//   3. Akar dihitung struktural (tanpa induk), bukan dari `tipe_baris` —
//      baris menggantung yang bukan Level 1 uangnya nyata tapi dulu luput dari
//      satu-satunya angka yang memisahkan draf dari dokumen resmi.
//
// Murni di memori, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-pergeseran-berimbang.mts

import { recalcPergeseranJumlah, hitungDeltaPergeseranRoot, injectDpaKePergeseran } from '../lib/blud/recalc'
import { dpaKePergeseranInput } from '../lib/blud/row-map'
import type { DpaBaris, PergeseranBarisInput } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

const dasar = {
  id: 0, versi_tanggal: '2026-01-01', satuan: null, penanggung_jawab: null, keterangan: null,
  anggaran_key: null, origin: 'MANUAL' as const, usulan_item_id: null, usulan_no: null,
}

/** 1 akar → 1 master → 3 daun. Total 1.000.000. */
function dpa(): DpaBaris[] {
  return [
    { ...dasar, id: 1, kode_rekening: '5',      uraian: 'BELANJA DAERAH', vol: null, harga: null,    jumlah: 1_000_000,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0 },
    { ...dasar, id: 2, kode_rekening: '5.1',    uraian: 'BELANJA OPERASI', vol: null, harga: null,   jumlah: 1_000_000,
      tipe_baris: 'MASTER', row_id: 'r2', parent_id: 'r1', urutan: 1 },
    { ...dasar, id: 3, kode_rekening: '5.1.01', uraian: 'ATK',      vol: 1, harga: 500_000, jumlah:   500_000,
      tipe_baris: 'CHILD', row_id: 'r3', parent_id: 'r2', urutan: 2 },
    { ...dasar, id: 4, kode_rekening: '5.1.02', uraian: 'Listrik',  vol: 1, harga: 300_000, jumlah:   300_000,
      tipe_baris: 'CHILD', row_id: 'r4', parent_id: 'r2', urutan: 3 },
    { ...dasar, id: 5, kode_rekening: '5.1.03', uraian: 'Air',      vol: 1, harga: 200_000, jumlah:   200_000,
      tipe_baris: 'CHILD', row_id: 'r5', parent_id: 'r2', urutan: 4 },
  ]
}

const delta = (rows: PergeseranBarisInput[]) => hitungDeltaPergeseranRoot(recalcPergeseranJumlah(rows))

bab('A. Salinan segar dari DPA — berimbang sejak lahir')
{
  const salinan = dpa().map(dpaKePergeseranInput)
  const hasil   = recalcPergeseranJumlah(salinan)

  cek('Delta akar = 0 (Simpan tidak ditolak)', delta(salinan) === 0, String(delta(salinan)))
  cek('Daun membawa pagu, bukan nol', hasil[2].pergeseran === 500_000, String(hasil[2].pergeseran))
  cek('Induk menjumlah anak dengan benar', hasil[1].pergeseran === 1_000_000, String(hasil[1].pergeseran))
  cek('Akar sama dengan pagu DPA', hasil[0].pergeseran === 1_000_000, String(hasil[0].pergeseran))
  cek('Tidak ada baris ber-selisih', hasil.every(r => r.bertambah_berkurang === 0))
  // Agregator memang tidak punya vol/harga sendiri — nilainya dari anak.
  cek('Agregator tetap tanpa vol_p/harga_p', hasil[0].vol_p === null && hasil[1].harga_p === null)
}

bab('B. Geser antar-pos — yang tak disentuh tidak ikut hilang')
{
  const salinan = dpa().map(dpaKePergeseranInput)
  // ATK turun 1.000, Listrik naik 1.000. Air tidak disentuh sama sekali.
  const digeser = salinan.map(r =>
    r.row_id === 'r3' ? { ...r, harga_p: 499_000 } :
    r.row_id === 'r4' ? { ...r, harga_p: 301_000 } : r)
  const hasil = recalcPergeseranJumlah(digeser)

  cek('Delta akar tetap 0', delta(digeser) === 0, String(delta(digeser)))
  cek('ATK −1.000',  hasil[2].bertambah_berkurang === -1_000, String(hasil[2].bertambah_berkurang))
  cek('Listrik +1.000', hasil[3].bertambah_berkurang === 1_000, String(hasil[3].bertambah_berkurang))
  cek('Air tak disentuh: pagunya utuh', hasil[4].pergeseran === 200_000, String(hasil[4].pergeseran))
  cek('Induk tidak kehilangan pos yang tak digeser', hasil[1].pergeseran === 1_000_000, String(hasil[1].pergeseran))
}

bab('C. Sinkronkan DPA — belum digeser ikut, sudah digeser dibiarkan')
{
  const lama = dpa().map(dpaKePergeseranInput)
    .map(r => r.row_id === 'r3' ? { ...r, harga_p: 499_000 } :
              r.row_id === 'r4' ? { ...r, harga_p: 301_000 } : r)

  // DPA direvisi: Air naik 200.000 → 250.000, akar & induk ikut naik.
  const dpaBaru = dpa().map(d =>
    d.row_id === 'r5' ? { ...d, harga: 250_000, jumlah: 250_000 } :
    d.row_id === 'r2' ? { ...d, jumlah: 1_050_000 } :
    d.row_id === 'r1' ? { ...d, jumlah: 1_050_000 } : d)

  const { rows } = injectDpaKePergeseran(lama, dpaBaru)
  const air = rows.find(r => r.row_id === 'r5')!
  const atk = rows.find(r => r.row_id === 'r3')!

  cek('Air (belum digeser) ikut DPA baru', air.harga_p === 250_000 && air.pergeseran === 250_000, String(air.harga_p))
  cek('ATK (sudah digeser) TIDAK tersentuh', atk.harga_p === 499_000, String(atk.harga_p))
  cek('Tetap berimbang setelah sinkron', hitungDeltaPergeseranRoot(rows) === 0, String(hitungDeltaPergeseranRoot(rows)))
}

bab('D. Baris DPA baru yang belum punya pasangan')
{
  const lama = dpa().map(dpaKePergeseranInput)
  const dpaBaru: DpaBaris[] = [
    ...dpa().map(d => d.row_id === 'r2' ? { ...d, jumlah: 1_400_000 }
                    : d.row_id === 'r1' ? { ...d, jumlah: 1_400_000 } : d),
    { ...dasar, id: 6, kode_rekening: '5.1.04', uraian: 'Internet', vol: 1, harga: 400_000, jumlah: 400_000,
      tipe_baris: 'CHILD', row_id: 'r6', parent_id: 'r2', urutan: 5 },
  ]

  const { rows } = injectDpaKePergeseran(lama, dpaBaru)
  const baru = rows.find(r => r.row_id === 'r6')!

  cek('Baris baru lahir sebagai salinan penuh', baru.harga_p === 400_000 && baru.pergeseran === 400_000, String(baru.pergeseran))
  cek('Baris baru tidak membuat tak berimbang', hitungDeltaPergeseranRoot(rows) === 0, String(hitungDeltaPergeseranRoot(rows)))
}

bab('E. Akar struktural — baris menggantung tidak boleh luput')
{
  // Baris MASTER tanpa induk: sah menurut validateTreeIntegrity (parent_id null
  // lolos), uangnya tampil & tersimpan. Bentuk begini bisa lahir dari impor DPA
  // yang tingkat tertingginya Level 2.
  const rows: PergeseranBarisInput[] = [
    ...dpa().map(dpaKePergeseranInput),
    { kode_rekening: '6', uraian: 'POS MENGGANTUNG', vol: 1, satuan: null, harga: 50_000, jumlah: 50_000,
      vol_p: 1, harga_p: 70_000, pergeseran: 70_000, bertambah_berkurang: 20_000,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: 'MASTER', row_id: 'rX', anggaran_key: null, parent_id: null, urutan: 5 },
  ]

  cek('Selisih baris menggantung ikut terhitung', delta(rows) === 20_000, String(delta(rows)))
  cek('Tidak dinyatakan berimbang secara palsu', delta(rows) !== 0)
}

bab('F. Induk yang hilang — anaknya naik jadi akar')
{
  // parent_id menunjuk baris yang tidak ada di daftar. `sortTreeDFS` sudah
  // memperlakukannya sebagai akar; hitungan delta wajib sepakat, kalau tidak
  // subtree-nya hilang dari penilaian berimbang tanpa gejala.
  const rows: PergeseranBarisInput[] = [
    { kode_rekening: '7', uraian: 'YATIM', vol: 1, satuan: null, harga: 10_000, jumlah: 10_000,
      vol_p: 1, harga_p: 15_000, pergeseran: 15_000, bertambah_berkurang: 5_000,
      penanggung_jawab: '', keterangan: '',
      tipe_baris: 'CHILD', row_id: 'rY', anggaran_key: null, parent_id: 'induk-tidak-ada', urutan: 0 },
  ]

  cek('Induk tak ada → dianggap akar', hitungDeltaPergeseranRoot(rows) === 5_000, String(hitungDeltaPergeseranRoot(rows)))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
