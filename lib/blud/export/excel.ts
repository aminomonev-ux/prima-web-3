// lib/blud/export/excel.ts
// Excel export untuk menu Cetak BLUD via exceljs (support cell styling).
// SDL-Audit v1.1 Phase 4: migrate dari xlsx-js-style (CVE prototype pollution + ReDoS) ke exceljs.
// PERF-C3 anti-pattern compliance: dynamic import dari client (cetak-client.tsx).

import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import type { ExportRow } from '@/lib/blud/cetak-data'
import { arahDelta, HEX_NAIK, HEX_TURUN } from '@/lib/blud/export/warna-delta'
import { tanggalHariIniWIB } from '@/lib/blud/tanggal'
import {
  BARIS_KEPALA, kopExcel, kepalaExcel, nomorKolomExcel, hiasSelData, aturCetakExcel,
} from '@/lib/blud/export/gaya-dokumen'

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
  /** Tahun anggaran untuk kop. */
  tahun?:   number
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
  const kol = columns.length

  // Kop gaya dokumen (CONCEPT-blud-format-unduhan §5a). Catatan cakupan ditulis di baris kop
  // terakhir (5), tepat di atas tabel — yang dibaca orang sebelum angkanya.
  kopExcel(ws, kol, title.toUpperCase(), args.tahun ?? null, catatan || undefined, sanitizeCell)
  kepalaExcel(ws, BARIS_KEPALA, columns)
  nomorKolomExcel(ws, BARIS_KEPALA + 1, kol)

  // Kolom angka = yang ditandai buildMeta ATAU yang memang berisi angka — kepala tabel bisa
  // datang dari pemanggil (args.columns), dan indeks buildMeta tidak dijamin sejajar dengannya.
  const angka = new Set<number>(numberColIdx)
  for (let c = 0; c < kol; c++) if (exportRows.some(r => typeof r[c] === 'number')) angka.add(c)
  const volume = (c: number) => /^vol( p)?$/i.test(columns[c] ?? '')

  exportRows.forEach((rowData, i) => {
    const r = ws.getRow(BARIS_KEPALA + 2 + i)
    r.values = rowData.map(c => sanitizeCell(c ?? ''))
    for (let c = 0; c < kol; c++) {
      const cell = r.getCell(c + 1)
      hiasSelData(cell, { angka: angka.has(c), volume: volume(c) })
      const argb = warnaDelta(columns[c], rowData[c])
      if (argb) cell.font = { ...cell.font, bold: true, color: { argb } }
    }
  })

  columns.forEach((_, i) => {
    ws.getColumn(i + 1).width = i === 0 ? 18 : i === 1 ? 46 : angka.has(i) ? 16 : 14
  })
  aturCetakExcel(ws, { mendatar: kol > 4, kepalaAwal: BARIS_KEPALA, kepalaAkhir: BARIS_KEPALA + 1 })

  const tag = (versi || tanggal || tanggalHariIniWIB()).replace(/-/g, '')
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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
