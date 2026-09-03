// ─── PRIMA E-Anggaran — XLSX & PDF Export Functions ────────────────────────────
// O2 + PERF-C3: 8 export fn (Excel via exceljs + PDF via jspdf+autotable).
// SDL-Audit v1.1 Phase 4: migrate xlsx-js-style → exceljs (CVE prototype pollution + ReDoS).
// Dynamic import: library hanya di-load saat user pertama kali klik tombol export, lalu cached.
// Bundle initial /kinerja TIDAK termasuk library ini.

import { fmtRp, fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { loadExcelJs, addSheetFromAoa, downloadWorkbook } from '@/lib/shared/excel-export';
import type {
  SumberSSK, SskRow, RekeningRow, RealRow, CrrRow, PendRow, LaporanSumber,
  MasterOpts, MasterRow, MasterTipe,
} from './_types';
import { MONTHS_KEYS, MONTH_SHORT, CRR_BULAN_LABELS } from './_utils';
import type { BarisRekap, LaporanYatim } from '@/lib/kinerja/rekap';
import { hitungJumlahBulan, bulanBerdata } from '@/lib/kinerja/cetak-detail';

let _pdfPromise:  Promise<{ jsPDF: typeof import('jspdf').jsPDF; autoTable: typeof import('jspdf-autotable').default }> | null = null;

export function loadPdf() {
  if (!_pdfPromise) _pdfPromise = Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([pdf, table]) => ({ jsPDF: pdf.jsPDF, autoTable: table.default }));
  return _pdfPromise;
}

// ─── SSK ──────────────────────────────────────────────────────────────────────

export async function exportSskExcel(params: { rows: SskRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`SSK ${sumber}`);
  const header = [
    'No','Uraian SSK','Uraian','Pagu (Rp)',
    ...MONTHS_KEYS.flatMap((_, i) => [`Target ${MONTH_SHORT[i]}`, `% ${MONTH_SHORT[i]}`]),
    'Total (Rp)','Total %',
  ];
  const data = rows.map((r, i) => [
    i+1, r.uraian_ssk, r.uraian, r.pagu,
    ...MONTHS_KEYS.flatMap(m => [r.months[m] || 0, r.months_pct[m] || 0]),
    r.total, r.total_pct,
  ]);
  addSheetFromAoa(ws, [header, ...data], {
    colWidths: [{ wch: 5 }, { wch: 20 }, { wch: 30 }, { wch: 16 }, ...MONTHS_KEYS.flatMap(() => [{ wch: 14 }, { wch: 8 }]), { wch: 16 }, { wch: 10 }],
  });
  await downloadWorkbook(wb, `SSK-${sumber}-${tahun}.xlsx`);
}

export async function exportSskPdf(params: { rows: SskRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  doc.setFontSize(13);
  doc.text(`SSK ${sumber} — Tahun ${tahun}`, 14, 14);
  doc.setFontSize(9);
  doc.text('RSJD dr. Amino Gondohutomo', 14, 20);
  const head = [['No','Uraian SSK','Uraian','Pagu (Rp)', ...MONTH_SHORT.flatMap(m => [`${m} Fisik`,`${m} %`]),'Total (Rp)','Total %']];
  const body = rows.map((r, i) => [
    String(i+1), r.uraian_ssk, r.uraian, fmtNum(r.pagu),
    ...MONTHS_KEYS.flatMap(m => [fmtNum(r.months[m]||0), String(r.months_pct[m]||0)]),
    fmtNum(r.total), String(r.total_pct)+'%',
  ]);
  autoTable(doc, { head, body, startY: 24, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [51,65,85] } });
  doc.save(`SSK-${sumber}-${tahun}.pdf`);
}

// ─── Kop dokumen: SATU bentuk untuk PDF dan Excel ─────────────────────────────
//
// Isi kopnya beda antara Rekap dan Detail, tapi bentuknya sama: beberapa baris
// rata tengah dengan ukuran & ketebalan bertingkat. Dipisah jadi deskripsi
// (`KopBaris[]`) + dua penulis, supaya tidak ada dua versi kop yang bisa
// berbeda — dulu kop PDF rekap rata kiri sementara kop PDF detail rata tengah,
// jadi dalam satu berkas bundel halaman 1 tidak sebentuk dengan halaman 2.

export interface KopBaris { teks: string; ukuran: number; tebal: boolean }

