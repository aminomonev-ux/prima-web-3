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
  hilangKalauTimpa, hitungTurunanRko, calonRko, dugaSkalaRibuan, kalikanBaris,
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

// ── G. Istilah berbeda, maksud sama (CONCEPT-kinerja-impor-rko-istilah §2) ──
bab('G. Kamus istilah judul kolom');
async function berkasGrid(baris: (string | number | { formula: string; result: number } | null)[][], sheet = 'RKO Perubahan'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  for (const b of baris) ws.addRow(b);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
const BLN_KEUANGAN = ['Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'Mei 2026', 'Juni 2026', 'Juli 2026', 'Agustus 2026', 'Sept 2026', 'Okt 2026', 'Nop 2026', 'Des 2026'];
{
  const h = await parseRkoImport(await berkasGrid([
    ['Kode Rekening', 'Nama Rekening', 'DPA Perubahan', ...BLN_KEUANGAN, 'Total Belanja', 'Sisa Anggaran', 'Sumber Anggaran'],
    ['5.1.1.1.1.1', 'Gaji Pokok', 1200, ...Array(12).fill(100), 1200, 0, 'APBD'],
  ]));
  cek('kolom Kode Rekening tidak jadi nama baris', 'Gaji Pokok', h.rows[0].uraian);
  cek('kode terbaca sebagai keterangan', '5.1.1.1.1.1', h.rows[0].kode);
  cek('"DPA Perubahan" dikenali sebagai pagu', 1200, h.rows[0].pagu);
  cek('"Sept" dikenali sebagai September', 100, h.rows[0].months.sep);
  cek('"Nop" dikenali sebagai November', 100, h.rows[0].months.nov);
  cek('Sisa Anggaran / Sumber Anggaran tidak jadi pagu', 2, h.peta.pagu);
  cek('tanpa peringatan bulan hilang', [], h.warnings);
}
{
  // Dua kolom sama-sama berbau pagu: istilah terkuat yang menang, bukan yang paling kiri.
  const h = await parseRkoImport(await berkasGrid([
    ['Rekening Belanja', 'Anggaran', 'Pagu', 'Nama Rekening', ...BLN_KEUANGAN],
    ['salah', 1, 999, 'Belanja X', ...Array(12).fill(1)],
  ]));
  cek('"Pagu" mengalahkan "Anggaran" yang lebih kiri', 999, h.rows[0].pagu);
  cek('"Nama Rekening" mengalahkan "Rekening Belanja" yang lebih kiri', 'Belanja X', h.rows[0].uraian);
}
{
  // "Sisa Anggaran" memuat kata anggaran DAN berada lebih kiri — tetap bukan pagu.
  const h = await parseRkoImport(await berkasGrid([
    ['Uraian', 'Sisa Anggaran', 'Anggaran', ...BLN_KEUANGAN],
    ['Belanja X', 5, 1200, ...Array(12).fill(100)],
  ]));
  cek('"Sisa Anggaran" yang lebih kiri tidak dipungut jadi pagu', 1200, h.rows[0].pagu);
}
{
  // Kolom realisasi menyebut bulannya juga — bukan target, tidak boleh dipungut.
  const h = await parseRkoImport(await berkasGrid([
    ['Uraian', 'Pagu', ...BULAN_PANJANG.flatMap(b => [`Realisasi ${b}`, `Target ${b}`])],
    ['Belanja X', 1200, ...Array.from({ length: 12 }, () => [7, 100]).flat()],
  ]));
  cek('kolom Realisasi bulan tidak dipungut jadi target', 100, h.rows[0].months.jan);
}

bab('H. Judul dua baris');
{
  // "Target Bulanan" digabung di atas Jan…Des; Uraian & Pagu di baris pertama saja.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('RKO');
  ws.addRow(['Uraian', 'Pagu', 'Target Bulanan', ...Array(11).fill(null)]);
  ws.addRow([null, null, ...BULAN_PENDEK]);
  ws.mergeCells(1, 3, 1, 14);
  ws.addRow(['Belanja X', 1200, ...Array(12).fill(100)]);
  const out = await wb.xlsx.writeBuffer();
  const h = await parseRkoImport(Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer));
  cek('judul dua baris: satu baris data', 1, h.rows.length);
  cek('judul dua baris: nama & pagu terbaca', ['Belanja X', 1200], [h.rows[0].uraian, h.rows[0].pagu]);
  cek('judul dua baris: Desember terbaca', 100, h.rows[0].months.des);
  cek('peta mencatat judul dua baris', true, h.peta.dua);
}
{
  // Baris kosong di atas judul satu baris tidak boleh membuatnya "dua baris".
  const h = await parseRkoImport(await berkasGrid([[], ['Uraian', 'Pagu', ...BULAN_PENDEK], ['Belanja X', 12, ...Array(12).fill(1)]]));
  cek('baris kosong + judul = judul satu baris', [1, false], [h.peta.header, h.peta.dua]);
}
{
  // Judul laporan di atas judul kolom: digabung pun skornya sama — yang satu baris menang,
  // kalau tidak nama kolom di panel pemetaan berbunyi "RKO PERUBAHAN 2026 Uraian".
  const h = await parseRkoImport(await berkasGrid([['RKO PERUBAHAN 2026'], ['Uraian', 'Pagu', ...BULAN_PENDEK], ['Belanja X', 12, ...Array(12).fill(1)]]));
  cek('judul laporan + judul kolom = judul satu baris', [1, false, 'Uraian'], [h.peta.header, h.peta.dua, h.kolom[0]?.judul]);
}

bab('I. Baris kelompok dilewati');
{
  const sum = (formula: string, result: number) => ({ formula, result });
  const h = await parseRkoImport(await berkasGrid([
    ['Nama Rekening', 'PAGU', ...BLN_KEUANGAN],
    ['BELANJA PEGAWAI', sum('B3+B6', 600), ...Array(12).fill(50)],
    ['BELANJA GAJI', sum('SUM(B4:B5)', 300), ...Array(12).fill(25)],
    ['Gaji Pokok', 200, ...Array(12).fill(0)],
    ['Tunjangan', 100, ...Array(12).fill(0)],
    ['BELANJA TPP', sum('SUM(B7:B8)', 300), ...Array(12).fill(25)],
    ['Beban Kerja', 250, ...Array(12).fill(0)],
    ['Kondisi Kerja', 50, ...Array(12).fill(0)],
  ]));
  cek('kelompok berlapis dilewati dari bawah', ['BELANJA PEGAWAI', 'BELANJA GAJI', 'BELANJA TPP'], h.kelompok.map(k => k.uraian));
  cek('yang tersisa hanya rekening', ['Gaji Pokok', 'Tunjangan', 'Beban Kerja', 'Kondisi Kerja'], h.rows.map(r => r.uraian));
}
{
  // Rumus di sel pagu = tanda kuat, walau ditulis huruf biasa dan cuma satu anak.
  const h = await parseRkoImport(await berkasGrid([
    ['Uraian', 'Pagu', ...BULAN_PENDEK],
    ['Belanja gaji', { formula: 'B3', result: 300 }, ...Array(12).fill(0)],
    ['Gaji pokok', 300, ...Array(12).fill(0)],
  ]));
  cek('pagu berumus dengan satu anak dilewati', ['Belanja gaji'], h.kelompok.map(k => k.uraian));
}
{
  // Kode lebih pendek dari kode baris sesudahnya = tanda kelompok, walau tanpa rumus & huruf biasa.
  const h = await parseRkoImport(await berkasGrid([
    ['Kode Rekening', 'Uraian', 'Pagu', ...BULAN_PENDEK],
    ['5.1.1', 'Belanja gaji', 300, ...Array(12).fill(0)],
    ['5.1.1.01', 'Gaji pokok', 300, ...Array(12).fill(0)],
  ]));
  cek('kode induk dengan satu anak dilewati', ['Belanja gaji'], h.kelompok.map(k => k.uraian));
}
{
  // Kebetulan angka sama tanpa tanda apa pun dari berkasnya = BUKAN kelompok.
  const h = await parseRkoImport(await berkasGrid([
    ['Uraian', 'Pagu', ...BULAN_PENDEK],
    ['Belanja A', 300, ...Array(12).fill(0)],
    ['Belanja B', 100, ...Array(12).fill(0)],
    ['Belanja C', 200, ...Array(12).fill(0)],
  ]));
  cek('angka kebetulan sama tanpa tanda tidak dilewati', 3, h.rows.length);
}
{
  // Berkas yang ditulis KAPITAL semua: kapital bukan tanda lagi.
  const h = await parseRkoImport(await berkasGrid([
    ['URAIAN', 'PAGU', ...BULAN_PENDEK],
    ['BELANJA A', 300, ...Array(12).fill(0)],
    ['BELANJA B', 100, ...Array(12).fill(0)],
    ['BELANJA C', 200, ...Array(12).fill(0)],
  ]));
  cek('berkas kapital semua: tidak ada yang dianggap kelompok', 3, h.rows.length);
}
{
  // Satu anak + tanda kapital saja (lemah) tidak cukup — dua rekening bisa bernilai sama.
  const h = await parseRkoImport(await berkasGrid([
    ['Uraian', 'Pagu', ...BULAN_PENDEK],
    ['TAPERA', 131, ...Array(12).fill(0)],
    ['Iuran lain', 131, ...Array(12).fill(0)],
  ]));
  cek('kapital + satu baris bernilai sama tidak dilewati', 2, h.rows.length);
}

bab('J. Pencocokan bertingkat');
const sskGaji: SskRow[] = [
  'Belanja Gaji Pokok PNS', 'Belanja Tunjangan Fungsional PNS', 'Belanja Tunjangan Fungsional Umum PNS',
  'Belanja Iuran Simpanan Peserta Tabungan Perumahan Rakyat PNS',
  'Tambahan Penghasilan berdasarkan Beban Kerja PNS', 'Tambahan Penghasilan berdasarkan Beban Kerja PPPK',
].map((uraian, i) => ({ canonical_id: `K-${i}`, uraian_ssk: 'SSK', uraian, program: 'P', kegiatan: 'K', subkegiatan: 'S',
  pagu: 100, months: bln({ jan: 100 }), ...hitungTurunanRko(100, bln({ jan: 100 })) }));
const b = (uraian: string, pagu = 50): { uraian: string; pagu: number; months: SskMonths } => ({ uraian, pagu, months: bln({ jan: pagu }) });
{
  const h = bandingkanRko(sskGaji, [], [b('Gaji Pokok'), b('Tunjangan Fungsional'), b('Tunjangan Fungsional Umum'), b('Tapera PNS'), b('Beban Kerja PNS'), b('Beban Kerja PPPK')]);
  cek('kata: semua kata ada di tepat satu nama → dipasangkan', [0, 'kata'], [h[0].idxLama, h[0].cara]);
  cek('kata: "Tunjangan Fungsional" tunggal SETELAH "…Umum" memakai barisnya', [1, 2], [h[1].idxLama, h[2].idxLama]);
  cek('kata pembeda PNS/PPPK menjaga calonnya tunggal', [4, 5], [h[4].idxLama, h[5].idxLama]);
  cek('singkatan tanpa kata yang sama tetap ditahan', ['ditahan', null], [h[3].status, h[3].cara]);
  cek('pasangan kata membawa canonical_id baris lama', 'K-0', h[0].hasil?.canonical_id);
  cek('nama yang tersimpan tetap nama RKO, bukan nama berkas', 'Belanja Gaji Pokok PNS', h[0].hasil?.uraian);
}
{
  // Dua baris berkas berebut satu calon = tidak ada yang dipasangkan (bukan yang pertama menang).
  const h = bandingkanRko(sskGaji, [], [b('Gaji Pokok'), b('Pokok PNS')]);
  cek('berebut satu calon → keduanya ditahan', ['ditahan', 'ditahan'], h.map(x => x.status));
}
{
  const h = bandingkanRko(sskGaji, [], [b('Tunjangan')]);
  cek('calon lebih dari satu → ditahan', 'ditahan', h[0].status);
}
{
  // Pilihan pemakai: memasang, melepas saran, dan tidak bisa merebut baris yang sudah cocok persis.
  const berkas = [b('Tapera PNS'), b('Gaji Pokok'), b('Belanja Gaji Pokok PNS'), b('Tunjangan')];
  const h = bandingkanRko(sskGaji, [], berkas, { 0: 3, 1: null, 3: 0 });
  cek('pilihan memasangkan baris yang ditahan', [3, 'pilihan'], [h[0].idxLama, h[0].cara]);
  cek('null = saran dilepas, jadi ditahan', ['ditahan', null], [h[1].status, h[1].idxLama]);
  cek('nama persis mengalahkan pilihan ke baris yang sama', [0, 'persis'], [h[2].idxLama, h[2].cara]);
  cek('pilihan ke baris yang sudah dipakai diabaikan', 'ditahan', h[3].status);
  const c = calonRko(sskGaji, h, 3);
  benar('calonRko tidak menawarkan baris yang dipakai baris lain', !c.some(x => x.idx === 0 || x.idx === 3));
}
{
  // Saran yang dilepas pemakai tidak boleh ditebak lagi oleh tingkat "kata" — di sini
  // calonnya MASIH tersedia (tidak dipakai baris lain), jadi yang menahannya hanya `null`.
  const h = bandingkanRko(sskGaji, [], [b('Gaji Pokok')], { 0: null });
  cek('saran dilepas tetap tidak dipasangkan walau calonnya bebas', ['ditahan', null], [h[0].status, h[0].idxLama]);
}
{
  // Urut kemiripan, bukan abjad: yang paling mirip di sini justru berawalan "T".
  const h = bandingkanRko(sskGaji, [], [b('Beban PPPK lain')]);
  cek('calonRko diurutkan dari yang paling mirip', 'Tambahan Penghasilan berdasarkan Beban Kerja PPPK', calonRko(sskGaji, h, 0)[0]?.uraian);
}
{
  // Nama persis ada di tab Rekening = baris BARU, tidak ditebak ke baris RKO yang mirip.
  const h = bandingkanRko(sskGaji, [rek('Gaji Pokok', 'SSK-X')], [b('Gaji Pokok')]);
  cek('nama di Rekening → baru, bukan saran', ['baru', null], [h[0].status, h[0].cara]);
}
{
  // Timpa dihitung dari baris lama yang tidak DIPASANGI — bukan dari nama.
  const h = bandingkanRko(sskGaji, [], [b('Gaji Pokok')]);
  cek('Timpa: baris lama yang terpasang lewat kata tidak dihitung hilang', sskGaji.length - 1, hilangKalauTimpa(sskGaji, h));
}

bab('K. Skala ribuan');
{
  const h = bandingkanRko(sskGaji, [], [b('Gaji Pokok', 0.1), b('Beban Kerja PNS', 0.1)]);
  benar('angka ~seperseribu pagu terpasang → diduga ribuan', dugaSkalaRibuan(h));
  benar('angka sebanding → tidak diduga', !dugaSkalaRibuan(bandingkanRko(sskGaji, [], [b('Gaji Pokok', 90)])));
  benar('tanpa baris terpasang → tidak diduga', !dugaSkalaRibuan(bandingkanRko(sskGaji, [], [b('Tapera PNS', 0.1)])));
  const k = kalikanBaris([b('X', 2.5)], 1000);
  cek('kalikanBaris: pagu & bulan', [2500, 2500], [k[0].pagu, k[0].months.jan]);
}

bab('L. Pemetaan kolom dipaksa pemakai');
{
  const buf = await berkasGrid([
    ['Kode Rekening', 'Nama Rekening', 'DPA Perubahan', 'Nilai Lain', ...BLN_KEUANGAN],
    ['5.1', 'Gaji Pokok', 1200, 777, ...Array(12).fill(100)],
  ]);
  const tebak = await parseRkoImport(buf);
  const h = await parseRkoImport(buf, { ...tebak.peta, pagu: 3, bulan: tebak.peta.bulan.map((c, i) => (i === 11 ? null : c)) });
  cek('pagu dari kolom yang dipilih pemakai', 777, h.rows[0].pagu);
  cek('bulan yang dikosongkan pemakai = 0', 0, h.rows[0].months.des);
  benar('kolom pilihan ditawarkan dengan judulnya', tebak.kolom.some(k => k.indeks === 3 && k.judul === 'Nilai Lain'));
  let galat = '';
  try { await parseRkoImport(buf, { ...tebak.peta, sheet: 'Tidak Ada' }); } catch (e) { galat = (e as Error).message; }
  benar('sheet yang tidak ada ditolak dengan kalimatnya', /tidak ada di berkas/.test(galat), galat);
}

bab('M. Bentuk kode — modal & route');
{
  const md = fs.readFileSync('components/kinerja/ImportRkoModal.tsx', 'utf8');
  const rt = fs.readFileSync('app/api/kinerja/ssk/import/route.ts', 'utf8');
  benar('mode bawaan Tambahkan (Timpa bisa mengosongkan & meng-yatim-kan)', /useState<Mode>\('tambah'\)/.test(md));
  benar('Terapkan mati kalau tidak ada baris siap', /disabled=\{busy \|\| !baca \|\| siap === 0\}/.test(md));
  benar('peringatan berkas Perubahan di versi MURNI', /\{berkasPerubahan && versiLabel === 'MURNI' && \(/.test(md));
  benar('pilihan pasangan diteruskan ke pencocok', /bandingkanRko\(rowsSekarang, rekeningRows, rowsBerkas, pasangan\)/.test(md));
  benar('Timpa menyebut realisasi yang jadi yatim', /jadi yatim/.test(md));
  benar('route memvalidasi pemetaan dengan Zod sebelum dipakai', /PetaRkoSchema\.safeParse\(json\)/.test(rt) && /parseRkoImport\(buf, paksa\)/.test(rt));
}

// ── N. Berkas RKO keuangan asli (dilewati kalau tidak ada) ──────────────────
bab('N. Berkas "Belanja Pegawai Perubahan" asli di folder Downloads');
{
  const namaGaji = [
    'Belanja Gaji Pokok PNS', 'Belanja Tunjangan Keluarga PNS', 'Belanja Tunjangan Jabatan PNS', 'Belanja Tunjangan Fungsional PNS',
    'Belanja Tunjangan Fungsional Umum PNS', 'Belanja Tunjangan Beras PNS', 'Belanja Tunjangan PPh/Tunjangan Khusus PNS',
    'Belanja Pembulatan Gaji PNS', 'Belanja Iuran Jaminan Kesehatan PNS', 'Belanja Iuran Jaminan Kecelakaan Kerja PNS',
    'Belanja Iuran Jaminan Kematian PNS', 'Belanja Iuran Simpanan Peserta Tabungan Perumahan Rakyat PNS',
    'Tambahan Penghasilan berdasarkan Beban Kerja PNS', 'Tambahan Penghasilan berdasarkan Beban Kerja PPPK',
    'Tambahan Penghasilan berdasarkan Kondisi Kerja PNS',
  ].map((uraian, i) => ({ canonical_id: `K-${i}`, uraian_ssk: 'Penyediaan Gaji dan Tunjangan ASN', uraian, program: 'P', kegiatan: 'K',
    subkegiatan: 'S', pagu: 1, months: bln({}), ...hitungTurunanRko(1, bln({})) }) as SskRow);
  const berkasAsli = [
    'C:/Users/HP VICTUS/Downloads/Belanja_Pegawai_Perubahan_TA_2026_RKO_ribuan-1.xlsx',
    'C:/Users/HP VICTUS/Downloads/Belanja_Pegawai_Perubahan_TA_2026_RKO_ribuan-1 (1).xlsx',
  ];
  let ada = 0;
  for (const path of berkasAsli) {
    if (!fs.existsSync(path)) continue;
    ada++;
    const nama = path.endsWith('(1).xlsx') ? 'berkas berkode' : 'berkas tanpa kode';
    const h = await parseRkoImport(fs.readFileSync(path));
    cek(`${nama}: 15 rekening, 3 kelompok dilewati`, [15, 3], [h.rows.length, h.kelompok.length]);
    cek(`${nama}: total pagu = DPA Perubahan`, 59_126_735_000, h.rows.reduce((s, r) => s + r.pagu, 0));
    cek(`${nama}: jumlah bulan = pagu di semua baris (September terbaca)`, 0,
      h.rows.filter(r => hitungTurunanRko(r.pagu, r.months).total !== r.pagu).length);
    const p = bandingkanRko(namaGaji, [], h.rows);
    cek(`${nama}: 14 dipasangkan lewat kata, Tapera ditahan`, { kata: 14, ditahan: ['Tapera PNS'] },
      { kata: p.filter(x => x.cara === 'kata').length, ditahan: p.filter(x => x.status === 'ditahan').map(x => x.asal.uraian) });
    benar(`${nama}: tiap baris RKO dipakai paling banyak sekali`,
      new Set(p.flatMap(x => (x.idxLama !== null ? [x.idxLama] : []))).size === p.filter(x => x.idxLama !== null).length);
  }
  if (ada === 0) console.log('  --   berkas asli tidak ada di mesin ini, bagian N dilewati');
}

console.log(`\n${lulus} pemeriksaan LULUS${gagal ? `, ${gagal} GAGAL` : ''}`);
if (gagal) process.exit(1);
