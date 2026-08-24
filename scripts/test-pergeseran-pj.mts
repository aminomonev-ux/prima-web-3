// scripts/test-pergeseran-pj.mts
// Penjaga regresi kolom `penanggung_jawab` / `keterangan` di Pergeseran
// (migration-pergeseran-pj). Yang dijaga BUKAN "kolomnya ada", tapi rantai
// pemetaannya utuh — persis mata rantai yang pernah putus diam-diam di Renaksi:
// SELECT → row-map → inject → payload. Satu simpul lepas = kolomnya hilang tanpa
// tsc protes, karena tipenya opsional.
//
// Murni di memori, tidak menyentuh basis data.
//
// Jalankan: npx tsx scripts/test-pergeseran-pj.mts

import { injectDpaKePergeseran } from '../lib/blud/recalc'
import { pergeseranKeInput, dpaKePergeseranInput } from '../lib/blud/row-map'
import { auditRekapPJ } from '../lib/blud/audit-pj'
import { renderCetakHtml } from '../lib/blud/cetak-data'
import type { DpaBaris, PergeseranBaris, PergeseranBarisInput } from '../types'

let lulus = 0
let gagal = 0
function cek(nama: string, syarat: boolean, catatan = '') {
  if (syarat) { lulus++; console.log(`  ok   ${nama.padEnd(58)} ${catatan}`) }
  else        { gagal++; console.log(`  GAGAL ${nama.padEnd(58)} ${catatan}`) }
}
function bab(judul: string) { console.log(`\n── ${judul} ──`) }

