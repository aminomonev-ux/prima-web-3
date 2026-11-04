// scripts/test-kinerja-persen.mts — persen E-Anggaran ditulis gaya Indonesia.
// Jalankan: npx tsx scripts/test-kinerja-persen.mts
//
// `toFixed(2) + '%'` menulis "100.00%" bertitik di samping rupiah bertitik-ribuan,
// dan teks itu tidak terbaca sebagai angka oleh tabel LKJIP ("Salin ke LKJIP").
// Layar & PDF memakai `tulisPersen`; sel Excel tetap ANGKA ber-FMT_PERSEN.
// Bagian Cetak dijaga test-kinerja-rekap.mts bab M2.

import { readFileSync } from 'node:fs';
import { buatWorkbookLaporan, barisLaporanPdf, ringkasLaporanPdf, barisSskPdf } from '../app/(dashboard)/kinerja/_exports';
import { FMT_PERSEN, FMT_RUPIAH } from '../lib/shared/excel-export';
import { tulisPersen, tulisTetap } from '../lib/shared/desimal';
import type { LaporanSumber, SskRow, SskMonths } from '../app/(dashboard)/kinerja/_types';

let lulus = 0;
const gagal: string[] = [];
function ok(nama: string, syarat: boolean, ket = '') {
  if (syarat) { lulus++; console.log(`  ok  ${nama}`); }
  else { gagal.push(nama); console.log(`FAIL  ${nama}${ket ? ' — ' + ket : ''}`); }
}
const tanpaKomentar = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const POLA = /^-?\d{1,3}(\.\d{3})*,\d{1,2}%$/;

console.log('\n── A. Layar: tidak ada lagi toFixed + "%" ─────────────────────────');
const TAB = ['CetakTab', 'DashboardTab', 'LaporanTab', 'PendapatanCrrTab', 'RealisasiTab', 'SskTab'];
for (const t of TAB) {
  const src = tanpaKomentar(readFileSync(`app/(dashboard)/kinerja/_tabs/${t}.tsx`, 'utf8'));
  const sisa = src.match(/toFixed\(\d\)\}?\s*(\+\s*'%'|%)/g) ?? [];
  ok(`A ${t}: persen tanpa toFixed`, sisa.length === 0, sisa.join(' | '));
  ok(`A ${t}: angka mentah tidak ditempeli "%"`, !/\}%</.test(src) && !/\+\s*'%'/.test(src));
  ok(`A ${t}: memakai tulisPersen dari lib/shared/desimal`,
     /import \{ tulisPersen \} from '@\/lib\/shared\/desimal';/.test(src) && /tulisPersen\(/.test(src));
}
{
  const lap = tanpaKomentar(readFileSync('app/(dashboard)/kinerja/_tabs/LaporanTab.tsx', 'utf8'));
  // "1.234,56%" lewat parseFloat = 1,234 → bilah kartu nyaris kosong.
  ok('A LaporanTab: lebar bilah kartu dari angka, bukan parseFloat teks',
     !/parseFloat\(c\.value\)/.test(lap) && /width:`\$\{Math\.min\(c\.pct,100\)\}%`/.test(lap));
  ok('A LaporanTab: kedua kartu persen membawa angkanya',
     /value: tulisPersen\(d\.pct_serapan\),\s+icon:Percent, pct: d\.pct_serapan,/.test(lap) &&
     /value: tulisPersen\(d\.pct_fisik\),\s+icon:ListChecks, pct: d\.pct_fisik,/.test(lap));
}

const bulanan = (v: number): SskMonths =>
  ({ jan: v, feb: v, mar: v, apr: v, mei: v, jun: v, jul: v, agu: v, sep: v, okt: v, nov: v, des: v });
const laporan: LaporanSumber = {
  sumber: 'GAJI', total_pagu: 7_000_000_000, total_target_fisik: 7_000_000_000,
  total_real_keuangan: 4_340_700_000, total_real_fisik: 4_400_000_000,
  pct_serapan: 62.01, pct_fisik: 1234.5, bulan_terakhir: 2,
  trend: [
    { bulan: 1, real_keuangan: 583_000_000, pct_keuangan: 8.33, akum_keuangan: 583_000_000, akum_pct_keuangan: 8.33, real_fisik: 600_000_000, akum_pct_fisik: 8.57 },
    { bulan: 2, real_keuangan: 3_757_700_000, pct_keuangan: 53.68, akum_keuangan: 4_340_700_000, akum_pct_keuangan: 62.01, real_fisik: 3_800_000_000, akum_pct_fisik: 1234.5 },
  ],
  target_bulan: Array(12).fill(583_333_333),
  yatim: { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] },
  versi_aktif: { tipe: 'MURNI', seq: 0 }, versi_dinolkan: false,
};

