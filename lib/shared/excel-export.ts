// ─── PRIMA — Shared Excel Export Helpers (exceljs) ───────────────────────────
// SDL-Audit v1.1 Phase 4: migrate dari xlsx-js-style (CVE prototype pollution + ReDoS) ke exceljs.
// Helper abstrak pola umum: build sheet dari AOA, style header, set col widths, trigger download.

import type ExcelJS from 'exceljs';

// Dynamic import — exceljs ~600KB, hanya load saat user klik tombol export.
let _exceljsPromise: Promise<typeof import('exceljs')> | null = null;
export function loadExcelJs() {
  if (!_exceljsPromise) _exceljsPromise = import('exceljs');
  return _exceljsPromise;
}

const FORMULA_LEAD_RE = /^[=+\-@\t\r]/;
/**
 * Anti CSV/formula-injection (OWASP / CWE-1236): nilai teks yang diawali
 * `= + - @` (atau TAB/CR) diberi prefix apostrof agar Excel/Sheets menampilkan
 * apa adanya sebagai teks, BUKAN mengeksekusi sebagai formula. Angka, null,
 * boolean, dan Date dibiarkan (bukan vektor injection).
 */
export function sanitizeCell<T>(val: T): T | string {
  return typeof val === 'string' && FORMULA_LEAD_RE.test(val) ? `'${val}` : val;
}

export type ColWidth = { wch: number };

/** Header style default: bold + fill abu-abu (E2E8F0) + center align + wrap text. */
export const DEFAULT_HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
};

/**
 * Tambah AOA (Array of Arrays) ke worksheet, style header row, set column widths.
 * AOA[0] = header row, AOA[1..] = data rows.
 */
export function addSheetFromAoa(
  ws: ExcelJS.Worksheet,
  aoa: (string | number | null | undefined)[][],
  options?: {
    colWidths?: ColWidth[];
    headerStyle?: Partial<ExcelJS.Style>;
  },
) {
  if (aoa.length === 0) return;
  // Add rows
  for (const row of aoa) {
    ws.addRow(row.map(sanitizeCell));
  }
  // Style header (row 1)
  const headerStyle = options?.headerStyle ?? DEFAULT_HEADER_STYLE;
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    Object.assign(cell, headerStyle);
  });
  // Column widths
  if (options?.colWidths) {
    options.colWidths.forEach((w, i) => {
      ws.getColumn(i + 1).width = w.wch;
    });
  }
}

/**
 * Trigger download workbook as .xlsx file via Blob + anchor (browser-only).
 * Pengganti `XLSX.writeFile()` lama.
 */
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parse uploaded xlsx file → AOA (Array of Arrays) untuk import flow.
 * Pengganti `XLSX.read(buf) + sheet_to_json({header:1})` lama.
 */
export async function readXlsxAsAoa(file: File): Promise<unknown[][]> {
  const ExcelJSLib = await loadExcelJs();
  const buf = await file.arrayBuffer();
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const aoa: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // row.values: [, c1, c2, ...] (index 0 = empty per exceljs convention)
    const values = row.values as unknown[];
    aoa.push(values.slice(1).map(v => v ?? ''));
  });
  return aoa;
}
