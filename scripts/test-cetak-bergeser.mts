// scripts/test-cetak-bergeser.mts
// Penjaga regresi saringan Cetak "Hanya yang bergeser" (menu Cetak → Rekap
// Pergeseran).
//
// Yang dijaga tiga hal yang gampang dibatalkan tanpa tsc protes:
//
//   1. Induk ber-selisih NOL tetap ikut tercetak selama anaknya bergeser.
//      Ini kasus yang paling sering terjadi — geser antar-pos di bawah induk
//      yang sama membuat selisih induknya saling meniadakan. Saringan naif
//      `bb !== 0` membuangnya dan menyisakan daun yatim.
//   2. Angka baris induk TETAP pagu penuh, tidak dihitung ulang dari anak yang
//      lolos saring. Itu angka yang menyambung ke DPA.
//   3. Spanduk DRAFT dihitung dari daftar PENUH. Diberi hasil saringan, ia bisa
//      hilang justru pada dokumen yang belum berimbang.
//
// Murni di memori, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-cetak-bergeser.mts

import { saringYangBergeser, renderCetakHtml } from '../lib/blud/cetak-data'
import type { PergeseranBaris } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

const dasar = {
  id: 0, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01',
  satuan: 'Paket' as string | null, penanggung_jawab: null, keterangan: null, anggaran_key: null,
  bertambah: null as number | null, berkurang: null as number | null,
}

/**
 * Akar → Operasi → { ATK, Listrik }  dan  Akar → Modal → { Alat }.
 * ATK −1jt, Listrik +1jt (berimbang di bawah Operasi). Cabang Modal diam.
 */
function contoh(): PergeseranBaris[] {
  return [
    { ...dasar, id: 1, kode_rekening: '5', uraian: 'BELANJA DAERAH',
      vol: null, harga: null, jumlah: 10_000_000, vol_p: null, harga_p: null,
      pergeseran: 10_000_000, bertambah_berkurang: 0,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0 },
    { ...dasar, id: 2, kode_rekening: '5.1', uraian: 'BELANJA OPERASI',
      vol: null, harga: null, jumlah: 6_000_000, vol_p: null, harga_p: null,
      pergeseran: 6_000_000, bertambah_berkurang: 0,
      tipe_baris: 'MASTER', row_id: 'r2', parent_id: 'r1', urutan: 1 },
    { ...dasar, id: 3, kode_rekening: '5.1.01', uraian: 'ATK',
      vol: 1, harga: 4_000_000, jumlah: 4_000_000, vol_p: 1, harga_p: 3_000_000,
      pergeseran: 3_000_000, bertambah_berkurang: -1_000_000,
      tipe_baris: 'CHILD', row_id: 'r3', parent_id: 'r2', urutan: 2 },
    { ...dasar, id: 4, kode_rekening: '5.1.02', uraian: 'Listrik',
      vol: 1, harga: 2_000_000, jumlah: 2_000_000, vol_p: 1, harga_p: 3_000_000,
      pergeseran: 3_000_000, bertambah_berkurang: 1_000_000,
      tipe_baris: 'CHILD', row_id: 'r4', parent_id: 'r2', urutan: 3 },
    { ...dasar, id: 5, kode_rekening: '5.2', uraian: 'BELANJA MODAL',
      vol: null, harga: null, jumlah: 4_000_000, vol_p: null, harga_p: null,
      pergeseran: 4_000_000, bertambah_berkurang: 0,
      tipe_baris: 'MASTER', row_id: 'r5', parent_id: 'r1', urutan: 4 },
    { ...dasar, id: 6, kode_rekening: '5.2.01', uraian: 'Alat Kesehatan',
      vol: 1, harga: 4_000_000, jumlah: 4_000_000, vol_p: 1, harga_p: 4_000_000,
      pergeseran: 4_000_000, bertambah_berkurang: 0,
      tipe_baris: 'CHILD', row_id: 'r6', parent_id: 'r5', urutan: 5 },
  ]
}