export function kopRekap(namaBulan: string, tahun: string): KopBaris[] {
  return [
    { teks: 'RUMAH SAKIT JIWA DAERAH DR. AMINO GONDOHUTOMO', ukuran: 12, tebal: true },
    { teks: 'PROVINSI JAWA TENGAH', ukuran: 9, tebal: false },
    { teks: 'LAPORAN PERKEMBANGAN PELAKSANAAN BELANJA — REKAP', ukuran: 11, tebal: true },
    { teks: `S/D BULAN ${namaBulan.toUpperCase()} TAHUN ${tahun} — SEMUA SUMBER`, ukuran: 9, tebal: false },
    { teks: 'Pagu & target mengacu SSK versi aktif tiap sumber', ukuran: 8, tebal: false },
  ];
}

export function kopDetail(sumber: SumberSSK, bulan: number, tahun: string): KopBaris[] {
  return [
    { teks: 'RUMAH SAKIT JIWA DAERAH DR. AMINO GONDOHUTOMO', ukuran: 12, tebal: true },
    { teks: 'PROVINSI JAWA TENGAH', ukuran: 9, tebal: false },
    { teks: `LAPORAN REALISASI KINERJA ${sumber}`, ukuran: 11, tebal: true },
    { teks: `BULAN ${(CRR_BULAN_LABELS[bulan - 1] ?? '').toUpperCase()} TAHUN ${tahun}`, ukuran: 9, tebal: false },
  ];
}

/**
 * Dua pejabat penanda tangan — dipakai LAYAR, PDF, dan Excel.
 *
 * Dulu nama jabatannya ditulis ulang di JSX CetakTab, jadi mengganti
 * "Kabag Program & Anggaran" jadi "Kabag Renbang" harus disentuh di dua tempat
 * dan cukup lupa satu untuk membuat cetakan berbeda dengan layarnya.
 */
export const PENANDA_TANGAN = [
  { peran: 'Mengetahui,',   jabatan: 'Kabag Renbang' },
  { peran: 'Yang membuat,', jabatan: 'Kasubag Program' },
];

// ─── Rekap (Cetak → Rekap) ────────────────────────────────────────────────────
//
// Menerima baris yang SUDAH dihitung `hitungRekap`, bukan menghitung ulang —
// dokumen yang diunduh wajib memuat angka yang persis sama dengan yang dilihat
// orang di layar. Menghitung ulang di sini berarti dua sumber kebenaran untuk
// satu tabel, dan cepat atau lambat keduanya berbeda pendapat.

const REKAP_HEADER = [
  'No', 'Uraian', 'Anggaran (Rp)', 'Target s/d Bln Ini (%)',
  'Realisasi Fisik s/d Bln Ini (Rp)', 'Realisasi Fisik s/d Bln Ini (%)', 'Deviasi Fisik (%)',
  'Tingkat Capaian Fisik (%)',
  'Target Keu s/d Bln Ini (Rp)', 'Bulan Ini (Rp)', 'Realisasi Keu s/d Bln Ini (Rp)',
  'Realisasi Keu s/d Bln Ini (%)', 'Deviasi Keu (%)',
];

/** Hierarki dipertahankan lewat spasi di depan label — Excel & PDF tidak punya indent baris. */
const labelIndent = (b: BarisRekap) => `${'    '.repeat(b.indent)}${b.label}`;

export interface RekapExportParams {
  baris:    BarisRekap[];
  yatim:    LaporanYatim;
  tahun:    string;
  namaBulan: string;
}

/** Catatan yatim ikut dibawa: tanpa ini, dokumen yang dibaca di luar aplikasi
 *  tidak bisa dijelaskan kenapa totalnya lebih kecil dari kas yang keluar. */
function catatanYatim(yatim: LaporanYatim): string | null {
  if (yatim.jumlahBaris === 0) return null;
  return `Catatan: ${yatim.jumlahItem} rekening (${yatim.jumlahBaris} baris, realisasi keuangan `
    + `${fmtNum(yatim.nominal)}) TIDAK ikut dihitung — rekeningnya sudah tidak ada di SSK acuan `
    + `sehingga tidak punya pagu sebagai pembagi.`;
}

/** Baris kop di atas header — indeksnya juga yang dipakai `headerRowIndex`. */
export const REKAP_JUDUL_BARIS = 6;

