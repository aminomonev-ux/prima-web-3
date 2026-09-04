// lib/blud/export/excel.ts
// Excel export untuk menu Cetak BLUD via exceljs (support cell styling).
// SDL-Audit v1.1 Phase 4: migrate dari xlsx-js-style (CVE prototype pollution + ReDoS) ke exceljs.
// PERF-C3 anti-pattern compliance: dynamic import dari client (cetak-client.tsx).

import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import type ExcelJS from 'exceljs'
import type { ExportRow } from '@/lib/blud/cetak-data'
import { arahDelta, HEX_NAIK, HEX_TURUN } from '@/lib/blud/export/warna-delta'

/** Warna teks sel delta dalam bentuk ARGB exceljs, atau `null` kalau tak berwarna. */
function warnaDelta(namaKolom: string | undefined, nilai: unknown): string | null {
  const arah = namaKolom ? arahDelta(namaKolom, nilai) : null
  return arah === 'naik' ? `FF${HEX_NAIK}` : arah === 'turun' ? `FF${HEX_TURUN}` : null
}

export interface ExportExcelArgs {
  menu:    string
  view:    string
  tanggal: string
  versi:   string | null
  rows:    unknown
  /**
   * Keterangan cakupan, ditulis sebagai baris pertama di atas kepala tabel.
   * WAJIB diisi kalau `rows` sudah disaring — angka pada baris induk tetap pagu
   * penuh, jadi berkas yang membuang baris tanpa mengatakannya akan dijumlah
   * ulang oleh penerimanya dan tidak akan cocok.
   */
  catatan?: string
  /**
   * Kepala tabel & judul dari `renderCetakHtml().meta` — view yang sama yang
   * menyusun barisnya. Dikirim pemanggil supaya daftar kolom punya SATU sumber:
   * `buildMeta` di bawah pernah ketinggalan dua kolom waktu Bertambah/Berkurang
   * ditambahkan (L86), dan nama kolom berhenti menerangkan angka di bawahnya
   * tanpa satu galat pun. `buildMeta` tinggal cadangan.
   *
   * `numberColIdx` SENGAJA tidak ikut dioper: itu urusan gaya berkas, bukan
   * identitas kolom, dan layar tidak pernah memakainya.
   */
  columns?: readonly string[]
  title?:   string
}

export async function exportToExcel(args: ExportExcelArgs): Promise<void> {
  const { menu, view, versi, tanggal, rows, catatan } = args
  const exportRows = (rows as ExportRow[]) ?? []
  if (!Array.isArray(exportRows) || exportRows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa di-export')
  }

  const ExcelJSLib = await loadExcelJs()
  const cadangan = buildMeta(menu, view, versi, tanggal)
  const { sheetName, numberColIdx } = cadangan
  const columns = args.columns ? [...args.columns] : cadangan.columns
  const title   = args.title ?? cadangan.title

  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(sheetName)

  // Catatan cakupan mendorong kepala tabel turun satu baris — ditulis di ATAS,
  // bukan di bawah, karena yang dibaca orang pertama kali baris paling atas.
  if (catatan) {
    ws.addRow([catatan])
    ws.mergeCells(1, 1, 1, columns.length)
    const c1 = ws.getRow(1).getCell(1)
    c1.font = { bold: true, size: 10, color: { argb: 'FFB45309' } }
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
    c1.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  // Header row
  const barisHeader = catatan ? 2 : 1
  ws.addRow(columns)
  for (let c = 0; c < columns.length; c++) {
    const cell = ws.getRow(barisHeader).getCell(c + 1)
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
      const argb = warnaDelta(columns[c], rowData[c])
      cell.font = { size: 10, ...(argb ? { color: { argb } } : {}) }
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
  if (view === 'penanggungJawab') {
    const pergeseran = menu === 'pergeseran'
    return {
      title: `Rekap Penanggung Jawab${pergeseran ? ' (Pergeseran)' : ''} ${dateLabel}`,
      sheetName: pergeseran ? 'Rekap PJ Pergeseran' : 'Rekap PJ',
      columns: ['Penanggung Jawab', 'Uraian', 'Jumlah'],
      numberColIdx: new Set([2]),
    }
  }
  if (menu === 'pergeseran' && view === 'rekapPergeseran') {
    return {
      title: `Rekap Pergeseran ${dateLabel}`,
      sheetName: 'Pergeseran',
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih', 'Penanggung Jawab', 'Keterangan'],
      numberColIdx: new Set([2, 4, 5, 6, 7, 8, 9, 10, 11]),
    }
  }
  if (menu === 'pergeseran' && view === 'daftarPerpindahan') {
    return {
      title: `Daftar Perpindahan ${dateLabel}`,
      sheetName: 'Perpindahan',
      columns: ['Dari', 'Ke', 'Nilai', 'Keterangan'],
      numberColIdx: new Set([2]),
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
