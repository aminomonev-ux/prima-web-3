// ─── PRIMA E-Anggaran — XLSX & PDF Export Functions ────────────────────────────
// O2 + PERF-C3: 8 export fn (Excel via exceljs + PDF via jspdf+autotable).
// SDL-Audit v1.1 Phase 4: migrate xlsx-js-style → exceljs (CVE prototype pollution + ReDoS).
// Dynamic import: library hanya di-load saat user pertama kali klik tombol export, lalu cached.
// Bundle initial /kinerja TIDAK termasuk library ini.

import { fmtRp, fmtNumDisplay as fmtNum } from '@/lib/shared/utils';
import { loadExcelJs, addSheetFromAoa, downloadWorkbook } from '@/lib/shared/excel-export';
import type {
  SumberSSK, SskRow, RekeningRow, RealRow, CrrRow, PendRow, LaporanSumber,
} from './_types';
import { MONTHS_KEYS, MONTH_SHORT, CRR_BULAN_LABELS } from './_utils';

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

export async function exportRealisasiExcel(params: { rows: RealRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`Realisasi ${sumber}`);
  const header = ['No','Bulan','Keterangan','Pagu','Target Fisik','Real Fisik','% Fisik',
    'Akum Target Fisik','Akum Real Fisik','Akum % Fisik',
    'Real Keuangan','% Real Keu','Akum Keuangan','Akum % Keuangan','Deviasi Fisik %','Deviasi Keuangan %'];
  const data = rows.map((r,i) => [
    i+1, CRR_BULAN_LABELS[r.bulan-1] ?? r.bulan, r.keterangan,
    r.pagu_awal, r.target_fisik, r.real_fisik, r.pct_fisik,
    r.akum_target_fisik, r.akum_real_fisik, r.akum_pct_fisik,
    r.real_keuangan, r.pct_keuangan, r.akum_keuangan, r.akum_pct_keuangan,
    r.deviasi_fisik, r.deviasi_keuangan,
  ]);
  addSheetFromAoa(ws, [header, ...data], {
    colWidths: [{ wch:4 },{ wch:14 },{ wch:30 },...Array(13).fill({ wch:14 })],
  });
  await downloadWorkbook(wb, `Realisasi-${sumber}-${tahun}.xlsx`);
}

export async function exportRealisasiPdf(params: { rows: RealRow[]; sumber: SumberSSK; tahun: string }) {
  const { rows, sumber, tahun } = params;
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a3' });
  doc.setFontSize(13); doc.text(`Realisasi ${sumber} — Tahun ${tahun}`, 14, 14);
  doc.setFontSize(9);  doc.text('RSJD dr. Amino Gondohutomo', 14, 20);
  const head = [['No','Bulan','Keterangan','Pagu','Tgt Fisik','Real Fisik','% Fisik','Akum Tgt','Akum Real','Akum %','Real Keu','% Real Keu','Akum Keu','Akum % Keu','Dev Fisik %','Dev Keu %']];
  const body = rows.map((r,i) => [
    String(i+1), CRR_BULAN_LABELS[r.bulan-1] ?? String(r.bulan), r.keterangan,
    fmtNum(r.pagu_awal), fmtNum(r.target_fisik), fmtNum(r.real_fisik), r.pct_fisik+'%',
    String(r.akum_target_fisik.toFixed(2))+'%', fmtNum(r.akum_real_fisik), r.akum_pct_fisik+'%',
    fmtNum(r.real_keuangan), r.pct_keuangan+'%', fmtNum(r.akum_keuangan), r.akum_pct_keuangan+'%',
    r.deviasi_fisik+'%', r.deviasi_keuangan+'%',
  ]);
  autoTable(doc, { head, body, startY:24, styles:{ fontSize:7, cellPadding:1 }, headStyles:{ fillColor:[51,65,85] } });
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