/** Dipisah dari pengunduhannya supaya bisa diuji tanpa DOM. */
export function rekapAoa({ baris, yatim, tahun, namaBulan }: RekapExportParams): (string | number | null)[][] {
  const judul: (string | number | null)[][] = [
    ['RUMAH SAKIT JIWA DAERAH DR. AMINO GONDOHUTOMO'],
    ['PROVINSI JAWA TENGAH'],
    ['LAPORAN PERKEMBANGAN PELAKSANAAN BELANJA — REKAP'],
    [`S/D BULAN ${namaBulan.toUpperCase()} TAHUN ${tahun} — SEMUA SUMBER`],
    ['Pagu & target mengacu SSK versi aktif tiap sumber'],
    [],
  ];
  const data = baris.map(b => [
    b.no, labelIndent(b), b.pagu, b.targetPct,
    b.realFisik, b.pctFisik, b.devFisik, b.capaianFisik,
    b.targetRp, b.realKeuBulanIni, b.realKeu, b.pctKeu, b.devKeu,
  ]);
  const catatan = catatanYatim(yatim);
  return [...judul, REKAP_HEADER, ...data, ...(catatan ? [[], [catatan]] : [])];
}

const REKAP_LEBAR = [{ wch:5 },{ wch:48 },{ wch:18 },{ wch:12 },{ wch:20 },{ wch:12 },{ wch:12 },{ wch:14 },{ wch:20 },{ wch:18 },{ wch:20 },{ wch:12 },{ wch:12 }];

/**
 * Rapikan sheet Rekap supaya sebentuk dengan layar: kop di-merge selebar tabel
 * dan dirata-tengah (dulu menggantung di kolom A dan meluber ke kanan), lalu
 * baris grand total & program ditebalkan seperti di layar — `BarisRekap.tebal`
 * sudah membawa informasinya, tinggal dipakai.
 */
export function rapikanSheetRekap(ws: import('exceljs').Worksheet, baris: BarisRekap[]) {
  const kolom = REKAP_HEADER.length;
  kopRekap('', '').forEach((k, i) => {
    const r = ws.getRow(i + 1);
    ws.mergeCells(r.number, 1, r.number, kolom);
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(1).font = { bold: k.tebal, size: k.ukuran };
  });
  baris.forEach((b, i) => {
    if (!b.tebal) return;
    ws.getRow(REKAP_JUDUL_BARIS + 2 + i).eachCell(c => { c.font = { bold: true }; });
  });
}

export async function exportRekapExcel(params: RekapExportParams) {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet('Rekap');
  addSheetFromAoa(ws, rekapAoa(params), { headerRowIndex: REKAP_JUDUL_BARIS, colWidths: REKAP_LEBAR });
  rapikanSheetRekap(ws, params.baris);
  await downloadWorkbook(wb, `Rekap-SemuaSumber-sd-${params.namaBulan}-${params.tahun}.xlsx`);
}

/** Halaman rekap di PDF — dipakai unduhan satuan DAN bundel. */
export function gambarRekapPdf(
  doc: import('jspdf').jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  { baris, yatim, tahun, namaBulan }: RekapExportParams,
) {
  // Rata tengah lewat penulis yang SAMA dengan halaman detail. Dulu kop rekap
  // ditulis di x=14 (pojok kiri) sementara kop detail rata tengah, jadi dalam
  // satu berkas bundel halaman 1 tidak sebentuk dengan halaman 2.
  const yTabel = tulisKopPdf(doc, kopRekap(namaBulan, tahun), 13);

  const body = baris.map(b => [
    String(b.no), labelIndent(b), fmtNum(b.pagu), b.targetPct.toFixed(2) + '%',
    fmtNum(b.realFisik), b.pctFisik.toFixed(2) + '%', b.devFisik.toFixed(2) + '%',
    b.capaianFisik === null ? '—' : b.capaianFisik.toFixed(2) + '%',
    fmtNum(b.targetRp), fmtNum(b.realKeuBulanIni), fmtNum(b.realKeu),
    b.pctKeu.toFixed(2) + '%', b.devKeu.toFixed(2) + '%',
  ]);
  autoTable(doc, {
    head: [REKAP_HEADER], body, startY: yTabel,
    styles: { fontSize: 7, cellPadding: 1 },
    headStyles: { fillColor: [51,65,85] },
    // Baris grand total & program ditebalkan supaya pohonnya tetap terbaca di kertas.
    didParseCell: (d) => { if (d.section === 'body' && baris[d.row.index]?.tebal) d.cell.styles.fontStyle = 'bold'; },
  });
  const catatan = catatanYatim(yatim);
  if (catatan) {
    const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yTabel;
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(catatan, 380), 14, y + 8);
  }
}

export async function exportRekapPdf(params: RekapExportParams) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  gambarRekapPdf(doc, autoTable, params);
  doc.save(`Rekap-SemuaSumber-sd-${params.namaBulan}-${params.tahun}.pdf`);
}

// ─── Rekening ─────────────────────────────────────────────────────────────────

