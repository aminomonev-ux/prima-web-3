// lib/iki/export-excel.ts
// Export Excel dokumen IKI via exceljs (dynamic import lewat loadExcelJs).
// Grid identik export-pdf.ts — sama-sama dari lib/iki/layout.ts (CONCEPT-iki §5):
// header abu + baris penomoran, border thin seluruh area tabel, merge rowspan/colspan,
// blok Data Pribadi & ttd tanpa border, print setup landscape fitToWidth.
import type ExcelJS from 'exceljs';
import { loadExcelJs, sanitizeCell, downloadWorkbook } from '@/lib/shared/excel-export';
import { buildIkiGrid, buildTtd, ikiFilename, type IkiGridDokumen, type TtdBlock } from './layout';

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' },
  left: { style: 'thin' }, right: { style: 'thin' },
};
const GREY_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };

export async function exportIkiExcel(doc: IkiGridDokumen, tahun: string): Promise<void> {
  if (doc.rhk.length === 0) throw new Error('Belum ada baris RHK — tidak ada yang bisa di-export');

  const ExcelJSLib = await loadExcelJs();
  const wb = new ExcelJSLib.Workbook();
  const ws = wb.addWorksheet(`IKI ${tahun}`, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const grid = buildIkiGrid(doc);
  grid.xlsxWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const setCell = (r: number, c: number, text: string, opts?: {
    bold?: boolean; center?: boolean; middle?: boolean; wrap?: boolean; grey?: boolean; border?: boolean;
  }) => {
    const cell = ws.getCell(r, c);
    cell.value = sanitizeCell(text);
    cell.font = { name: 'Calibri', size: 9, bold: opts?.bold ?? false };
    cell.alignment = {
      horizontal: opts?.center ? 'center' : 'left',
      vertical: opts?.middle ? 'middle' : 'top',
      wrapText: opts?.wrap ?? true,
    };
    if (opts?.grey) cell.fill = GREY_FILL;
    if (opts?.border) cell.border = THIN;
    return cell;
  };

  // ── Judul ──
  let row = 1;
  ws.mergeCells(row, 1, row, grid.colCount);
  setCell(row, 1, 'INDIKATOR KINERJA INDIVIDU', { bold: true, center: true, middle: true });
  row += 2;

  // ── I. DATA PRIBADI (tanpa border) ──
  setCell(row, 1, 'I', { bold: true });
  ws.mergeCells(row, 2, row, grid.colCount);
  setCell(row, 2, 'DATA PRIBADI', { bold: true });
  row++;
  const pribadi: Array<[string, string]> = [
    ['OPD', doc.opd],
    ['Nama', doc.nama],
    ['NIP', doc.nip],
    ['Jabatan', doc.jabatan],
    ['Ikhtisar', doc.ikhtisar ?? ''],
  ];
  for (const [label, value] of pribadi) {
    setCell(row, 2, label);
    setCell(row, 3, ':', { center: true });
    ws.mergeCells(row, 4, row, grid.colCount);
    setCell(row, 4, value);
    if (label === 'Ikhtisar' && value.length > 120) ws.getRow(row).height = 30;
    row++;
  }
  row++;

  // ── II. FORM ──
  setCell(row, 1, 'II', { bold: true });
  ws.mergeCells(row, 2, row, grid.colCount);
  setCell(row, 2, 'FORM INDIKATOR KINERJA INDIVIDU', { bold: true });
  row++;

  // ── Header tabel (3 baris: label + sub + penomoran) ──
  const headStart = row;
  // Baris 1+2 (label utama + Uraian|Target). head[0] berisi rowSpan/colSpan;
  // head[1] hanya sel sisa (Uraian, Target) — hitung posisi kolomnya dari head[0].
  let c = 1;
  const row2Cols: number[] = [];
  for (const cell of grid.head[0]) {
    const span = cell.colSpan ?? 1;
    const r2 = (cell.rowSpan ?? 1) >= 2 ? headStart + 1 : headStart;
    ws.mergeCells(headStart, c, r2, c + span - 1);
    setCell(headStart, c, cell.text, { bold: true, center: true, middle: true, grey: true, border: true });
    if ((cell.rowSpan ?? 1) === 1) {
      // Sel yang TIDAK span 2 baris → baris 2 di kolom yang sama diisi head[1]
      for (let k = 0; k < span; k++) row2Cols.push(c + k);
    }
    c += span;
  }
  grid.head[1].forEach((cell, i) => {
    const col = row2Cols[i];
    if (col == null) return;
    setCell(headStart + 1, col, cell.text, { bold: true, center: true, middle: true, grey: true, border: true });
  });
  // Baris 3: penomoran kolom
  c = 1;
  for (const cell of grid.head[2]) {
    const span = cell.colSpan ?? 1;
    if (span > 1) ws.mergeCells(headStart + 2, c, headStart + 2, c + span - 1);
    setCell(headStart + 2, c, cell.text, { bold: true, center: true, middle: true, grey: true, border: true });
    c += span;
  }
  // Border seluruh sel header (termasuk yang tertutup merge)
  for (let r = headStart; r <= headStart + 2; r++) {
    for (let col = 1; col <= grid.colCount; col++) {
      ws.getCell(r, col).border = THIN;
      if (!ws.getCell(r, col).fill || (ws.getCell(r, col).fill as ExcelJS.FillPattern).pattern !== 'solid') {
        ws.getCell(r, col).fill = GREY_FILL;
      }
    }
  }
  row = headStart + 3;

  // ── Body ──
  const bodyStart = row;
  grid.body.forEach((bodyRow, ri) => {
    let col = 1;
    for (const cell of bodyRow) {
      if (cell !== null) {
        if ((cell.rowSpan ?? 1) > 1) {
          ws.mergeCells(bodyStart + ri, col, bodyStart + ri + (cell.rowSpan ?? 1) - 1, col);
        }
        setCell(bodyStart + ri, col, cell.text, {
          center: cell.align === 'center',
          border: true,
        });
      }
      col++;
    }
  });
  // Border seluruh area body (sel tertutup merge ikut ber-border)
  const bodyEnd = bodyStart + grid.body.length - 1;
  for (let r = bodyStart; r <= bodyEnd; r++) {
    for (let col = 1; col <= grid.colCount; col++) {
      ws.getCell(r, col).border = THIN;
    }
  }
  row = bodyEnd + 3;

  // ── Blok tanda tangan (tanpa border) ──
  const { kiri, kanan } = buildTtd(doc);
  const writeTtd = (block: TtdBlock, colStart: number, colEnd: number) => {
    let r = row;
    for (const line of block.lines.filter(Boolean)) {
      ws.mergeCells(r, colStart, r, colEnd);
      setCell(r, colStart, line, { center: true });
      r++;
    }
    r += 4; // ruang ttd basah
    ws.mergeCells(r, colStart, r, colEnd);
    const namaCell = setCell(r, colStart, block.nama, { bold: true, center: true });
    namaCell.font = { ...namaCell.font, underline: true };
    r++;
    if (block.pangkat) {
      ws.mergeCells(r, colStart, r, colEnd);
      setCell(r, colStart, block.pangkat, { center: true });
      r++;
    }
    if (block.nip) {
      ws.mergeCells(r, colStart, r, colEnd);
      setCell(r, colStart, block.nip, { center: true });
      r++;
    }
    return r;
  };
  const mid = Math.floor(grid.colCount / 2);
  if (kiri) {
    const endKiri = writeTtd(kiri, 2, mid);
    writeTtd(kanan, mid + 2, grid.colCount);
    row = endKiri;
  } else {
    writeTtd(kanan, mid + 1, grid.colCount);
  }

  await downloadWorkbook(wb, ikiFilename(doc, tahun, 'xlsx'));
}
