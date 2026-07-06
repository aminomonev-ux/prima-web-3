'use client';

import type { RaRow } from './types';
import { realisasiAkhirTahun, quartersOf, LEVEL_LABELS, outcomeOf, hitungCapaianPct } from './types';
import type { CetakFilter } from './cetak-filter';
import { DEFAULT_CETAK_FILTER, buildCetakRows, cetakRollupBase, cetakHeader } from './cetak-filter';
import { sanitizeCell } from '@/lib/shared/excel-export';

let _pdf: Promise<{ jsPDF: typeof import('jspdf').jsPDF; autoTable: typeof import('jspdf-autotable').default }> | null = null;
function loadPdf() {
  if (!_pdf) _pdf = Promise.all([import('jspdf'), import('jspdf-autotable')])
    .then(([pdf, table]) => ({ jsPDF: pdf.jsPDF, autoTable: table.default }));
  return _pdf;
}

let _xlsx: Promise<typeof import('exceljs')> | null = null;
function loadXlsx() {
  if (!_xlsx) _xlsx = import('exceljs');
  return _xlsx;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

// ─── Export tabel list (Data Entry) ─────────────────────────────────────────

export async function exportListPdf(rows: RaRow[], tahun: number, level: RaRow['level']) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(13);
  doc.text(`${LEVEL_LABELS[level]} — Tahun ${tahun}`, 14, 14);
  doc.setFontSize(9);
  doc.text(`Total ${rows.length} indikator`, 14, 20);

  autoTable(doc, {
    startY: 25,
    head: [['No', 'Program/Sasaran', 'Kegiatan', 'Sub Kegiatan', 'Sasaran (Outcome)', 'Indikator', 'Jenis', 'Satuan', 'RPJMD', 'Tahunan', 'TW1 R/T', 'TW2 R/T', 'TW3 R/T', 'TW4 R/T']],
    body: rows.map((r, i) => [
      i + 1,
      r.program,
      r.kegiatan ?? '-',
      r.sub_kegiatan ?? '-',
      outcomeOf(r) || '-',
      r.indikator,
      r.jenis,
      r.satuan,
      r.target_rpjmd,
      r.target_tahunan,
      `${r.q1_realisasi}/${r.q1_target}`,
      `${r.q2_realisasi}/${r.q2_target}`,
      `${r.q3_realisasi}/${r.q3_target}`,
      `${r.q4_realisasi}/${r.q4_target}`,
    ]),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [239, 159, 39], textColor: 255, fontSize: 7 },
    columnStyles: { 0: { cellWidth: 8 }, 4: { cellWidth: 40 }, 5: { cellWidth: 45 } },
  });

  doc.save(`rencana-aksi-${level}-${tahun}.pdf`);
}

