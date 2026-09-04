// lib/blud/export/pdf.ts
// PDF export untuk menu Cetak BLUD via jspdf + jspdf-autotable.
//
// PERF-C3 anti-pattern compliance: import dynamic via dynamic-import dari client
// (cetak-client.tsx). File ini cuma DEFINE pure function tanpa top-level import jspdf.
//
// Format: A4 landscape, header judul, tabel autoTable, footer page number.

import type { ExportRow } from '@/lib/blud/cetak-data'
import { arahDelta, RGB_NAIK, RGB_TURUN } from '@/lib/blud/export/warna-delta'

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

  // Title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 14, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('RSJD Dr. Amino Gondohutomo · PRIMA BLUD', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' })

  // Catatan cakupan — hanya muncul kalau daftarnya memang disaring.
  if (catatan) {
    doc.setFontSize(8.5)
    doc.setTextColor(180, 83, 9)
    doc.text(catatan, doc.internal.pageSize.getWidth() / 2, 25, { align: 'center' })
    doc.setTextColor(0)
  }

  // Tabel
  autoTable(doc, {
    head: [columns],
    body: exportRows.map(r => r.map(c => formatCell(c))),
    startY: catatan ? 30 : 26,
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 85, 187], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
    // Hijau/merah kolom delta, sepadan pratinjau di layar. Nilainya dibaca dari
    // `exportRows` (angka aslinya), bukan dari sel yang sudah jadi teks berformat.
    didParseCell: (data) => {
      if (data.section !== 'body') return
      const arah = arahDelta(columns[data.column.index] ?? '', exportRows[data.row.index]?.[data.column.index])
      if (!arah) return
      data.cell.styles.textColor = arah === 'naik' ? RGB_NAIK : RGB_TURUN
      data.cell.styles.fontStyle = 'bold'
    },
    didDrawPage: (data) => {
      // Footer: page number
      const pageCount = doc.getNumberOfPages()
      const pageH = doc.internal.pageSize.getHeight()
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(
        `Halaman ${data.pageNumber} dari ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        pageH - 6,
        { align: 'center' },
      )
    },
  })

  // Filename
  const tag = (versi || tanggal || new Date().toISOString().slice(0, 10)).replace(/-/g, '')
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