export async function exportRekeningExcel(params: { rows: RekeningRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`Rekening ${sumber}`);
  const header = ['No','Program','Kegiatan','Sub Kegiatan','Uraian SSK','Rekening Belanja','Sumber Anggaran'];
  const data   = rows.map((r,i) => [i+1, r.program??'', r.kegiatan??'', r.subkegiatan??'', r.uraian_ssk??'', r.uraian, r.sumber_anggaran??'']);
  addSheetFromAoa(ws, [header, ...data], {
    colWidths: [{ wch:5 },{ wch:40 },{ wch:20 },{ wch:25 },{ wch:25 },{ wch:25 },{ wch:18 }],
  });
  await downloadWorkbook(wb, `Rekening-${sumber}-${tahun}.xlsx`);
}

// ─── Realisasi ────────────────────────────────────────────────────────────────

// ─── Detail per sumber: susunan bersama layar / Excel / PDF ───────────────────
//
// Dipisah dari pengunduhnya (pola `rekapAoa`) supaya unduhan per-sumber DAN
// bundel gabungan memakai satu definisi. Dua definisi tabel detail cepat atau
// lambat berbeda pendapat.

export const DETAIL_HEADER = [
  'No', 'Bulan', 'Keterangan', 'Pagu', 'Target Fisik', 'Real Fisik', '% Fisik',
  'Akum Target Fisik', 'Akum Real Fisik', 'Akum % Fisik',
  'Real Keuangan', '% Real Keu', 'Akum Keuangan', 'Akum % Keuangan',
  'Deviasi Fisik %', 'Deviasi Keuangan %',
];

export function realisasiAoa(rows: RealRow[]): (string | number | null)[][] {
  return rows.map((r, i) => [
    i + 1, CRR_BULAN_LABELS[r.bulan - 1] ?? r.bulan, r.keterangan,
    r.pagu_awal, r.target_fisik, r.real_fisik, r.pct_fisik,
    r.akum_target_fisik, r.akum_real_fisik, r.akum_pct_fisik,
    r.real_keuangan, r.pct_keuangan, r.akum_keuangan, r.akum_pct_keuangan,
    r.deviasi_fisik, r.deviasi_keuangan,
  ]);
}

const DETAIL_LEBAR = [{ wch: 4 }, { wch: 14 }, { wch: 30 }, ...Array(13).fill({ wch: 14 })];


// ─── Halaman detail di PDF: kop + tabel + JUMLAH + tanda tangan ───────────────
//
// Bentuknya meniru LAYAR, bukan tabel rata seperti versi lama — supaya berkasnya
// benar-benar bisa ditandatangani dan dikirim, bukan cuma tumpukan angka.
// Dipakai bersama oleh unduhan per-sumber dan bundel gabungan.

type Dok = import('jspdf').jsPDF;
type AutoTable = typeof import('jspdf-autotable').default;

const LEBAR_A3 = 420;

/** Kop rata tengah di PDF. Balikkan `y` setelah kop supaya tabelnya menyusul. */
function tulisKopPdf(doc: Dok, kop: KopBaris[], yAwal = 14): number {
  const tengah = LEBAR_A3 / 2;
  let y = yAwal;
  for (const k of kop) {
    doc.setFontSize(k.ukuran);
    doc.setFont('helvetica', k.tebal ? 'bold' : 'normal');
    doc.text(k.teks, tengah, y, { align: 'center' });
    y += k.ukuran >= 11 ? 6 : 5;
  }
  doc.setFont('helvetica', 'normal');
  return y + 2;
}

