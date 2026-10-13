// lib/blud/export/realisasi-pj.ts — unduh "Realisasi per Penanggung Jawab" (Excel & PDF).
//
// Dirakit di peramban dari hasil `rekapPerPj` yang SAMA dgn tabel di layar (pola Rekap
// E-Anggaran): berkas wajib memuat angka yang persis tampil, dan menghitung ulang di sini
// = dua sumber kebenaran untuk satu tabel. exceljs/jspdf dimuat saat tombol ditekan
// (PERF-C3) — berkas ini tanpa impor tingkat-atas pustaka berat.

import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import type ExcelJS from 'exceljs'
import {
  kolomRekapPj, kolomRincianPj, tabelRekapPj, tabelRincianPj, LABEL_TANPA_PJ,
  type BarisPj, type HasilRekapPj, type SelEkspor,
} from '@/lib/blud/realisasi-pj'

export interface ArgEksporPj {
  tahun:     number
  namaBulan: string
  /** "Pagu dari Pergeseran 12 Okt 2026" — kalimat yang sama dgn pil di layar. */
  sumber:    string
  hasil:     HasilRekapPj
  rows:      readonly BarisPj[]
}

const NAMA_BERKAS = (a: ArgEksporPj, ext: string) => `Realisasi-per-PJ-${a.namaBulan}-${a.tahun}.${ext}`

function judul(a: ArgEksporPj): string {
  return `REALISASI ANGGARAN BLUD PER PENANGGUNG JAWAB — S.D. ${a.namaBulan.toUpperCase()} ${a.tahun}`
}

/** Catatan yang wajib ikut ke berkas — angka yang dibawa ke rapat tidak boleh kehilangan sebabnya. */
function catatan(a: ArgEksporPj): string[] {
  const c = [
    'PJ sebuah rekening = PJ di baris itu atau induk terdekatnya, menurut versi yang jadi sumber pagu sekarang.',
  ]
  if (a.hasil.konflik > 0) {
    c.push(`${a.hasil.konflik} baris ber-PJ yang induknya juga ber-PJ — dihitung ke PJ induk saja, supaya uangnya tidak terhitung dua kali.`)
  }
  if (a.hasil.tanpaPj) c.push(`"${LABEL_TANPA_PJ}" = rekening yang rantainya tidak ber-PJ di DPA/Pergeseran.`)
  return c
}

const tebal = (sel: SelEkspor) => typeof sel === 'string' && (sel === 'JUMLAH' || sel.startsWith('Jumlah '))

// ─── Excel ───────────────────────────────────────────────────────────────────

function lembar(
  wb: ExcelJS.Workbook, nama: string, a: ArgEksporPj,
  kolom: string[], isi: SelEkspor[][], angkaMulai: number, lebar: number[],
) {
  const ws = wb.addWorksheet(nama)
  const kop = [judul(a), `${a.sumber} · dicetak dari PRIMA BLUD`, ...catatan(a)]
  kop.forEach((t, i) => {
    ws.addRow([t])
    ws.mergeCells(i + 1, 1, i + 1, kolom.length)
    const c = ws.getRow(i + 1).getCell(1)
    c.font = i === 0 ? { bold: true, size: 12 } : { size: 9, italic: i > 1, color: { argb: i > 1 ? 'FF854F0B' : 'FF374151' } }
  })
  ws.addRow([])
  const barisKepala = kop.length + 2
  ws.addRow(kolom)
  ws.getRow(barisKepala).eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1855BB' } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  for (const data of isi) {
    const r = ws.addRow(data.map(c => sanitizeCell(c)))
    const total = tebal(data[0])
    r.eachCell({ includeEmpty: true }, (c, no) => {
      if (no - 1 >= angkaMulai) { c.numFmt = '#,##0'; c.alignment = { horizontal: 'right' } }
      else c.alignment = { vertical: 'top', wrapText: true }
      if (total) {
        c.font = { bold: true }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
      }
    })
  }
  ws.columns = lebar.map(w => ({ width: w }))
  ws.views = [{ state: 'frozen', ySplit: barisKepala }]
}

export async function unduhRealisasiPjExcel(a: ArgEksporPj): Promise<void> {
  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  lembar(wb, 'Rekap per PJ', a, kolomRekapPj(a.namaBulan), tabelRekapPj(a.hasil), 1,
    [34, 10, 18, 16, 18, 18, 18, 7])
  lembar(wb, 'Rincian Rekening', a, kolomRincianPj(a.namaBulan), tabelRincianPj(a.rows, a.hasil), 3,
    [26, 28, 42, 17, 15, 17, 17, 17, 7])
  await downloadWorkbook(wb, NAMA_BERKAS(a, 'xlsx'))
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

const fmt = (c: SelEkspor) => (typeof c === 'number' ? c.toLocaleString('id-ID') : c)

export async function unduhRealisasiPjPdf(a: ArgEksporPj): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const lebarHal = doc.internal.pageSize.getWidth()
  doc.setFontSize(12); doc.setFont('helvetica', 'bold')
  doc.text(judul(a), lebarHal / 2, 13, { align: 'center' })
  doc.setFontSize(8.5); doc.setFont('helvetica', 'normal')
  doc.text(`${a.sumber} · RSJD Dr. Amino Gondohutomo · PRIMA BLUD`, lebarHal / 2, 18.5, { align: 'center' })
  let y = 23.5
  doc.setTextColor(133, 79, 11)
  for (const t of catatan(a)) { doc.text(t, lebarHal / 2, y, { align: 'center' }); y += 4.2 }
  doc.setTextColor(0)

  const gaya = {
    styles: { fontSize: 7.5, cellPadding: 1.4, overflow: 'linebreak' as const },
    headStyles: { fillColor: [24, 85, 187] as [number, number, number], textColor: 255, fontStyle: 'bold' as const },
    margin: { left: 10, right: 10 },
  }

  // Baris total dikenali dari larik mentahnya (`rekap`/`rincian`), bukan dari teks sel
  // yang sudah diformat.
  const rekap = tabelRekapPj(a.hasil)
  autoTable(doc, {
    head: [kolomRekapPj(a.namaBulan)], body: rekap.map(r => r.map(fmt)), startY: y + 1, ...gaya,
    didParseCell: (d) => {
      if (d.section !== 'body') return
      if (d.column.index >= 1) d.cell.styles.halign = 'right'
      if (tebal(rekap[d.row.index]?.[0])) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [243, 244, 246] }
    },
  })
  const rincian = tabelRincianPj(a.rows, a.hasil)
  doc.addPage()
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('Rincian rekening per Penanggung Jawab', 10, 13)
  autoTable(doc, {
    head: [kolomRincianPj(a.namaBulan)], body: rincian.map(r => r.map(fmt)), startY: 17, ...gaya,
    didParseCell: (d) => {
      if (d.section !== 'body') return
      if (d.column.index >= 3) d.cell.styles.halign = 'right'
      if (tebal(rincian[d.row.index]?.[0])) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [243, 244, 246] }
    },
  })
  const jml = doc.getNumberOfPages()
  for (let i = 1; i <= jml; i++) {
    doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120)
    doc.text(`Halaman ${i} dari ${jml}`, lebarHal / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' })
  }
  doc.save(NAMA_BERKAS(a, 'pdf'))
}
