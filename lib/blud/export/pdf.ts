// lib/blud/export/pdf.ts
// PDF export untuk menu Cetak BLUD via jspdf + jspdf-autotable.
//
// PERF-C3 anti-pattern compliance: import dynamic via dynamic-import dari client
// (cetak-client.tsx). File ini cuma DEFINE pure function tanpa top-level import jspdf.
//
// Format: A4 landscape, header judul, tabel autoTable, footer page number.

import type { ExportRow } from '@/lib/blud/cetak-data'

export interface ExportPdfArgs {
  menu:    string
  view:    string
  tanggal: string
  versi:   string | null
  rows:    unknown            // ExportRow[] (cast di internal)
}

export async function exportToPdf(args: ExportPdfArgs): Promise<void> {
  const { menu, view, versi, tanggal, rows } = args
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
  const { title, columns } = buildMeta(menu, view, versi, tanggal)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  // Title
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(title, doc.internal.pageSize.getWidth() / 2, 14, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('RSJD Dr. Amino Gondohutomo · PRIMA BLUD', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' })

  // Tabel
  autoTable(doc, {
    head: [columns],
    body: exportRows.map(r => r.map(c => formatCell(c))),
    startY: 26,
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 85, 187], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 10, right: 10 },
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
  if (menu === 'dpa' && view === 'penanggungJawab') {
    return {
      title: `Rekap Penanggung Jawab — ${dateLabel}`,
      columns: ['Penanggung Jawab', 'Uraian', 'Jumlah'],
    }
  }
  if (menu === 'pergeseran' && view === 'rekapPergeseran') {
    return {
      title: `Rekap Pergeseran — ${dateLabel}`,
      columns: ['Kode Rekening', 'Uraian', 'Vol', 'Satuan', 'Harga', 'Jumlah', 'Vol P', 'Harga P', 'Pergeseran', 'Bertambah/Berkurang'],
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