export async function exportListXlsx(rows: RaRow[], tahun: number, level: RaRow['level']) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(LEVEL_LABELS[level]);

  ws.columns = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'Program/Sasaran', key: 'program', width: 35 },
    { header: 'Kegiatan', key: 'kegiatan', width: 30 },
    { header: 'Sub Kegiatan', key: 'sub', width: 30 },
    { header: 'Sasaran (Outcome)', key: 'outcome', width: 38 },
    { header: 'Indikator', key: 'indikator', width: 40 },
    { header: 'Jenis', key: 'jenis', width: 14 },
    { header: 'Satuan', key: 'satuan', width: 10 },
    { header: 'Target RPJMD', key: 'rpjmd', width: 13 },
    { header: 'Target Tahunan', key: 'tahunan', width: 14 },
    { header: 'TW1 Target', key: 'q1t', width: 10 },
    { header: 'TW1 Realisasi', key: 'q1r', width: 12 },
    { header: 'TW2 Target', key: 'q2t', width: 10 },
    { header: 'TW2 Realisasi', key: 'q2r', width: 12 },
    { header: 'TW3 Target', key: 'q3t', width: 10 },
    { header: 'TW3 Realisasi', key: 'q3r', width: 12 },
    { header: 'TW4 Target', key: 'q4t', width: 10 },
    { header: 'TW4 Realisasi', key: 'q4r', width: 12 },
    { header: 'Real Akhir', key: 'akhir', width: 12 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF9F27' } };

  rows.forEach((r, i) => {
    ws.addRow({
      no: i + 1, program: sanitizeCell(r.program), kegiatan: sanitizeCell(r.kegiatan ?? ''), sub: sanitizeCell(r.sub_kegiatan ?? ''),
      outcome: sanitizeCell(outcomeOf(r)),
      indikator: sanitizeCell(r.indikator), jenis: sanitizeCell(r.jenis), satuan: sanitizeCell(r.satuan),
      rpjmd: r.target_rpjmd, tahunan: r.target_tahunan,
      q1t: r.q1_target, q1r: r.q1_realisasi,
      q2t: r.q2_target, q2r: r.q2_realisasi,
      q3t: r.q3_target, q3r: r.q3_realisasi,
      q4t: r.q4_target, q4r: r.q4_realisasi,
      akhir: realisasiAkhirTahun(r),
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${level}-${tahun}.xlsx`);
}

// ─── Export gabungan hierarki (Menu Cetak) ─────────────────────────────────
// Filter-aware: kolom & baris ikut `CetakFilter` (sumber: _lib/cetak-filter.ts)
// supaya hasil PDF/Excel = yang tampil di layar. Header bergrup: lead (rowSpan 2)
// · grup TW (colSpan = jumlah sub T/R aktif) · tail. Tanpa Triwulan → 1 baris datar.

function xlsxColWidth(key: string): number {
  if (key === 'no') return 5;
  if (key === 'indikator' || key === 'outcome') return 38;
  if (key === 'tujuan' || key === 'sasaran' || key === 'program' || key === 'kegiatan' || key === 'sub_kegiatan') return 28;
  if (key === 'anggaran') return 16;
  if (key === 'jenis') return 14;
  return 10;
}

export async function buildCombinedPdf(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(15);
  doc.text(`Renaksi & Kinerja — Tahun ${tahun}`, 14, 14);
  doc.setFontSize(9);
  doc.text('Tujuan → Sasaran → Program → Kegiatan → Sub Kegiatan', 14, 20);

  const hier = buildCetakRows(allRows, filter);
  if (!hier.length) {
    doc.setFontSize(10);
    doc.setTextColor(140);
    doc.text('— Belum ada data —', 14, 34);
    return doc;
  }
  const rollup = cetakRollupBase(allRows, filter);
  const hdr = cetakHeader(filter);

  const head = hdr.twQuarters.length
    ? [
        [
          ...hdr.lead.map(c => ({ content: c.header, rowSpan: 2 })),
          ...hdr.twQuarters.map(t => ({ content: `TW${t.q}`, colSpan: t.sub.length })),
          ...hdr.tail.map(c => ({ content: c.header, rowSpan: 2 })),
        ],
        hdr.twQuarters.flatMap(t => t.sub.map(s => s.header)),
      ]
    : [[...hdr.lead, ...hdr.tail].map(c => c.header)];

  autoTable(doc, {
    startY: 26,
    head,
    body: hier.map(h => hdr.flat.map(c => {
      const v = c.value(h, rollup);
      if (v == null) return '';
      if (c.money && typeof v === 'number') return v.toLocaleString('id-ID');
      return v;
    })),
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [124, 92, 252], textColor: 255, fontSize: 7, halign: 'center' },
    columnStyles: { 0: { cellWidth: 8 } },
  });

  return doc;
}

export async function exportCombinedPdf(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const doc = await buildCombinedPdf(allRows, tahun, filter);
  doc.save(`rencana-aksi-${tahun}-gabungan.pdf`);
}

export async function exportCombinedXlsx(allRows: RaRow[], tahun: number, filter: CetakFilter = DEFAULT_CETAK_FILTER) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Renaksi & Kinerja');

  const hier = buildCetakRows(allRows, filter);
  const rollup = cetakRollupBase(allRows, filter);
  const hdr = cetakHeader(filter);
  const flat = hdr.flat;

  // Kolom (key + lebar) tanpa header — header 2 baris di-set manual + merge.
  ws.columns = flat.map(c => ({ key: c.key, width: xlsxColWidth(c.key) }));

  const r1 = ws.getRow(1), r2 = ws.getRow(2);
  let col = 1;
  for (const c of hdr.lead) { r1.getCell(col).value = c.header; ws.mergeCells(1, col, 2, col); col++; }
  for (const t of hdr.twQuarters) {
    if (t.sub.length === 1) {
      // 1 sub (Target ATAU Realisasi saja) → label gabung "TWn T/R", merge vertikal.
      r1.getCell(col).value = `TW${t.q} ${t.sub[0].header}`;
      ws.mergeCells(1, col, 2, col);
      col++;
    } else {
      r1.getCell(col).value = `TW${t.q}`;
      ws.mergeCells(1, col, 1, col + t.sub.length - 1);
      t.sub.forEach((s, i) => { r2.getCell(col + i).value = s.header; });
      col += t.sub.length;
    }
  }
  for (const c of hdr.tail) { r1.getCell(col).value = c.header; ws.mergeCells(1, col, 2, col); col++; }

  for (let cc = 1; cc <= flat.length; cc++) {
    for (const rr of [r1, r2]) {
      const cell = rr.getCell(cc);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C5CFC' } };
    }
  }

  // Data mulai baris 3 (baris 1-2 = header bergrup).
  let dataIdx = 3;
  for (const h of hier) {
    const row = ws.getRow(dataIdx++);
    for (const c of flat) {
      const v = c.value(h, rollup);
      row.getCell(c.key).value = typeof v === 'string' ? sanitizeCell(v) : v;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${tahun}-gabungan.xlsx`);
}

// ─── Export 1 indikator (Dashboard Kinerja) ────────────────────────────────

export async function exportIndikatorPdf(row: RaRow) {
  const { jsPDF, autoTable } = await loadPdf();
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const realAkhir = realisasiAkhirTahun(row);
  // R4: Progres Negatif dibalik via hitungCapaianPct
  const pctTh = hitungCapaianPct(row.target_tahunan, realAkhir, row.jenis);
  const pctRp = hitungCapaianPct(row.target_rpjmd, realAkhir, row.jenis);

  doc.setFontSize(13);
  doc.text(`${LEVEL_LABELS[row.level]} — Tahun ${row.tahun}`, 14, 14);
  doc.setFontSize(10);
  doc.text(row.indikator, 14, 22, { maxWidth: 180 });

  autoTable(doc, {
    startY: 35,
    body: [
      ['Program/Sasaran', row.program],
      ['Kegiatan', row.kegiatan ?? '-'],
      ['Sub Kegiatan', row.sub_kegiatan ?? '-'],
      ['Sasaran (Outcome)', outcomeOf(row) || '-'],
      ['Jenis', row.jenis],
      ['Satuan', row.satuan],
      ['Target RPJMD', String(row.target_rpjmd)],
      ['Target Tahunan', String(row.target_tahunan)],
      ['Realisasi Akhir Tahun', String(realAkhir)],
      ['Capaian Tahunan (%)', pctTh.toFixed(2) + '%'],
      ['Capaian RPJMD (%)', pctRp.toFixed(2) + '%'],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  });

  const qStart = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: qStart,
    head: [['Triwulan', 'Target', 'Realisasi', 'Capaian (%)']],
    body: quartersOf(row).map(q => {
      const pct = q.target > 0 ? hitungCapaianPct(q.target, q.realisasi, row.jenis) : null;
      return [`TW ${q.id}`, q.target, q.realisasi, pct === null ? '-' : pct.toFixed(2) + '%'];
    }),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [239, 159, 39] },
  });

  doc.save(`rencana-aksi-${row.level}-${row.tahun}-detail.pdf`);
}

export async function exportIndikatorXlsx(row: RaRow) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Detail Indikator');

  const realAkhir = realisasiAkhirTahun(row);
  const meta: [string, string | number][] = [
    ['Tahun', row.tahun],
    ['Level', LEVEL_LABELS[row.level]],
    ['Program/Sasaran', row.program],
    ['Kegiatan', row.kegiatan ?? '-'],
    ['Sub Kegiatan', row.sub_kegiatan ?? '-'],
    ['Sasaran (Outcome)', outcomeOf(row) || '-'],
    ['Indikator', row.indikator],
    ['Jenis', row.jenis],
    ['Satuan', row.satuan],
    ['Target RPJMD', row.target_rpjmd],
    ['Target Tahunan', row.target_tahunan],
    ['Realisasi Akhir', realAkhir],
  ];
  meta.forEach(([k, v]) => {
    const r = ws.addRow([k, sanitizeCell(v)]);
    r.getCell(1).font = { bold: true };
  });
  ws.addRow([]);
  const head = ws.addRow(['Triwulan', 'Target', 'Realisasi', 'Capaian %']);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF9F27' } };
  quartersOf(row).forEach(q => {
    const pct = hitungCapaianPct(q.target, q.realisasi, row.jenis);
    ws.addRow([`TW ${q.id}`, q.target, q.realisasi, pct]);
  });
  ws.getColumn(1).width = 25;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${row.level}-${row.tahun}-detail.xlsx`);
}

// ─── Matriks Bulanan: export template + parse import ────────────────────────
// Layout tetap (kolom A..R): ID | Program | Kegiatan | Sub Kegiatan | Indikator |
// Satuan | Jan..Des. Import mencocokkan baris via kolom ID.

const MATRIX_HEAD = ['ID', 'Program', 'Kegiatan', 'Sub Kegiatan', 'Indikator', 'Satuan',
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export async function exportMatrixBulananXlsx(rows: RaRow[], tahun: number) {
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Realisasi Bulanan ${tahun}`);
  const head = ws.addRow(MATRIX_HEAD);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C5CFC' } };
  for (const r of rows) {
    const months = Array.isArray(r.bulan_realisasi) && r.bulan_realisasi.length === 12
      ? r.bulan_realisasi : Array(12).fill(null);
    ws.addRow([
      r.id, sanitizeCell(r.program), sanitizeCell(r.kegiatan ?? ''), sanitizeCell(r.sub_kegiatan ?? ''),
      sanitizeCell(r.indikator), sanitizeCell(r.satuan),
      // R3: sel kosong = belum diisi, 0 = nol nyata
      ...months.map(m => (m == null ? null : m)),
    ]);
  }
  ws.getColumn(1).width = 8;
  [2, 3, 4].forEach(c => { ws.getColumn(c).width = 28; });
  ws.getColumn(5).width = 45;
  ws.getColumn(6).width = 10;
  for (let c = 7; c <= 18; c++) ws.getColumn(c).width = 8;
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `rencana-aksi-${tahun}-realisasi-bulanan.xlsx`);
}

