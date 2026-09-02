// scripts/test-kinerja-import-rko.mts
//
// Penjaga Import RKO (tab SSK) E-Anggaran.
//
// Tiga hal yang dijaga:
//   1. judul bulan berkas luar berbunyi "Januari - Target Fisik" DAN
//      "Januari - Persentase" — dua-duanya menyebut bulannya. Salah pilih, Januari
//      terisi 0,0562 alih-alih 2,3 miliar, dan tidak ada galat apa pun.
//   2. persentase/total TIDAK pernah dibaca dari berkas — dihitung ulang dari pagu
//      + nilai bulanan, sama persis dengan yang dilakukan sel yang diketik tangan.
//   3. baris yang tidak punya pasangan di tabel Rekening DITAHAN, bukan diam-diam
//      masuk tanpa Uraian SSK (yang memutus kaitannya ke Rekening & Realisasi).
//
// Berkas ujinya dibangun di sini, jadi tes jalan di mana saja. Kalau ketiga berkas
// asli ada di folder Downloads, bagian F ikut mengujinya.
//
// Jalankan: npx tsx scripts/test-kinerja-import-rko.mts

import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { parseRkoImport, sumberRkoDariNama, angkaRko } from '../lib/data/kinerja-import-rko';
import {
  bandingkanRko, ringkasRko, terapkanTambahRko, terapkanTimpaRko,
  hilangKalauTimpa, hitungTurunanRko,
} from '../lib/kinerja/gabung-rko';
import type { SskRow, SskMonths, RekeningRow } from '../app/(dashboard)/kinerja/_types';

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
function benar(n: string, syarat: boolean, catatan = '') {
  if (syarat) ok(n, catatan); else salah(n, true, false);
}

