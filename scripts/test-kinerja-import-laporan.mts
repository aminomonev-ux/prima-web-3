// scripts/test-kinerja-import-laporan.mts
//
// Penjaga bentuk kedua Import Realisasi E-Anggaran ("laporan realisasi bulanan").
//
// Tiga hal yang dijaga:
//   1. berkas ini punya EMPAT kolom yang menyebut "fisik" dan TIGA yang menyebut
//      "keuangan". Yang dicari cuma angka bulan berjalan; salah pilih menghasilkan
//      angka yang benar bentuknya tapi salah artinya (akumulasi, bukan bulan ini).
//   2. berkas laporan BELANJA (jalur IK-4 lama) tidak boleh direbut oleh pengenal
//      bentuk baru — ia punya kolom "Realisasi Bulan Ini" yang memuat kata "bulan".
//   3. bulan dibaca per BARIS dari kolomnya, bukan dari nama berkas.
//
// Jalankan: npx tsx scripts/test-kinerja-import-laporan.mts

import fs from 'node:fs';
import ExcelJS from 'exceljs';
import {
  parseLaporanRealisasiBuffer, petaKolomLaporan, bulanKeDariTeks,
} from '../lib/data/kinerja-import-laporan';

let lulus = 0, gagal = 0;
const bab = (j: string) => console.log(`\n── ${j} ──`);
function ok(n: string, v?: unknown) { lulus++; console.log(`  ok   ${n.padEnd(56)} ${v ?? ''}`); }
function salah(n: string, harap: unknown, dapat: unknown) {
  gagal++;
  console.log(`  GAGAL ${n}\n        harap: ${JSON.stringify(harap)}\n        dapat: ${JSON.stringify(dapat)}`);
}
function cek(n: string, harap: unknown, dapat: unknown) {
  if (JSON.stringify(harap) === JSON.stringify(dapat)) ok(n, JSON.stringify(dapat));
  else salah(n, harap, dapat);
}