/**
 * Parse file import Matriks Bulanan → Map id → 12 nilai (null = kosong).
 * Guard: ≤5MB, sheet pertama saja + cap jumlah sheet (L67 anti zip-bomb),
 * header wajib sama dengan template.
 */
export async function parseMatrixBulananXlsx(file: File): Promise<Map<number, (number | null)[]>> {
  if (file.size > 5 * 1024 * 1024) throw new Error('File terlalu besar (maks 5 MB)');
  const ExcelJS = await loadXlsx();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  if (wb.worksheets.length > 10) throw new Error('File tidak valid (terlalu banyak sheet)');
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Sheet pertama tidak ditemukan');
  const h = ws.getRow(1);
  if (String(h.getCell(1).value ?? '').trim().toUpperCase() !== 'ID'
    || String(h.getCell(7).value ?? '').trim() !== 'Jan') {
    throw new Error('Format tidak dikenali — pakai file hasil "Unduh Excel" dari matriks ini');
  }
  const out = new Map<number, (number | null)[]>();
  const maxRow = Math.min(ws.rowCount, 1001);
  for (let i = 2; i <= maxRow; i++) {
    const row = ws.getRow(i);
    const id = Number(row.getCell(1).value);
    if (!Number.isInteger(id) || id <= 0) continue;
    const months: (number | null)[] = [];
    for (let c = 7; c <= 18; c++) {
      const v = row.getCell(c).value;
      if (v == null || v === '') { months.push(null); continue; }
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      months.push(Number.isFinite(n) && n >= 0 ? n : null);
    }
    out.set(id, months);
  }
  if (out.size === 0) throw new Error('Tidak ada baris data yang bisa dibaca dari file');
  return out;
}