const cetak = (rows: PergeseranBaris[], hanyaBergeser: boolean) =>
  renderCetakHtml({ menu: 'pergeseran', view: 'rekapPergeseran', rows, versi: '2026-02-01', tanggal: '', hanyaBergeser })

bab('A. Geser berimbang di bawah satu induk — induknya WAJIB ikut')
{
  const hasil = saringYangBergeser(contoh())
  const ids = hasil.map(r => r.row_id)

  cek('Kedua daun yang bergeser ikut', ids.includes('r3') && ids.includes('r4'))
  cek('Induk ber-selisih NOL tetap ikut', ids.includes('r2'), 'r2 selisihnya 0 karena +1jt & −1jt')
  cek('Akar ikut', ids.includes('r1'))
  cek('Cabang yang diam dibuang', !ids.includes('r5') && !ids.includes('r6'))
  cek('4 dari 6 baris', hasil.length === 4, `→ ${ids.join(',')}`)
  cek('Urutan asli terjaga', ids.join(',') === 'r1,r2,r3,r4')
}

bab('B. Angka baris induk tetap pagu penuh')
{
  const hasil = saringYangBergeser(contoh())
  const akar = hasil.find(r => r.row_id === 'r1')
  const operasi = hasil.find(r => r.row_id === 'r2')

  // Diperiksa lebih dulu supaya hilangnya baris induk dilaporkan sebagai GAGAL,
  // bukan sebagai kecelakaan `undefined.jumlah` yang menghentikan skripnya.
  cek('Baris induk ada untuk diperiksa', !!akar && !!operasi)
  if (akar && operasi) {
    // Kalau kelak ada yang "merapikan" dengan menghitung ulang induk dari anak
    // yang lolos saring, akar jadi 6jt (cuma Operasi) dan dokumennya berbohong.
    cek('Akar tetap 10jt, bukan 6jt', akar.jumlah === 10_000_000, String(akar.jumlah))
    cek('Operasi tetap 6jt', operasi.jumlah === 6_000_000, String(operasi.jumlah))
    cek('Pergeseran induk juga penuh', akar.pergeseran === 10_000_000, String(akar.pergeseran))
  }
}

bab('B2. Induk dengan selisih basi tidak boleh berdiri sendiri')
{
  // Data TIDAK konsisten: induk Modal mengaku bergeser 500rb, anaknya tidak.
  // Tanpa penjaga "hanya daun yang dinilai", induk ini masuk sendirian —
  // kepala tabel tanpa satu pun baris rincian di bawahnya.
  const basi = contoh().map(r =>
    r.row_id === 'r5' ? { ...r, bertambah_berkurang: -500_000 } : r)
  const ids = saringYangBergeser(basi).map(r => r.row_id)

  cek('Induk berselisih basi tidak ikut', !ids.includes('r5'), `→ ${ids.join(',')}`)
  cek('Anaknya yang diam juga tidak ikut', !ids.includes('r6'))
}

bab('C. Render — spanduk, judul, dan ekspor ikut tersaring')
{
  const penuh = cetak(contoh(), false)
  const saring = cetak(contoh(), true)

  cek('Mati: 6 baris ekspor', penuh.rows.length === 6, String(penuh.rows.length))
  cek('Hidup: 4 baris ekspor', saring.rows.length === 4, String(saring.rows.length))
  cek('Ekspor ikut tersaring, bukan cuma HTML', saring.rows.length !== penuh.rows.length)
  cek('Spanduk "sebagian" muncul', saring.html.includes('Hanya baris yang bergeser') && saring.html.includes('4 dari 6 baris'))
  cek('Spanduk menyebut angka induk tetap penuh', saring.html.includes('pagu penuh'))
  cek('Mati: tanpa spanduk sebagian', !penuh.html.includes('Hanya baris yang bergeser'))
  cek('Judul menandai cakupan', saring.meta.title.includes('Yang Bergeser') && !penuh.meta.title.includes('Yang Bergeser'))
  cek('Cabang yang diam tidak tercetak', !saring.html.includes('Alat Kesehatan') && penuh.html.includes('Alat Kesehatan'))
}

