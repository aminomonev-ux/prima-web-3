// lib/blud/export/pdf.ts
// PDF export untuk menu Cetak BLUD via jspdf + jspdf-autotable.
//
// PERF-C3 anti-pattern compliance: import dynamic via dynamic-import dari client
// (cetak-client.tsx). File ini cuma DEFINE pure function tanpa top-level import jspdf.
//
// Format: A4 landscape, header judul, tabel autoTable, footer page number.

import type { ExportRow } from '@/lib/blud/cetak-data'
import { arahDelta, RGB_NAIK, RGB_TURUN } from '@/lib/blud/export/warna-delta'
import { tanggalHariIniWIB } from '@/lib/blud/tanggal'
import { kopPdf, kakiPdf, opsiTabelPdf, gayaKepalaPdf, type DokPdf, type SelAutoTable } from '@/lib/blud/export/gaya-dokumen'

export interface ExportPdfArgs {
  menu:    string
  view:    string
  tanggal: string
  versi:   string | null
  rows:    unknown            // ExportRow[] (cast di internal)
  /**
   * Keterangan cakupan, dicetak tepat di bawah judul. WAJIB diisi kalau `rows`
   * sudah disaring: dokumen anggaran yang membuang baris tanpa mengatakannya
   * bukan dokumen ringkas, ia dokumen menyesatkan — angka pada baris induk
   * tetap pagu penuh, jadi penerima menjumlah anak-anaknya dan tidak cocok.
   */
  catatan?: string
  /**
   * Kepala tabel & judul dari `renderCetakHtml().meta` — view yang sama yang
   * menyusun barisnya. Dikirim pemanggil supaya daftar kolom punya SATU sumber:
   * `buildMeta` di bawah pernah ketinggalan dua kolom waktu Bertambah/Berkurang
   * ditambahkan (L86), dan nama kolom berhenti menerangkan angka di bawahnya
   * tanpa satu galat pun. `buildMeta` tinggal cadangan.
   */
  columns?: readonly string[]
  title?:   string
  /** Tahun anggaran untuk kop. */
  tahun?:   number
}

export async function exportToPdf(args: ExportPdfArgs): Promise<void> {
  const { menu, view, versi, tanggal, rows, catatan } = args
  const exportRows = (rows as ExportRow[]) ?? []
  if (!Array.isArray(exportRows) || exportRows.length === 0) {
    throw new Error('Data kosong — tidak ada yang bisa di-export')
  }

  // Dynamic import — supaya bundle initial tidak include 800KB jspdf
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  // Tentukan title + columns per view
  const cadangan = buildMeta(menu, view, versi, tanggal)
  const columns  = args.columns ? [...args.columns] : cadangan.columns
  const title    = args.title ?? cadangan.title

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const dok = doc as unknown as DokPdf

  // Kop gaya dokumen (CONCEPT-blud-format-unduhan §5a). Catatan cakupan — kalau daftarnya
  // disaring — ditulis di baris kop terakhir, tepat di atas tabel.
  const startY = kopPdf(dok, title.toUpperCase(), args.tahun ?? null, catatan || undefined)

  autoTable(doc, {
    ...(opsiTabelPdf(columns) as object),
    body: exportRows.map(r => r.map(c => formatCell(c))),
    startY,
    margin: { left: 10, right: 10, bottom: 14 },
    // Hijau/merah kolom delta, sepadan pratinjau di layar. Nilainya dibaca dari
    // `exportRows` (angka aslinya), bukan dari sel yang sudah jadi teks berformat.
    didParseCell: (data) => {
      if (gayaKepalaPdf(data as unknown as SelAutoTable)) return
      const v = exportRows[data.row.index]?.[data.column.index]
      if (typeof v === 'number') data.cell.styles.halign = 'right'
      const arah = arahDelta(columns[data.column.index] ?? '', v)
      if (!arah) return
      data.cell.styles.textColor = arah === 'naik' ? RGB_NAIK : RGB_TURUN
      data.cell.styles.fontStyle = 'bold'
    },
  })
  kakiPdf(dok)

  // Filename
  const tag = (versi || tanggal || tanggalHariIniWIB()).replace(/-/g, '')
  const filename = `${slug(title)}_${tag}.pdf`
  doc.save(filename)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMeta(menu: string, view: string, versi: string | null, tanggal: string) {
  const dateLabel = versi ?? tanggal ?? 'Terbaru'
  if (menu === 'dpa' && view === 'dpa') {
    return {
      title: `Rekap DPA BLUD — ${dateLabel}`,
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Penanggung Jawab', 'Keterangan'],
    }
  }
  if (view === 'penanggungJawab') {
    return {
      title: `Rekap Penanggung Jawab${menu === 'pergeseran' ? ' (Pergeseran)' : ''} — ${dateLabel}`,
      columns: ['Penanggung Jawab', 'Uraian', 'Jumlah'],
    }
  }
  if (menu === 'pergeseran' && view === 'rekapPergeseran') {
    return {
      title: `Rekap Pergeseran — ${dateLabel}`,
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran', 'Bertambah', 'Berkurang', 'Selisih', 'Penanggung Jawab', 'Keterangan'],
    }
  }
  if (menu === 'pergeseran' && view === 'daftarPerpindahan') {
    return {
      title: `Daftar Perpindahan — ${dateLabel}`,
      columns: ['Dari', 'Ke', 'Nilai', 'Keterangan'],
    }
  }
  return { title: 'Rekap Master Akun', columns: ['Kode', 'Uraian'] }
}

function formatCell(c: string | number): string {
  if (c == null || c === '') return ''
  if (typeof c === 'number') {
    // angka di-format ribuan Indonesia
    return c.toLocaleString('id-ID')
  }
  return String(c)
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