console.log('\n── B. Laporan Excel: persen tetap ANGKA ───────────────────────────');
{
  const wb = await buatWorkbookLaporan(laporan);
  const sum = wb.getWorksheet('Ringkasan')!;
  const baris = (label: string): { v: unknown; f: string | undefined } | null => {
    let hasil: { v: unknown; f: string | undefined } | null = null;
    sum.eachRow(r => { if (r.getCell(1).value === label) hasil = { v: r.getCell(2).value, f: r.getCell(2).numFmt }; });
    return hasil;
  };
  const ser = baris('% Serapan Keuangan'), fis = baris('% Capaian Fisik'), pagu = baris('Total Pagu');
  ok('B1 % Serapan = angka ber-FMT_PERSEN', ser?.v === 62.01 && ser?.f === FMT_PERSEN, JSON.stringify(ser));
  ok('B2 % Capaian Fisik = angka ber-FMT_PERSEN', fis?.v === 1234.5 && fis?.f === FMT_PERSEN, JSON.stringify(fis));
  ok('B3 rupiah di kolom yang sama tetap FMT_RUPIAH', pagu?.v === 7_000_000_000 && pagu?.f === FMT_RUPIAH, JSON.stringify(pagu));
  ok('B4 nama bulan tetap teks', baris('Bulan Terakhir Data')?.v === 'Februari');

  const trend = wb.getWorksheet('Trend Bulanan')!;
  const r2 = trend.getRow(3);
  const PERSEN = [3, 5, 7], RUPIAH = [2, 4, 6];
  ok('B5 Trend: kolom persen ANGKA ber-FMT_PERSEN',
     PERSEN.every(c => typeof r2.getCell(c).value === 'number' && r2.getCell(c).numFmt === FMT_PERSEN),
     PERSEN.map(c => `${JSON.stringify(r2.getCell(c).value)}/${r2.getCell(c).numFmt}`).join(' '));
  ok('B6 Trend: nilainya hasil hitungan apa adanya', r2.getCell(5).value === 62.01 && r2.getCell(7).value === 1234.5);
  ok('B7 Trend: kolom rupiah tetap FMT_RUPIAH', RUPIAH.every(c => r2.getCell(c).numFmt === FMT_RUPIAH));
}

console.log('\n── C. Laporan & SSK PDF: persen berkoma ───────────────────────────');
{
  const sel = barisLaporanPdf(laporan).flatMap(b => [b[2], b[4], b[6]]);
  ok('C1 Laporan PDF: semua kolom persen berkoma', sel.length === 6 && sel.every(s => POLA.test(s)), sel.join(' | '));
  ok('C2 Laporan PDF: ribuan bertitik', barisLaporanPdf(laporan)[1][6] === '1.234,50%');
  const ring = ringkasLaporanPdf(laporan);
  ok('C3 Laporan PDF: baris ringkasan berkoma', ring.includes('Serapan: 62,01%') && ring.includes('Capaian Fisik: 1.234,50%'), ring);

  const ssk: SskRow = {
    uraian_ssk: 'Uji', uraian: 'Belanja Uji', program: '', kegiatan: '', subkegiatan: '',
    pagu: 7_000_000_000, months: bulanan(583_333_333), months_pct: { ...bulanan(8.33), des: 8.37 },
    total: 7_000_000_000, total_pct: 100,
  };
  const b = barisSskPdf([ssk])[0];
  const persenSsk = b.filter((_, i) => i >= 5 && i % 2 === 1);
  ok('C4 SSK PDF: 12 persen bulan + total berkoma', persenSsk.length === 13 && persenSsk.every(s => POLA.test(s)), persenSsk.join(' | '));
  ok('C5 SSK PDF: total 100 → "100,00%"', b[b.length - 1] === '100,00%', b[b.length - 1]);
  ok('C6 SSK PDF: rupiah tetap bertitik-ribuan', b[3] === '7.000.000.000' && b[4] === '583.333.333');
}

console.log('\n── D. Angka ringkas rupiah ("1,5 M") — audit 2026-11-04 ──────────────');
{
  ok('D1 tulisTetap: desimal tetap gaya Indonesia, kosong untuk bukan-angka',
    tulisTetap(1.5, 1) === '1,5' && tulisTetap(2, 1) === '2,0' && tulisTetap(1234.567, 2) === '1.234,57' && tulisTetap(Number.NaN, 1) === '' && tulisTetap(null, 1) === '',
    [tulisTetap(1.5, 1), tulisTetap(2, 1), tulisTetap(1234.567, 2)].join(' | '));
  ok('D2 tulisPersen tetap = tulisTetap + "%"', tulisPersen(85.5) === '85,50%' && tulisPersen(Number.NaN) === '');
  const RINGKAS = ['components/kinerja/BerandaCharts.tsx', 'app/(dashboard)/dashboard/dashboard-client.tsx', 'app/(dashboard)/dashboard/[modul]/detail-client.tsx'];
  for (const f of RINGKAS) {
    const sisa = tanpaKomentar(readFileSync(f, 'utf8')).match(/toFixed\(\d\)/g) ?? [];
    ok(`D3 ${f.split('/').pop()}: angka ringkas & persen tanpa toFixed`, sisa.length === 0, sisa.join(' | '));
  }
}

console.log(`\n${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length) process.exit(1);