function tandaTangan(doc: Dok, y: number, bulan: number, tahun: string) {
  doc.setFontSize(8);
  PENANDA_TANGAN.forEach((p, i) => {
    const x = LEBAR_A3 - (i === 0 ? 190 : 90);
    doc.text(`Semarang, ${CRR_BULAN_LABELS[bulan - 1] ?? ''} ${tahun}`, x, y, { align: 'center' });
    doc.text(p.peran, x, y + 4, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(p.jabatan, x, y + 22, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.line(x - 32, y + 18, x + 32, y + 18);
  });
}

/** Header 15 kolom — SAMA dengan tabel di layar (tanpa kolom Bulan; bulannya di kop). */
export const DETAIL_BULAN_HEADER = [
  'No', 'Uraian Kegiatan', 'Pagu (Rp)', 'Target Fisik', 'Real Fisik', '% Fisik',
  'Akum. Target', 'Akum. Real Fisik', 'Akum. % Fisik',
  'Real Keuangan (Rp)', '% Real Keu', 'Akum. Keuangan (Rp)', 'Akum. % Keuangan',
  'Deviasi Fisik %', 'Deviasi Keuangan %',
];

/**
 * Baris satu bulan, urutan kolom persis tabel layar. `angka: true` memulangkan
 * angka mentah (Excel — supaya tetap bisa dijumlah), `false` teks berformat (PDF).
 */
export function barisBulanDetail(rows: RealRow[], angka: boolean): (string | number)[][] {
  const n = (v: number) => angka ? v : fmtNum(v);
  const p = (v: number) => angka ? v : v.toFixed(2) + '%';
  const isi: (string | number)[][] = rows.map((r, i) => [
    i + 1, r.keterangan || '-', n(r.pagu_awal),
    p(r.target_fisik), n(r.real_fisik), p(r.pct_fisik),
    p(r.akum_target_fisik), n(r.akum_real_fisik), p(r.akum_pct_fisik),
    n(r.real_keuangan), p(r.pct_keuangan),
    n(r.akum_keuangan), p(r.akum_pct_keuangan),
    p(r.deviasi_fisik), p(r.deviasi_keuangan),
  ]);
  // Baris JUMLAH dari lib yang sama dengan layar — bukan dijumlah ulang di sini.
  const j = hitungJumlahBulan(rows);
  isi.push([
    '', 'JUMLAH', n(j.pagu), p(j.targetPct), n(j.realFisik), p(j.pctFisik),
    p(j.akumTgtPct), n(j.akumFisik), p(j.akumPctF),
    n(j.realKeu), p(j.pctKeu), n(j.akumKeu), p(j.akumPctKeu),
    p(j.devFisik), p(j.devKeu),
  ]);
  return isi;
}

/** Satu halaman per bulan. `halamanBaru` false untuk halaman pertama dokumen. */
export function gambarDetailPdf(
  doc: Dok, autoTable: AutoTable,
  rows: RealRow[], sumber: SumberSSK, tahun: string, bulanDipakai: number[],
  halamanBaru: boolean,
) {
  let perluHalaman = halamanBaru;
  for (const b of bulanDipakai) {
    const barisBulan = rows.filter(r => r.bulan === b);
    if (barisBulan.length === 0) continue;
    if (perluHalaman) doc.addPage();
    perluHalaman = true;

    const y = tulisKopPdf(doc, kopDetail(sumber, b, tahun));
    const body = barisBulanDetail(barisBulan, false) as string[][];
    autoTable(doc, {
      head: [DETAIL_BULAN_HEADER], body, startY: y,
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: [51, 65, 85] },
      didParseCell: (d) => { if (d.section === 'body' && d.row.index === body.length - 1) d.cell.styles.fontStyle = 'bold'; },
    });
    const akhir = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    tandaTangan(doc, akhir + 14, b, tahun);
  }
}

// ─── Excel: blok per bulan, meniru layar ──────────────────────────────────────

type Sheet = import('exceljs').Worksheet;

function tulisKopExcel(ws: Sheet, kop: KopBaris[], jumlahKolom: number) {
  for (const k of kop) {
    const r = ws.addRow([k.teks]);
    ws.mergeCells(r.number, 1, r.number, jumlahKolom);
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(1).font = { bold: k.tebal, size: k.ukuran };
  }
}

function tulisTandaTanganExcel(ws: Sheet, bulan: number, tahun: string, jumlahKolom: number) {
  // Ditempatkan di dua kolom terakhir supaya sejajar kanan seperti di layar.
  const kiri = Math.max(1, jumlahKolom - 5);
  const kanan = Math.max(2, jumlahKolom - 2);
  const tanggal = `Semarang, ${CRR_BULAN_LABELS[bulan - 1] ?? ''} ${tahun}`;
  const tulis = (a: string, b: string, tebal: boolean) => {
    const r = ws.addRow([]);
    for (const [kol, teks] of [[kiri, a], [kanan, b]] as [number, string][]) {
      r.getCell(kol).value = teks;
      r.getCell(kol).alignment = { horizontal: 'center' };
      r.getCell(kol).font = { bold: tebal, size: 9 };
    }
  };
  tulis(tanggal, tanggal, false);
  tulis(PENANDA_TANGAN[0].peran, PENANDA_TANGAN[1].peran, false);
  ws.addRow([]); ws.addRow([]); ws.addRow([]);
  tulis(PENANDA_TANGAN[0].jabatan, PENANDA_TANGAN[1].jabatan, true);
}

const DETAIL_BULAN_LEBAR = [{ wch: 5 }, { wch: 42 }, ...Array(13).fill({ wch: 15 })];

/**
 * Satu sheet, satu blok per bulan, dipisah page-break — BUKAN satu sheet per
 * bulan: 8 sumber x 12 bulan = 96 sheet tidak bisa dipakai siapa pun. Page break
 * membuat hasil cetaknya tetap satu bulan per halaman, sama dengan Print layar.
 */
export function tulisSheetDetailPerBulan(
  ws: Sheet, rows: RealRow[], sumber: SumberSSK, tahun: string, bulanDipakai: number[],
) {
  DETAIL_BULAN_LEBAR.forEach((w, i) => { ws.getColumn(i + 1).width = w.wch; });
  let pertama = true;
  for (const b of bulanDipakai) {
    const barisBulan = rows.filter(r => r.bulan === b);
    if (barisBulan.length === 0) continue;
    if (!pertama) ws.getRow(ws.rowCount).addPageBreak();
    pertama = false;

    tulisKopExcel(ws, kopDetail(sumber, b, tahun), DETAIL_BULAN_HEADER.length);
    ws.addRow([]);

    const rh = ws.addRow(DETAIL_BULAN_HEADER);
    rh.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    const isi = barisBulanDetail(barisBulan, true);
    isi.forEach((baris, i) => {
      const r = ws.addRow(baris);
      // Baris terakhir = JUMLAH.
      if (i === isi.length - 1) r.eachCell(c => { c.font = { bold: true }; });
    });

    ws.addRow([]);
    tulisTandaTanganExcel(ws, b, tahun, DETAIL_BULAN_HEADER.length);
    ws.addRow([]);
  }
}

export async function exportRealisasiExcel(params: { rows: RealRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  tulisSheetDetailPerBulan(wb.addWorksheet(sumber), rows, sumber, tahun, bulanBerdata(rows));
  tulisSheetData(wb, rows, sumber);
  await downloadWorkbook(wb, `Realisasi-${sumber}-${tahun}.xlsx`);
}

/**
 * Sheet "Data": tabel rata tanpa kop/JUMLAH/tanda tangan.
 *
 * Begitu sheet utama dipecah per bulan, ia berhenti jadi tabel — sort, filter,
 * dan pivot tidak bisa dipakai karena ada kop & baris JUMLAH menyelip di
 * tengah-tengah. Sheet ini mengembalikan kemampuan itu tanpa mengorbankan apa pun;
 * penyusunnya (`realisasiAoa`) memang sudah ada.
 */
export function tulisSheetData(wb: import('exceljs').Workbook, rows: RealRow[], sumber: SumberSSK) {
  const ws = wb.addWorksheet(`Data ${sumber}`.slice(0, 31));
  addSheetFromAoa(ws, [DETAIL_HEADER, ...realisasiAoa(rows)], { colWidths: DETAIL_LEBAR });
}

export async function exportRealisasiPdf(params: { rows: RealRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
  gambarDetailPdf(doc, autoTable, rows, sumber, tahun, bulanBerdata(rows), false);
  doc.save(`Realisasi-${sumber}-${tahun}.pdf`);
}

// ─── CRR ──────────────────────────────────────────────────────────────────────

export async function exportCrrExcel(params: { rows: CrrRow[]; tahun: string }) {
  const { rows, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`CRR ${tahun}`);
  const header = ['No','Bulan','Pendapatan','Belanja BLUD','Belanja Daerah','Pend. s/d','Belanja BLUD s/d','Belanja Daerah s/d','CRR Parsial %','CRR Total %'];
  const data = rows.map((r,i) => [i+1, r.bulan, r.pendapatan, r.belanja_blud, r.belanja_daerah, r.pendapatan_sd, r.belanja_blud_sd, r.belanja_daerah_sd, r.crr_parsial_pct, r.crr_total_pct]);
  addSheetFromAoa(ws, [header, ...data], {
    colWidths: [{ wch:4 },{ wch:14 },...Array(8).fill({ wch:16 })],
  });
  await downloadWorkbook(wb, `CRR-${tahun}.xlsx`);
}

// ─── Pendapatan ───────────────────────────────────────────────────────────────

export async function exportPendapatanExcel(params: { rows: PendRow[]; tahun: string }) {
  const { rows, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`Pendapatan ${tahun}`);
  const header = ['No','Keterangan','Target','Realisasi','Capaian %'];
  const data = rows.map((r,i) => [i+1, r.keterangan, r.target, r.realisasi, r.capaian_pct]);
  addSheetFromAoa(ws, [header, ...data], {
    colWidths: [{ wch:4 },{ wch:40 },{ wch:16 },{ wch:16 },{ wch:12 }],
  });
  await downloadWorkbook(wb, `Pendapatan-${tahun}.xlsx`);
}

// ─── Laporan Konsolidasi (2 sheets: Ringkasan + Trend Bulanan) ────────────────

export async function exportLaporanExcel(params: { data: LaporanSumber; tahun: string }) {
  const { data, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();

  // Sheet 1: Ringkasan
  const wsSum = wb.addWorksheet('Ringkasan');
  const sumHeader = ['Keterangan','Nilai'];
  const sumData = [
    ['Sumber Anggaran', data.sumber],
    ['Total Pagu', data.total_pagu],
    ['Total Target Fisik', data.total_target_fisik],
    ['Total Realisasi Keuangan', data.total_real_keuangan],
    ['Total Realisasi Fisik', data.total_real_fisik],
    ['% Serapan Keuangan', data.pct_serapan+'%'],
    ['% Capaian Fisik', data.pct_fisik+'%'],
    ['Bulan Terakhir Data', CRR_BULAN_LABELS[data.bulan_terakhir-1] ?? '-'],
  ];
  addSheetFromAoa(wsSum, [sumHeader, ...sumData], {
    colWidths: [{ wch: 24 }, { wch: 30 }],
  });

  // Sheet 2: Trend Bulanan
  const wsTrend = wb.addWorksheet('Trend Bulanan');
  const trendHeader = ['Bulan','Real Keuangan','% Real Keu','Akum Keuangan','Akum % Keuangan','Real Fisik','Akum % Fisik'];
  const trendData = data.trend.map(t => [
    CRR_BULAN_LABELS[t.bulan-1] ?? t.bulan,
    t.real_keuangan, t.pct_keuangan+'%', t.akum_keuangan, t.akum_pct_keuangan+'%', t.real_fisik, t.akum_pct_fisik+'%',
  ]);
  addSheetFromAoa(wsTrend, [trendHeader, ...trendData], {
    colWidths: [{ wch:14 },{ wch:16 },{ wch:14 },{ wch:16 },{ wch:16 },{ wch:16 },{ wch:14 }],
  });

  await downloadWorkbook(wb, `Laporan-${data.sumber}-${tahun}.xlsx`);
}

export async function exportLaporanPdf(params: { data: LaporanSumber; tahun: string }) {
  const { data, tahun } = params;
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  doc.setFontSize(13); doc.text(`Laporan Konsolidasi ${data.sumber} — Tahun ${tahun}`, 14, 14);
  doc.setFontSize(9);  doc.text('RSJD dr. Amino Gondohutomo', 14, 20);
  doc.setFontSize(10);
  doc.text(`Pagu: ${fmtRp(data.total_pagu)}   Real Keuangan: ${fmtRp(data.total_real_keuangan)}   Serapan: ${data.pct_serapan}%   Capaian Fisik: ${data.pct_fisik}%`, 14, 27);
  const head = [['Bulan','Real Keuangan (Rp)','% Real Keu','Akum Keuangan (Rp)','Akum % Keuangan','Real Fisik (Rp)','Akum % Fisik']];
  const body = data.trend.map(t => [
    CRR_BULAN_LABELS[t.bulan-1] ?? String(t.bulan),
    fmtNum(t.real_keuangan), t.pct_keuangan+'%', fmtNum(t.akum_keuangan), t.akum_pct_keuangan+'%',
    fmtNum(t.real_fisik), t.akum_pct_fisik+'%',
  ]);
  autoTable(doc, { head, body, startY:32, styles:{ fontSize:8, cellPadding:2 }, headStyles:{ fillColor:[51,65,85] } });
  doc.save(`Laporan-${data.sumber}-${tahun}.pdf`);
}

// ─── Master ───────────────────────────────────────────────────────────────────

/**
 * Judul sheet = TIPE master. Bukan hiasan: itu satu-satunya penanda yang dipakai
 * pembaca berkasnya (lib/data/kinerja-import-master.ts) untuk tahu sebuah nama
 * itu Program atau Kegiatan — isinya sendiri tidak membedakan.
 */
export const MASTER_SHEET: { tipe: MasterTipe; sheet: string }[] = [
  { tipe: 'program',         sheet: 'Program' },
  { tipe: 'kegiatan',        sheet: 'Kegiatan' },
  { tipe: 'subkegiatan',     sheet: 'Sub Kegiatan' },
  { tipe: 'uraian_ssk',      sheet: 'Uraian SSK' },
  { tipe: 'sumber_anggaran', sheet: 'Sumber Anggaran' },
];

export const MASTER_HEADER = ['No', 'Nama', 'Program', 'Kegiatan', 'Sub Kegiatan'];

/** Baris tiap sheet Master, dari MasterOpts yang sudah dipegang layar. */
export function masterAoa(opts: MasterOpts, tipe: MasterTipe): (string | number)[][] {
  const dariRows = (rows: MasterRow[], nama: string[]) =>
    nama.map(n => rows.find(r => r.nama === n) ?? null);

  const baris = (nama: string[], rows: (MasterRow | null)[]) =>
    nama.map((n, i) => [
      i + 1, n,
      rows[i]?.program_ref ?? '', rows[i]?.kegiatan_ref ?? '', rows[i]?.subkegiatan_ref ?? '',
    ]);

  switch (tipe) {
    case 'program':         return baris(opts.program, opts.program.map(() => null));
    case 'kegiatan':        return baris(opts.kegiatan, dariRows(opts.kegiatanRows, opts.kegiatan));
    case 'subkegiatan':     return baris(opts.subkegiatan, dariRows(opts.subkegiatanRows, opts.subkegiatan));
    case 'uraian_ssk':      return baris(opts.uraian_ssk, dariRows(opts.sskRows, opts.uraian_ssk));
    case 'sumber_anggaran': return baris(opts.sumber_anggaran, opts.sumber_anggaran.map(() => null));
  }
}

/** Satu workbook berisi KELIMA tipe — supaya sekali unduh bisa diimpor balik utuh. */
export async function exportMasterExcel(params: { opts: MasterOpts; tahun: string }) {
  const { opts, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  for (const { tipe, sheet } of MASTER_SHEET) {
    const ws = wb.addWorksheet(sheet);
    addSheetFromAoa(ws, [MASTER_HEADER, ...masterAoa(opts, tipe)], {
      colWidths: [{ wch: 5 }, { wch: 55 }, { wch: 40 }, { wch: 35 }, { wch: 35 }],
    });
  }
  await downloadWorkbook(wb, `Master-E-Anggaran-${tahun}.xlsx`);
}

// ─── Bundel: Rekap + Detail per sumber dalam SATU berkas ──────────────────────
//
// Excel = satu SHEET per bagian, bukan ditumpuk. Rekap 13 kolom, Detail 16 —
// menumpuknya di satu lembar membuat kolom tidak segaris, dan berkasnya jadi
// tidak bisa disortir/disaring/dirumuskan. Sheet memang untuk itu.
// PDF = bertumpuk, karena kertas memang bertumpuk: halaman rekap, lalu halaman
// tiap sumber lengkap dengan kop & tanda tangan.
//
// Keduanya memakai penyusun yang SAMA dengan unduhan satuan (`rekapAoa`,
// `realisasiAoa`, `gambarDetailPdf`) — yang diunduh wajib memuat angka yang
// persis sama dengan yang dilihat di layar.

export interface BagianDetail {
  sumber: SumberSSK;
  rows:   RealRow[];
  /** Bulan yang dicetak untuk sumber ini — sudah disaring pemanggil. */
  bulan:  number[];
}

export interface BundelParams extends RekapExportParams {
  detail: BagianDetail[];
}

function namaBundel(namaBulan: string, tahun: string, ext: string) {
  return `Laporan-Realisasi-${tahun}-sd-${namaBulan}.${ext}`;
}

export async function exportBundelExcel(params: BundelParams) {
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();

  const wsRekap = wb.addWorksheet('Rekap');
  addSheetFromAoa(wsRekap, rekapAoa(params), { headerRowIndex: REKAP_JUDUL_BARIS, colWidths: REKAP_LEBAR });
  rapikanSheetRekap(wsRekap, params.baris);

  for (const bagian of params.detail) {
    const baris = bagian.rows.filter(r => bagian.bulan.includes(r.bulan));
    if (baris.length === 0) continue;
    tulisSheetDetailPerBulan(wb.addWorksheet(bagian.sumber), baris, bagian.sumber, params.tahun, bagian.bulan);
    tulisSheetData(wb, baris, bagian.sumber);
  }

  await downloadWorkbook(wb, namaBundel(params.namaBulan, params.tahun, 'xlsx'));
}

export async function exportBundelPdf(params: BundelParams) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  gambarRekapPdf(doc, autoTable, params);

  for (const bagian of params.detail) {
    const baris = bagian.rows.filter(r => bagian.bulan.includes(r.bulan));
    if (baris.length === 0) continue;
    // halamanBaru = true: tiap sumber selalu mulai di halaman sendiri.
    gambarDetailPdf(doc, autoTable, baris, bagian.sumber, params.tahun, bagian.bulan, true);
  }

  doc.save(namaBundel(params.namaBulan, params.tahun, 'pdf'));
}