bab('D. Spanduk DRAFT dihitung dari daftar PENUH')
{
  // Akar tekor 500rb gara-gara cabang Modal — cabang yang justru TERSARING
  // KELUAR. Kalau delta dihitung sesudah saring, tanda DRAFT-nya lenyap tepat
  // pada dokumen yang paling butuh ditandai.
  const tekor = contoh().map(r =>
    r.row_id === 'r1' ? { ...r, pergeseran: 9_500_000, bertambah_berkurang: -500_000 } :
    r.row_id === 'r5' ? { ...r, pergeseran: 3_500_000, bertambah_berkurang: -500_000 } :
    r.row_id === 'r6' ? { ...r, harga_p: 3_500_000, pergeseran: 3_500_000, bertambah_berkurang: -500_000 } : r)

  const saring = cetak(tekor, true)
  cek('Spanduk DRAFT tetap muncul', saring.html.includes('DRAFT — belum berimbang'))
  cek('Nominal tekornya benar', saring.html.includes('500.000'))
  cek('Judul bertanda (DRAFT)', saring.meta.title.includes('(DRAFT)'))
}

bab('E. Tidak ada yang bergeser — jangan cetak tabel kosong')
{
  const diam = contoh().map(r => ({ ...r, bertambah_berkurang: 0 }))
  const saring = cetak(diam, true)

  cek('Kalimat penjelas, bukan tabel hampa', saring.html.includes('Belum ada baris yang bergeser'))
  cek('Tidak ada tabel sama sekali', !saring.html.includes('<table>'))
  cek('Ekspor kosong', saring.rows.length === 0)
}

bab('F. Rantai induk melingkar tidak menggantung layar')
{
  // Ditolak saat SIMPAN oleh validateTreeIntegrity, tapi saringan ini jalan di
  // jalur BACA — data lama yang terlanjur melingkar tidak boleh bikin hang.
  //
  // Siklusnya sengaja dipasang DI ATAS daun yang bergeser (c → a → b → a → …),
  // sebab di situlah penelusuran leluhur berputar dan pagar kedalaman bekerja.
  // Siklus yang tidak memuat daun sama sekali berhenti lebih awal — tiap
  // simpulnya punya anak, jadi tidak ada yang masuk daftar untuk ditelusuri.
  const lingkar: PergeseranBaris[] = [
    { ...dasar, id: 1, kode_rekening: 'A', uraian: 'A', vol: null, harga: null, jumlah: 1,
      vol_p: null, harga_p: null, pergeseran: 1, bertambah_berkurang: 0,
      tipe_baris: 'MASTER', row_id: 'a', parent_id: 'b', urutan: 0 },
    { ...dasar, id: 2, kode_rekening: 'B', uraian: 'B', vol: null, harga: null, jumlah: 1,
      vol_p: null, harga_p: null, pergeseran: 1, bertambah_berkurang: 0,
      tipe_baris: 'MASTER', row_id: 'b', parent_id: 'a', urutan: 1 },
    { ...dasar, id: 3, kode_rekening: 'C', uraian: 'C', vol: 1, harga: 1, jumlah: 1,
      vol_p: 1, harga_p: 2, pergeseran: 2, bertambah_berkurang: 1,
      tipe_baris: 'CHILD', row_id: 'c', parent_id: 'a', urutan: 2 },
  ]
  const mulai = Date.now()
  const hasil = saringYangBergeser(lingkar)
  const lama = Date.now() - mulai
  cek('Selesai tanpa menggantung', lama < 1000, `${lama}ms`)
  cek('Daun yang bergeser tetap terbawa', hasil.some(r => r.row_id === 'c'), hasil.map(r => r.row_id).join(','))
}

console.log(`\n${lulus} pemeriksaan LULUS · ${gagal} GAGAL`)
process.exit(gagal > 0 ? 1 : 0)
