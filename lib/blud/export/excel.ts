// lib/blud/export/excel.ts
// Excel export untuk menu Cetak BLUD via exceljs (support cell styling).
// SDL-Audit v1.1 Phase 4: migrate dari xlsx-js-style (CVE prototype pollution + ReDoS) ke exceljs.
// PERF-C3 anti-pattern compliance: dynamic import dari client (cetak-client.tsx).

import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import type ExcelJS from 'exceljs'
import type { ExportRow } from '@/lib/blud/cetak-data'

export interface ExportExcelArgs {
  menu:    string
  view:    string
  tanggal: string
  versi:   string | null
  rows:    unknown
}

export async function exportToExcel(args: ExportExcelArgs): Promise<void> {
  const { menu, view, versi, tanggal, rows } = args
  const exportRows = (rows as ExportRow[]) ?? []
  if (!Array.isArray(exportRows) || exportRows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa di-export')
  }

  const ExcelJSLib = await loadExcelJs()
  const { title, columns, sheetName, numberColIdx } = buildMeta(menu, view, versi, tanggal)

  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(sheetName)

  // Header row (row 1)
  ws.addRow(columns)
  for (let c = 0; c < columns.length; c++) {
    const cell = ws.getRow(1).getCell(c + 1)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1855BB' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = borderAll('FFFFFFFF')
  }

  // Data rows (row 2+)
  exportRows.forEach((rowData, rIdx) => {
    const r = ws.addRow(rowData.map(c => sanitizeCell(c ?? '')))
    for (let c = 0; c < columns.length; c++) {
      const cell = r.getCell(c + 1)
      const isNumCol = numberColIdx.has(c)
      cell.font = { size: 10 }
      cell.alignment = isNumCol
        ? { horizontal: 'right' }
        : { horizontal: 'left', vertical: 'top', wrapText: true }
      if (isNumCol) cell.numFmt = '#,##0'
      cell.border = borderAll('FFBFBFBF')
    }
    void rIdx
  })

  // Column widths
  ws.columns = columns.map((col, i): Partial<ExcelJS.Column> => {
    void col
    if (i === 0) return { width: 14 }
    if (i === 1) return { width: 40 }
    if (numberColIdx.has(i)) return { width: 14 }
    return { width: 12 }
  })

  const tag = (versi || tanggal || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
  const filename = `${slug(title)}_${tag}.xlsx`
  await downloadWorkbook(wb, filename)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMeta(menu: string, view: string, versi: string | null, tanggal: string) {
  const dateLabel = versi ?? tanggal ?? 'Terbaru'

  if (menu === 'dpa' && view === 'dpa') {
    return {
      title: `Rekap DPA BLUD ${dateLabel}`,
      sheetName: 'DPA BLUD',
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Penanggung Jawab', 'Keterangan'],
      numberColIdx: new Set([2, 4, 5]),
    }
  }
  if (menu === 'dpa' && view === 'penanggungJawab') {
    return {
      title: `Rekap Penanggung Jawab ${dateLabel}`,
      sheetName: 'Rekap PJ',
      columns: ['Penanggung Jawab', 'Uraian', 'Jumlah'],
      numberColIdx: new Set([2]),
    }
  }
  if (menu === 'pergeseran' && view === 'rekapPergeseran') {
    return {
      title: `Rekap Pergeseran ${dateLabel}`,
      sheetName: 'Pergeseran',
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran', 'Bertambah/Berkurang'],
      numberColIdx: new Set([2, 4, 5, 6, 7, 8, 9]),
    }
  }
  return {
    title: 'Rekap Master Akun',
    sheetName: 'Master Akun',
    columns: ['Kode', 'Uraian'],
    numberColIdx: new Set<number>(),
  }
}

function borderAll(argb: string): Partial<ExcelJS.Borders> {
  const side = { style: 'thin' as const, color: { argb } }
  return { top: side, bottom: side, left: side, right: side }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