async function buat(sheet: string, header: string[], baris: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(header);
  for (const b of baris) ws.addRow(b);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

// Judul persis berkas sistem luar (15 kolom).
const H_LUAR = ['No', 'Bulan', 'Keterangan', 'Pagu Awal', 'Target Fisik (%)',
  'Realisasi Fisik (Anggaran)', 'Prosentase Fisik (%)', 'Akumulasi Target Fisik (%)',
  'Akumulasi Realisasi Fisik', 'Akumulasi Prosentase Fisik (%)', 'Realisasi Keuangan',
  'Akumulasi Keuangan', 'Akumulasi Prosentase Keuangan', 'Deviasi Fisik (%)', 'Deviasi Keuangan (%)'];

// Judul persis ekspor aplikasi (16 kolom — ada "% Real Keu").
const H_APP = ['No', 'Bulan', 'Keterangan', 'Pagu', 'Target Fisik', 'Real Fisik', '% Fisik',
  'Akum Target Fisik', 'Akum Real Fisik', 'Akum % Fisik', 'Real Keuangan', '% Real Keu',
  'Akum Keuangan', 'Akum % Keuangan', 'Deviasi Fisik %', 'Deviasi Keuangan %'];

// ── A. Berkas sistem luar ──────────────────────────────────────────────────
bab('A. Bentuk sistem luar (15 kolom)');
{
  // Angka akumulasi sengaja DIBEDAKAN dari angka bulan ini: kalau kolomnya
  // tertukar, yang muncul angka akumulasi dan tesnya langsung menyalak.
  const buf = await buat('REAL BLUD Januari', H_LUAR, [
    [1, 'Januari', 'Belanja Barang dan Jasa BLUD', 40_937_377_000, 0.056,
      2_300_000_000, 0.056, 0.056, 9_999_999_999, 0.056, 2_220_564_826,
      8_888_888_888, 0.054, 0, -0.0019],
  ]);
  const h = await parseLaporanRealisasiBuffer(buf);
  cek('jumlah baris', 1, h.rows.length);
  cek('bulan dari kolom Bulan', 1, h.rows[0].bulan_ke);
  cek('keterangan', 'Belanja Barang dan Jasa BLUD', h.rows[0].keterangan);
  cek('real_fisik = bulan ini, bukan akumulasi', 2_300_000_000, h.rows[0].real_fisik);
  cek('realisasi keuangan = bulan ini, bukan akumulasi', 2_220_564_826, h.rows[0].realisasi);
  cek('tanpa peringatan', [], h.warnings);
}

// ── B. Berkas ekspor aplikasi sendiri ──────────────────────────────────────
bab('B. Bentuk ekspor aplikasi (16 kolom, ada "% Real Keu")');
{
  const buf = await buat('Realisasi BLUD', H_APP, [
    [1, 'Februari', 'Belanja Pegawai BLUD', 5_056_846_000, 7.14, 361_203_300, 7.14,
      14.28, 9_999_999_999, 14.28, 294_635_000, 5.82, 8_888_888_888, 11.6, 0, -1.31],
  ]);
  const h = await parseLaporanRealisasiBuffer(buf);
  cek('jumlah baris', 1, h.rows.length);
  cek('bulan Februari', 2, h.rows[0].bulan_ke);
  cek('real_fisik dari "Real Fisik"', 361_203_300, h.rows[0].real_fisik);
  // "% Real Keu" berdiri tepat setelah "Real Keuangan"; kalau penyaring persentase
  // lepas, 5.82 yang terambil.
  cek('realisasi dari "Real Keuangan", bukan "% Real Keu"', 294_635_000, h.rows[0].realisasi);
}

// ── C. Berkas belanja lama tidak boleh direbut ─────────────────────────────
bab('C. Laporan belanja (jalur IK-4) tetap jatuh ke pembaca lama');
{
  // Bentuk khas laporan belanja: ada "Uraian" + "Kode Rekening" + "Realisasi
  // Bulan Ini". Kolom terakhir itu memuat kata "bulan" — pengenal yang longgar
  // akan memungutnya sebagai kolom Bulan.
  const buf = await buat('Belanja', ['Kode Rekening', 'Uraian', 'Anggaran', 'Realisasi Bulan Ini', 'Realisasi s/d Bulan Ini'], [
    ['5.1.02.01', 'Belanja Alat Tulis Kantor', 1_000_000, 250_000, 250_000],
  ]);
  const h = await parseLaporanRealisasiBuffer(buf);
  cek('tidak dikenali sebagai laporan realisasi', 0, h.rows.length);
}
{
  // Bahkan kalau berkas belanja kebetulan punya kolom "Keuangan", tanpa kolom
  // Bulan yang berdiri sendiri ia tetap bukan bentuk laporan.
  const buf = await buat('Belanja', ['Uraian', 'Realisasi Bulan Ini', 'Realisasi Keuangan'], [
    ['Belanja Alat Tulis Kantor', 250_000, 250_000],
  ]);
  cek('tanpa kolom Bulan tersendiri = bukan laporan', 0, (await parseLaporanRealisasiBuffer(buf)).rows.length);
}

// ── D. Peta kolom & bulan ──────────────────────────────────────────────────
bab('D. Peta kolom dan pembacaan bulan');
cek('kolom terpetakan dari judul sistem luar', { bulan: 1, keterangan: 2, fisik: 5, keuangan: 10 }, petaKolomLaporan(H_LUAR));
cek('kolom terpetakan dari judul ekspor app',  { bulan: 1, keterangan: 2, fisik: 5, keuangan: 10 }, petaKolomLaporan(H_APP));
cek('judul tanpa Keterangan ditolak', null, petaKolomLaporan(['No', 'Bulan', 'Realisasi Keuangan']));
cek('judul tanpa Keuangan ditolak',   null, petaKolomLaporan(['No', 'Bulan', 'Keterangan']));

// Ketiga pemeriksaan berikut menguji PENJAGANYA, bukan berkas contoh. Di berkas
// asli kolom bulan-ini kebetulan berdiri sebelum kolom akumulasi/persentase, jadi
// "yang pertama ketemu menang" sudah memberi jawaban benar walau penjaganya
// dilepas — urutan kolom di berkas orang lain tidak boleh jadi satu-satunya yang
// menyelamatkan.
cek('kolom akumulasi di depan tidak dipungut',
  { bulan: 0, keterangan: 1, fisik: 3, keuangan: 5 },
  petaKolomLaporan(['Bulan', 'Keterangan', 'Akumulasi Realisasi Fisik', 'Realisasi Fisik', 'Akumulasi Keuangan', 'Realisasi Keuangan']));
cek('kolom persentase di depan tidak dipungut',
  { bulan: 0, keterangan: 1, fisik: 3, keuangan: 5 },
  petaKolomLaporan(['Bulan', 'Keterangan', 'Prosentase Fisik', 'Realisasi Fisik', 'Prosentase Keuangan', 'Realisasi Keuangan']));
// Inti pemisah dua bentuk berkas: "Realisasi Bulan Ini" memuat kata "bulan" tapi
// BUKAN kolom Bulan. Kalau ini lolos, berkas belanja direbut dari jalur IK-4.
cek('"Realisasi Bulan Ini" bukan kolom Bulan',
  null, petaKolomLaporan(['Uraian', 'Realisasi Bulan Ini', 'Realisasi Keuangan']));
cek('nama bulan panjang', 12, bulanKeDariTeks('Desember'));
cek('nama bulan pendek', 8, bulanKeDariTeks('Agu'));
cek('angka bulan', 3, bulanKeDariTeks('3'));
cek('bukan bulan', 0, bulanKeDariTeks('Triwulan I'));

// ── E. Baris berbulan aneh dilaporkan, tidak hilang diam-diam ──────────────
bab('E. Baris yang bulannya tak terbaca');
{
  const buf = await buat('REAL BLUD', H_LUAR, [
    [1, 'Januari',    'Belanja A', 100, 0, 10, 0, 0, 0, 0, 5, 0, 0, 0, 0],
    [2, 'Triwulan I', 'Belanja B', 100, 0, 10, 0, 0, 0, 0, 5, 0, 0, 0, 0],
  ]);
  const h = await parseLaporanRealisasiBuffer(buf);
  cek('baris berbulan aneh dilewati', 1, h.rows.length);
  cek('dan dilaporkan', true, h.warnings.some(w => /Bulan tidak terbaca/.test(w)));
}
{
  // Satu berkas berisi beberapa bulan: tiap baris membawa bulannya sendiri.
  const buf = await buat('REAL BLUD', H_LUAR, [
    [1, 'Januari',  'Belanja A', 100, 0, 10, 0, 0, 0, 0, 5, 0, 0, 0, 0],
    [2, 'Februari', 'Belanja A', 100, 0, 20, 0, 0, 0, 0, 7, 0, 0, 0, 0],
  ]);
  const h = await parseLaporanRealisasiBuffer(buf);
  cek('dua bulan dalam satu berkas', [1, 2], h.rows.map(r => r.bulan_ke));
  cek('angka per bulan tidak tertukar', [10, 20], h.rows.map(r => r.real_fisik));
}

// ── F. Berkas asli pemakai ─────────────────────────────────────────────────
bab('F. Berkas REALISASI asli di folder Downloads');
{
  const path = 'C:/Users/HP VICTUS/Downloads/REALISASI_BLUD_JANUARI_2026-09-02.xlsx';
  if (!fs.existsSync(path)) {
    console.log('  --   berkas asli tidak ada di mesin ini, bagian F dilewati');
  } else {
    const h = await parseLaporanRealisasiBuffer(fs.readFileSync(path));
    cek('jumlah baris', 5, h.rows.length);
    cek('semua baris bulan Januari', true, h.rows.every(r => r.bulan_ke === 1));
    cek('baris 1 keterangan', 'Belanja Barang dan Jasa BLUD', h.rows[0].keterangan);
    cek('baris 1 real_fisik', 2_300_000_000, h.rows[0].real_fisik);
    cek('baris 1 real_keuangan', 2_220_564_826, h.rows[0].realisasi);
    cek('total realisasi keuangan', 2_838_185_625, h.rows.reduce((s, r) => s + r.realisasi, 0));
    cek('baris berangka nol tetap ikut', 2, h.rows.filter(r => r.realisasi === 0).length);
  }
}

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? `, ${gagal} GAGAL` : ''}`);
if (gagal) process.exit(1);