// ── Contoh: 1 akar + 2 daun, PJ terisi di daun ────────────────────────────────
function dpa(): DpaBaris[] {
  const dasar = {
    id: 0, versi_tanggal: '2026-01-01', is_latest: 1, satuan: null,
    anggaran_key: null, origin: 'MANUAL' as const, usulan_item_id: null, usulan_no: null,
  }
  return [
    { ...dasar, id: 1, kode_rekening: '5', uraian: 'BELANJA', vol: null, harga: null, jumlah: 300,
      penanggung_jawab: null, keterangan: null,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', parent_id: null, urutan: 0 },
    { ...dasar, id: 2, kode_rekening: '5.1', uraian: 'Operasi', vol: null, harga: null, jumlah: 300,
      penanggung_jawab: null, keterangan: null,
      tipe_baris: 'MASTER', row_id: 'r2', parent_id: 'r1', urutan: 1 },
    { ...dasar, id: 3, kode_rekening: '5.1.01', uraian: 'ATK', vol: 10, harga: 10, jumlah: 100,
      penanggung_jawab: 'Kasubbag Umum', keterangan: 'rutin',
      tipe_baris: 'CHILD', row_id: 'r3', parent_id: 'r2', urutan: 2 },
    { ...dasar, id: 4, kode_rekening: '5.1.02', uraian: 'Listrik', vol: 20, harga: 10, jumlah: 200,
      penanggung_jawab: 'Kasubbag Keuangan', keterangan: null,
      tipe_baris: 'CHILD', row_id: 'r4', parent_id: 'r2', urutan: 3 },
  ]
}

bab('A. Generate — DPA → Pergeseran membawa PJ')
{
  const hasil = dpa().map(dpaKePergeseranInput)
  cek('PJ daun ikut tersalin', hasil[2].penanggung_jawab === 'Kasubbag Umum', hasil[2].penanggung_jawab ?? '(kosong)')
  cek('Keterangan ikut tersalin', hasil[2].keterangan === 'rutin')
  cek('NULL jadi string kosong (terikat <input>)', hasil[0].penanggung_jawab === '' && hasil[0].keterangan === '')
  cek('Kolom P tetap kosong', hasil[2].vol_p === null && hasil[2].pergeseran === 0)
}

bab('B. Baca ulang — server → klien (pergeseranKeInput)')
{
  const dariDb = {
    id: 9, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01', is_latest: 1,
    kode_rekening: '5.1.01', uraian: 'ATK', vol: 10, satuan: null, harga: 10, jumlah: 100,
    vol_p: 12, harga_p: 10, pergeseran: 120, bertambah_berkurang: 20,
    penanggung_jawab: 'Kasubbag Umum', keterangan: 'rutin',
    tipe_baris: 'CHILD', row_id: 'r3', anggaran_key: 'ak3', parent_id: 'r2', urutan: 2,
  } satisfies PergeseranBaris
  const klien = pergeseranKeInput(dariDb)
  cek('PJ selamat sampai state klien', klien.penanggung_jawab === 'Kasubbag Umum')
  cek('Keterangan selamat sampai state klien', klien.keterangan === 'rutin')
  const kosong = pergeseranKeInput({ ...dariDb, penanggung_jawab: null, keterangan: null })
  cek('NULL dari DB jadi string kosong', kosong.penanggung_jawab === '' && kosong.keterangan === '')
}

bab('C. Inject — PJ ditimpa DPA, sederajat dgn uraian')
{
  // Baris pergeseran lama membawa PJ USANG; DPA sudah diperbaiki.
  const lama: PergeseranBarisInput[] = dpa().map(dpaKePergeseranInput).map(r =>
    r.row_id === 'r3' ? { ...r, penanggung_jawab: 'PJ LAMA', keterangan: 'catatan lama', vol_p: 12, harga_p: 10, pergeseran: 120 } : r)
  const { rows } = injectDpaKePergeseran(lama, dpa())
  const r3 = rows.find(r => r.row_id === 'r3')!
  cek('PJ usang ditimpa dari DPA', r3.penanggung_jawab === 'Kasubbag Umum', `dapat "${r3.penanggung_jawab}"`)
  cek('Keterangan usang ditimpa dari DPA', r3.keterangan === 'rutin')
  cek('vol_p/harga_p TIDAK ikut ditimpa', r3.vol_p === 12 && r3.harga_p === 10)
}

bab('D. Inject — baris DPA tanpa pasangan tetap bawa PJ-nya')
{
  // Pergeseran cuma punya akar; tiga baris DPA sisanya lahir di cabang `else`.
  const cumaAkar = [dpaKePergeseranInput(dpa()[0], 0)]
  const { rows } = injectDpaKePergeseran(cumaAkar, dpa())
  const r4 = rows.find(r => r.kode_rekening === '5.1.02')!
  cek('Baris baru dari DPA membawa PJ', r4.penanggung_jawab === 'Kasubbag Keuangan', `dapat "${r4.penanggung_jawab}"`)
  cek('PJ kosong di DPA jadi string kosong', rows.find(r => r.kode_rekening === '5.1')!.penanggung_jawab === '')
}

bab('E. Inject — baris yang lahir di Pergeseran mempertahankan PJ sendiri')
{
  const manual: PergeseranBarisInput = {
    kode_rekening: '5.1.99', uraian: 'Pos baru hasil geser',
    vol: null, satuan: null, harga: null, jumlah: 0,
    vol_p: 1, harga_p: 50, pergeseran: 50, bertambah_berkurang: 50,
    penanggung_jawab: 'Kasi Penunjang', keterangan: 'lahir di pergeseran',
    tipe_baris: 'CHILD', row_id: 'pgnew_x', parent_id: 'r2', urutan: 4,
  }
  const { rows } = injectDpaKePergeseran([...dpa().map(dpaKePergeseranInput), manual], dpa())
  const baru = rows.find(r => r.row_id === 'pgnew_x')
  cek('Baris pgnew_* tidak hilang saat inject', !!baru)
  cek('PJ isian sendiri TIDAK ditimpa', baru?.penanggung_jawab === 'Kasi Penunjang', `dapat "${baru?.penanggung_jawab}"`)
}

bab('F. Cetak — Rekap PJ Pergeseran memakai pagu PASCA-geser')
{
  // ATK digeser 100 → 120, Listrik 200 → 180. Total tetap 300 (berimbang).
  const rows: PergeseranBaris[] = [
    { id: 1, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01', is_latest: 1,
      kode_rekening: '5', uraian: 'BELANJA', vol: null, satuan: null, harga: null, jumlah: 300,
      vol_p: null, harga_p: null, pergeseran: 300, bertambah_berkurang: 0,
      penanggung_jawab: null, keterangan: null,
      tipe_baris: 'GRANDMASTER', row_id: 'r1', anggaran_key: null, parent_id: null, urutan: 0 },
    { id: 2, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01', is_latest: 1,
      kode_rekening: '5.1.01', uraian: 'ATK', vol: 10, satuan: null, harga: 10, jumlah: 100,
      vol_p: 12, harga_p: 10, pergeseran: 120, bertambah_berkurang: 20,
      penanggung_jawab: 'Kasubbag Umum', keterangan: 'rutin',
      tipe_baris: 'CHILD', row_id: 'r3', anggaran_key: null, parent_id: 'r1', urutan: 1 },
    { id: 3, versi_tanggal: '2026-02-01', dpa_versi_tanggal: '2026-01-01', is_latest: 1,
      kode_rekening: '5.1.02', uraian: 'Listrik', vol: 20, satuan: null, harga: 10, jumlah: 200,
      vol_p: 18, harga_p: 10, pergeseran: 180, bertambah_berkurang: -20,
      penanggung_jawab: 'Kasubbag Keuangan', keterangan: null,
      tipe_baris: 'CHILD', row_id: 'r4', anggaran_key: null, parent_id: 'r1', urutan: 2 },
  ]

  const pj = renderCetakHtml({ menu: 'pergeseran', view: 'penanggungJawab', rows, versi: '2026-02-01', tanggal: '' })
  const nilai = pj.rows.filter(r => r[0] === 'Kasubbag Umum' && r[1] === '').map(r => r[2])
  cek('Subtotal PJ pakai `pergeseran`, bukan `jumlah`', nilai.every(v => v === 120), `dapat ${nilai.join('/')}`)
  cek('Grand total = pagu akar pasca-geser', pj.rows[0][2] === 300, `dapat ${pj.rows[0][2]}`)
  cek('Judulnya menyebut Pergeseran', pj.meta.title.includes('Pergeseran'), pj.meta.title)
  cek('Panel audit tidak lagi menyebut "DPA BLUD"', !pj.html.includes('Total DPA BLUD'))

  // Pembanding: view DPA harus TETAP memakai `jumlah`.
  const dpaPj = renderCetakHtml({ menu: 'dpa', view: 'penanggungJawab', rows: dpa(), versi: '2026-01-01', tanggal: '' })
  const nilaiDpa = dpaPj.rows.filter(r => r[0] === 'Kasubbag Umum' && r[1] === '').map(r => r[2])
  cek('View DPA tidak ikut berubah', nilaiDpa.every(v => v === 100), `dapat ${nilaiDpa.join('/')}`)

  const tabel = renderCetakHtml({ menu: 'pergeseran', view: 'rekapPergeseran', rows, versi: '2026-02-01', tanggal: '' })
  cek('Tabel Pergeseran punya 12 kolom', tabel.meta.columns.length === 12, tabel.meta.columns.slice(-2).join(' + '))
  cek('PJ ikut di baris ekspor', tabel.rows[1][10] === 'Kasubbag Umum', String(tabel.rows[1][10]))
  cek('Keterangan ikut di baris ekspor', tabel.rows[1][11] === 'rutin')
}

bab('G. auditRekapPJ menerima baris Pergeseran (tipe struktural)')
{
  const hasil = auditRekapPJ([
    { row_id: 'r1', parent_id: null, uraian: 'BELANJA', kode_rekening: '5',
      penanggung_jawab: null, jumlah: 300, tipe_baris: 'GRANDMASTER' },
    { row_id: 'r3', parent_id: 'r1', uraian: 'ATK', kode_rekening: '5.1.01',
      penanggung_jawab: 'Kasubbag Umum', jumlah: 120, tipe_baris: 'CHILD' },
  ])
  cek('totalDPA dari akar', hasil.totalDPA === 300, String(hasil.totalDPA))
  cek('grandTotal dari baris ber-PJ', hasil.grandTotal === 120, String(hasil.grandTotal))
  cek('Selisih terbaca kurang', hasil.statusSaldo === 'kurang')
}

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? ` · ${gagal} GAGAL` : ''}`)
process.exit(gagal ? 1 : 0)