const BULAN_PANJANG = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const BULAN_PENDEK  = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/** Berkas bergaya sistem luar: persentase sebagai PECAHAN, tanpa kolom Uraian SSK. */
async function berkasLuar(sheet: string, baris: { uraian: string; pagu: number; bulan: number[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(['No', 'Uraian', 'Pagu Awal',
    ...BULAN_PANJANG.flatMap(b => [`${b} - Target Fisik`, `${b} - Persentase`]),
    'Total', 'Persentase Total']);
  baris.forEach((b, i) => {
    const tot = b.bulan.reduce((a, x) => a + x, 0);
    ws.addRow([i + 1, b.uraian, b.pagu,
      ...b.bulan.flatMap(v => [v, b.pagu ? v / b.pagu : 0]),
      tot, b.pagu ? tot / b.pagu : 0]);
  });
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

/** Berkas bergaya ekspor aplikasi: ada kolom Uraian SSK, persentase 0..100. */
async function berkasApp(sheet: string, baris: { ssk: string; uraian: string; pagu: number; bulan: number[] }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(['No', 'Uraian SSK', 'Uraian', 'Pagu (Rp)',
    ...BULAN_PENDEK.flatMap(b => [`Target ${b}`, `% ${b}`]),
    'Total (Rp)', 'Total %']);
  baris.forEach((b, i) => {
    const tot = b.bulan.reduce((a, x) => a + x, 0);
    ws.addRow([i + 1, b.ssk, b.uraian, b.pagu,
      ...b.bulan.flatMap(v => [v, b.pagu ? (v / b.pagu) * 100 : 0]),
      tot, b.pagu ? (tot / b.pagu) * 100 : 0]);
  });
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

const bln = (v: Partial<SskMonths>): SskMonths =>
  ({ jan: 0, feb: 0, mar: 0, apr: 0, mei: 0, jun: 0, jul: 0, agu: 0, sep: 0, okt: 0, nov: 0, des: 0, ...v });

const rek = (uraian: string, ssk = 'SSK-1'): RekeningRow => ({
  id: 0, uraian, uraian_ssk: ssk, sumber_anggaran: 'APBD',
  program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB',
});

// ── A. Berkas sistem luar ──────────────────────────────────────────────────
bab('A. Berkas gaya sistem luar (persentase pecahan)');
{
  const buf = await berkasLuar('RKO BLUD', [
    { uraian: 'Belanja Barang dan Jasa BLUD', pagu: 1_000_000, bulan: [100_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 900_000] },
  ]);
  const h = await parseRkoImport(buf);
  cek('jumlah baris', 1, h.rows.length);
  cek('sumber dari nama sheet', 'BLUD', h.sumberSheet);
  cek('pagu terbaca', 1_000_000, h.rows[0].pagu);
  // Inti jebakannya: yang diambil kolom NILAI, bukan kolom persentase di sebelahnya.
  cek('Januari = nilai, bukan pecahan persentase', 100_000, h.rows[0].months.jan);
  cek('Desember terbaca', 900_000, h.rows[0].months.des);
  cek('bulan tanpa isi = 0', 0, h.rows[0].months.jun);
  cek('tanpa peringatan', [], h.warnings);
}

{
  // Varian yang menaruh kolom persentase LEBIH DULU. Tanpa penyaring kolom
  // turunan, "Persentase Januari" yang dijumpai duluan akan dipungut sebagai
  // kolom Januari — dan seluruh nilai bulanan jadi pecahan 0..1. Urutan kolom di
  // berkas tidak boleh jadi satu-satunya yang menyelamatkan.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RKO GAJI');
  ws.addRow(['No', 'Uraian', 'Pagu Awal',
    ...BULAN_PANJANG.flatMap(b => [`Persentase ${b}`, `Target ${b}`]),
    'Persentase Total', 'Total']);
  ws.addRow([1, 'Belanja X', 1000, ...Array.from({ length: 12 }, (_, i) => i === 0 ? [0.4, 400] : [0, 0]).flat(), 0.4, 400]);
  const out = await wb.xlsx.writeBuffer();
  const h = await parseRkoImport(Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer));
  cek('kolom persentase di depan tidak dipungut', 400, h.rows[0].months.jan);
  cek('kolom Total tidak dipungut jadi bulan', 1000, h.rows[0].pagu);
}
{
  // Kolom rekapitulasi yang namanya menyerempet kolom asli: "Total Belanja"
  // memuat kata "belanja" dan berada SEBELUM kolom Uraian. Tanpa penyaring
  // kolom turunan, nama baris terbaca dari kolom rekap itu.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RKO GAJI');
  ws.addRow(['No', 'Total Belanja', 'Uraian', 'Pagu Awal',
    ...BULAN_PANJANG.flatMap(b => [`${b} - Target Fisik`, `${b} - Persentase`])]);
  ws.addRow([1, 'REKAP-JANGAN-DIPAKAI', 'Belanja X', 1000,
    ...Array.from({ length: 12 }, (_, i) => i === 0 ? [400, 0.4] : [0, 0]).flat()]);
  const out = await wb.xlsx.writeBuffer();
  const h = await parseRkoImport(Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer));
  cek('nama baris tidak diambil dari kolom rekap', 'Belanja X', h.rows[0].uraian);
}

// ── B. Berkas ekspor aplikasi sendiri ──────────────────────────────────────
bab('B. Berkas gaya ekspor aplikasi (ada kolom Uraian SSK)');
{
  const buf = await berkasApp('SSK GAJI', [
    { ssk: 'Penyediaan Gaji', uraian: 'Belanja Gaji Pokok PNS', pagu: 500, bulan: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 400] },
  ]);
  const h = await parseRkoImport(buf);
  cek('jumlah baris', 1, h.rows.length);
  // "Uraian SSK" tidak boleh dipungut jadi kolom nama baris — di berkas ini ada dua
  // kolom yang sama-sama memuat kata "uraian".
  cek('nama baris dari kolom Uraian, bukan Uraian SSK', 'Belanja Gaji Pokok PNS', h.rows[0].uraian);
  cek('Januari = nilai, bukan persen 20', 100, h.rows[0].months.jan);
  cek('pagu terbaca', 500, h.rows[0].pagu);
}

// ── C. Turunan selalu dihitung ulang ───────────────────────────────────────
bab('C. Persentase & total dihitung ulang, tidak dibaca dari berkas');
{
  const months = bln({ jan: 250, des: 250 });
  const d = hitungTurunanRko(1000, months);
  cek('total = jumlah 12 bulan', 500, d.total);
  cek('persentase bulan (0..100)', 25, d.months_pct.jan);
  cek('persentase total', 50, d.total_pct);
  cek('bulan kosong = 0%', 0, d.months_pct.jun);
  const nol = hitungTurunanRko(0, bln({ jan: 10 }));
  cek('pagu 0 tidak melahirkan Infinity', { pct: 0, total: 10, tpct: 0 },
    { pct: nol.months_pct.jan, total: nol.total, tpct: nol.total_pct });
}

// ── D. Pencocokan ke RKO lama & tabel Rekening ─────────────────────────────
bab('D. Pencocokan: baru / sama / berubah / kembar / ditahan');
const sskLama: SskRow[] = [{
  uraian_ssk: 'SSK-1', uraian: 'Belanja A', program: 'PROG', kegiatan: 'KEG', subkegiatan: 'SUB',
  pagu: 1000, months: bln({ jan: 1000 }), ...hitungTurunanRko(1000, bln({ jan: 1000 })),
}];
const rekening = [rek('Belanja A'), rek('Belanja B', 'SSK-2')];
{
  const berkas = [
    { uraian: 'Belanja A', pagu: 1000, months: bln({ jan: 1000 }) },   // sama persis
    { uraian: 'Belanja B', pagu: 2000, months: bln({ feb: 2000 }) },   // baru, ada di Rekening
    { uraian: 'Belanja C', pagu: 3000, months: bln({ mar: 3000 }) },   // tidak ada di mana pun
    { uraian: 'Belanja B', pagu: 2000, months: bln({ feb: 2000 }) },   // kembar di berkas
  ];
  const h = bandingkanRko(sskLama, rekening, berkas);
  cek('status per baris', ['sama', 'baru', 'ditahan', 'kembar'], h.map(x => x.status));
  cek('ringkasan', { baru: 1, sama: 1, berubah: 0, kembar: 1, ditahan: 1 }, ringkasRko(h));
  cek('baris baru mewarisi Uraian SSK dari Rekening', 'SSK-2', h[1].hasil?.uraian_ssk);
  cek('hierarki ikut terbawa', ['PROG', 'KEG', 'SUB'],
    [h[1].hasil?.program, h[1].hasil?.kegiatan, h[1].hasil?.subkegiatan]);
  cek('baris ditahan tidak punya bentuk siap pakai', null, h[2].hasil);
  cek('yang dicentang otomatis hanya baru & berubah', [false, true, false, false], h.map(x => x.ikut));

  const tambah = terapkanTambahRko(sskLama, h);
  cek('Tambahkan: jumlah baris', 2, tambah.length);
  cek('Tambahkan: yang ditahan tidak ikut', 0, tambah.filter(r => r.uraian === 'Belanja C').length);
  const timpa = terapkanTimpaRko(h);
  cek('Timpa: yang ditahan & kembar ikut terbuang', ['Belanja A', 'Belanja B'], timpa.map(r => r.uraian));
}
{
  // Pagu bergeser = 'berubah', dan nilai lamanya dibawa untuk ditampilkan.
  const berkas = [{ uraian: 'Belanja A', pagu: 1500, months: bln({ jan: 1000 }) }];
  const h = bandingkanRko(sskLama, rekening, berkas);
  cek('pagu bergeser -> berubah', 'berubah', h[0].status);
  cek('pagu lama dibawa', 1000, h[0].lamaPagu);
  cek('persentase ikut dihitung ulang', 66.67, h[0].hasil?.total_pct);
  cek('Uraian SSK baris lama dipertahankan', 'SSK-1', h[0].hasil?.uraian_ssk);
}
{
  // Nilai bulanan bergeser walau pagu tetap = tetap 'berubah'.
  const berkas = [{ uraian: 'Belanja A', pagu: 1000, months: bln({ feb: 1000 }) }];
  cek('bulan bergeser -> berubah', 'berubah', bandingkanRko(sskLama, rekening, berkas)[0].status);
}
{
  const berkas = [{ uraian: 'belanja  a', pagu: 1000, months: bln({ jan: 1000 }) }];
  cek('spasi ganda & huruf besar diabaikan', 'sama', bandingkanRko(sskLama, rekening, berkas)[0].status);
}
{
  // Peringatan Timpa: dihitung dari baris LAMA yang tidak disebut berkas.
  const berkas = [{ uraian: 'Belanja B', pagu: 1, months: bln({ jan: 1 }) }];
  const h = bandingkanRko(sskLama, rekening, berkas);
  cek('baris lama yang akan hilang kalau Timpa', 1, hilangKalauTimpa(sskLama, h));
  cek('berkas menyebut semuanya -> nol hilang', 0,
    hilangKalauTimpa(sskLama, bandingkanRko(sskLama, rekening, [{ uraian: 'Belanja A', pagu: 1000, months: bln({ jan: 1000 }) }])));
}

// ── E. Angka & nama sumber ─────────────────────────────────────────────────
bab('E. Pembacaan angka dan nama sumber');
cek('angka polos', 1234567, angkaRko(1234567));
cek('ribuan bertitik', 1234567, angkaRko('1.234.567'));
cek('ribuan berkoma', 1234567, angkaRko('1,234,567'));
cek('dalam kurung = negatif', -1234, angkaRko('(1.234)'));
cek('kosong = 0', 0, angkaRko(''));
cek('sumber dari nama berkas bergaris bawah', 'PROMKES', sumberRkoDariNama('RKO_PROMKES_2026-09-02'));
cek('nama sheet tak dikenal', null, sumberRkoDariNama('Sheet1'));

// ── F. Berkas asli pemakai (dilewati kalau tidak ada) ──────────────────────
bab('F. Berkas RKO asli di folder Downloads');
{
  const asli: [string, string, number, number][] = [
    ['PROMKES', 'C:/Users/HP VICTUS/Downloads/RKO_PROMKES_2026-09-02.xlsx', 2,  55_500_000],
    ['BLUD',    'C:/Users/HP VICTUS/Downloads/RKO_BLUD_2026-09-02.xlsx',    5,  68_383_000_000],
    ['GAJI',    'C:/Users/HP VICTUS/Downloads/RKO_GAJI_2026-09-02.xlsx',    15, 74_154_779_000],
  ];
  let ada = 0;
  for (const [sumber, path, jml, totalPagu] of asli) {
    if (!fs.existsSync(path)) continue;
    ada++;
    const h = await parseRkoImport(fs.readFileSync(path));
    cek(`${sumber}: jumlah baris`, jml, h.rows.length);
    cek(`${sumber}: sumber terbaca`, sumber, h.sumberSheet);
    cek(`${sumber}: total pagu`, totalPagu, h.rows.reduce((s, r) => s + r.pagu, 0));
    // Di ketiga berkas ini jumlah 12 bulan selalu sama dengan pagunya — kalau
    // pembacaan kolom meleset satu kolom, kecocokan itu langsung runtuh.
    const meleset = h.rows.filter(r => hitungTurunanRko(r.pagu, r.months).total !== r.pagu);
    cek(`${sumber}: baris yang jumlah bulannya != pagu`, 0, meleset.length);
    benar(`${sumber}: tidak ada baris yang 12 bulannya nol`,
      h.rows.every(r => hitungTurunanRko(r.pagu, r.months).total > 0));
  }
  if (ada === 0) console.log('  --   berkas asli tidak ada di mesin ini, bagian F dilewati');
}

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? `, ${gagal} GAGAL` : ''}`);
if (gagal) process.exit(1);
