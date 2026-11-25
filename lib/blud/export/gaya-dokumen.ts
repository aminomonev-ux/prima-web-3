// lib/blud/export/gaya-dokumen.ts — SATU gaya untuk unduhan Excel & PDF BLUD.
// Konsep: docs/konsep/blud/CONCEPT-blud-format-unduhan.md §5a ("Resmi berwarna":
// susunan dokumen anggaran resmi, warna PRIMA). Excel dan PDF wajib lewat sini
// supaya kop, kepala, tingkat, total, dan tanda tangan tidak berbeda pendapat.
//
// Aman-klien: hanya tipe exceljs/jspdf, tanpa impor runtime.
import type ExcelJS from 'exceljs'

export const INSTANSI = 'RSJD Dr. AMINO GONDOHUTOMO'
export const PROVINSI = 'PROVINSI JAWA TENGAH'
export const GARIS_ISI = '..............................'

/** Token DESIGN-SYSTEM (+ tint-nya), tanpa `#` — exceljs memakai ARGB, jsPDF RGB. */
export const WARNA = {
  navy: '042C53',
  amber: 'EF9F27',
  naik: '1D9E75',
  turun: 'E24B4A',
  /** Naik/turun di atas latar navy (baris akar) — warna layar gelap; yang gelap tak terbaca di sana. */
  naikTerang: '6EE7B7',
  turunTerang: 'FCA5A5',
  biru1: 'DCE8F5',
  biru2: 'EEF4FA',
  krem: 'FDF1DE',
  kremPucat: 'FEF8EE',
  garisTegak: 'B7C4D1',
  garisDatar: 'D0D7DE',
  garisKepala: '3A6A9A',
  redup: '5A6B7D',
  teks: '141E28',
} as const
export type NamaWarna = keyof typeof WARNA

export const argb = (w: NamaWarna): string => `FF${WARNA[w]}`
export const rgb = (w: NamaWarna): [number, number, number] => {
  const h = WARNA[w]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Satu baris tabel tergolong tingkat apa — dasar warna & tebal di Excel DAN PDF. */
export type Tingkat = 'akar' | 'induk1' | 'induk2' | 'biasa'
export function tingkatBaris(kedalaman: number, punyaAnak: boolean): Tingkat {
  if (kedalaman === 0) return 'akar'
  if (punyaAnak && kedalaman === 1) return 'induk1'
  if (punyaAnak && kedalaman === 2) return 'induk2'
  return 'biasa'
}
const LATAR_TINGKAT: Record<Tingkat, NamaWarna | null> = { akar: 'navy', induk1: 'biru1', induk2: 'biru2', biasa: null }
export const latarTingkat = (t: Tingkat): NamaWarna | null => LATAR_TINGKAT[t]

/** Teks baris nomor kolom `(1) (2) …` — juga dikenali pembaca Impor (`import-dpa.ts`). */
export const teksNomorKolom = (i: number): string => `(${i + 1})`

// ─── Excel ───────────────────────────────────────────────────────────────────

/** Baris kop terakhir yang bertulisan (5); baris 6 = garis amber; kepala tabel mulai baris 7. */
export const BARIS_KEPALA = 7

const sisi = (w: NamaWarna, style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Border> => ({ style, color: { argb: argb(w) } })
const isi = (sel: ExcelJS.Cell, w: NamaWarna) => {
  sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(w) } }
}

/**
 * Kop dokumen. `baris5` — penanda Perubahan / acuan / versi; BIARKAN di baris 5:
 * Impor membaca penanda "DPA PERUBAHAN KE-n" dari baris di atas kepala tabel.
 */
export function kopExcel(
  ws: ExcelJS.Worksheet,
  kolTerakhir: number,
  judul: string,
  tahun: number | null,
  baris5: string | undefined,
  bersih: (s: string) => ExcelJS.CellValue,
): void {
  const teks = [judul, 'BADAN LAYANAN UMUM DAERAH', `${INSTANSI} ${PROVINSI}`, tahun ? `TAHUN ANGGARAN ${tahun}` : '']
  teks.forEach((t, i) => {
    const sel = ws.getRow(i + 1).getCell(1)
    sel.value = bersih(t)
    ws.mergeCells(i + 1, 1, i + 1, kolTerakhir)
    sel.font = { name: 'Arial', bold: true, size: i === 0 ? 13 : 10, color: { argb: argb('navy') } }
    sel.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  const s5 = ws.getRow(5).getCell(1)
  if (baris5) s5.value = bersih(baris5)
  ws.mergeCells(5, 1, 5, kolTerakhir)
  s5.font = { name: 'Arial', italic: true, size: 9, color: { argb: argb('redup') } }
  s5.alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 1; c <= kolTerakhir; c++) {
    ws.getRow(5).getCell(c).border = { bottom: sisi('navy', 'double') }
    isi(ws.getRow(6).getCell(c), 'amber')
  }
  ws.getRow(6).height = 3
}

/** Gaya satu sel kepala tabel (navy, teks putih). */
export function gayaKepalaExcel(sel: ExcelJS.Cell): void {
  sel.font = { name: 'Arial', bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } }
  isi(sel, 'navy')
  sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  sel.border = { top: sisi('navy'), bottom: sisi('navy'), left: sisi('garisKepala'), right: sisi('garisKepala') }
}

/** Kepala satu baris. */
export function kepalaExcel(ws: ExcelJS.Worksheet, baris: number, judulKolom: readonly string[]): void {
  const r = ws.getRow(baris)
  judulKolom.forEach((t, i) => {
    const sel = r.getCell(i + 1)
    sel.value = t
    gayaKepalaExcel(sel)
  })
  r.height = 30
}

/** Baris `(1) (2) …` di bawah kepala — hanya kolom yang tampak (cadangan tersembunyi dibiarkan kosong). */
export function nomorKolomExcel(ws: ExcelJS.Worksheet, baris: number, kolTampak: number): void {
  const r = ws.getRow(baris)
  for (let c = 1; c <= kolTampak; c++) {
    const sel = r.getCell(c)
    sel.value = teksNomorKolom(c - 1)
    sel.font = { name: 'Arial', size: 7.5, italic: true, color: { argb: argb('navy') } }
    sel.alignment = { horizontal: 'center', vertical: 'middle' }
    isi(sel, 'biru1')
    sel.border = { left: sisi('garisTegak'), right: sisi('garisTegak'), bottom: sisi('navy') }
  }
  r.height = 13
}

export const RUPIAH = '#,##0;(#,##0);"-"'

/** Gaya sel data: huruf, perataan, garis. `kolUraian` menjorok sesuai kedalaman. */
export function hiasSelData(
  sel: ExcelJS.Cell,
  opsi: { angka: boolean; volume?: boolean; uraian?: boolean; indent?: number; tebal?: boolean; warna?: NamaWarna | null; mono?: boolean },
): void {
  const { angka, volume = false, uraian = false, indent = 0, tebal = false, warna = null, mono = false } = opsi
  // Monospace untuk angka keuangan & kode rekening — aturan design system.
  sel.font = {
    name: angka || mono ? 'Consolas' : 'Arial', size: mono ? 9 : 9.5, bold: tebal,
    ...(warna ? { color: { argb: argb(warna) } } : {}),
  }
  sel.border = { left: sisi('garisTegak'), right: sisi('garisTegak'), bottom: sisi('garisDatar', 'hair') }
  if (angka) {
    sel.alignment = { horizontal: 'right', vertical: 'top' }
    // Vol dibiarkan General: `#,##0.##` mencetak "1," untuk vol bulat, sedangkan
    // vol DECIMAL(18,4) tetap harus menampakkan pecahannya kalau ada.
    if (!volume) sel.numFmt = RUPIAH
  } else {
    sel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, ...(uraian ? { indent } : {}) }
  }
}

/** Latar + warna teks satu baris menurut tingkatnya (dipanggil SESUDAH `hiasSelData`). */
export function warnaiTingkatExcel(baris: ExcelJS.Row, kolTerakhir: number, t: Tingkat): void {
  const latar = latarTingkat(t)
  if (!latar) return
  for (let c = 1; c <= kolTerakhir; c++) {
    const sel = baris.getCell(c)
    isi(sel, latar)
    if (t === 'akar') sel.font = { ...sel.font, color: { argb: 'FFFFFFFF' } }
  }
}

/** Baris JUMLAH penutup tabel: latar amber, teks navy, garis atas ganda. */
export function hiasBarisTotalExcel(baris: ExcelJS.Row, kolTerakhir: number, kolomAngka: readonly number[], numFmt = RUPIAH): void {
  const angka = new Set(kolomAngka)
  for (let c = 1; c <= kolTerakhir; c++) {
    const sel = baris.getCell(c)
    sel.font = { name: angka.has(c) ? 'Consolas' : 'Arial', size: 9.5, bold: true, color: { argb: argb('navy') } }
    sel.alignment = angka.has(c) ? { horizontal: 'right', vertical: 'middle' } : { horizontal: c === 2 ? 'right' : 'left', vertical: 'middle' }
    if (angka.has(c)) sel.numFmt = numFmt
    isi(sel, 'amber')
    sel.border = { top: sisi('navy', 'double'), bottom: sisi('navy'), left: sisi('amber'), right: sisi('amber') }
  }
}

/** Catatan kecil di bawah tabel (miring, abu-biru), satu baris selebar tabel. */
export function catatanExcel(ws: ExcelJS.Worksheet, baris: number, kolTerakhir: number, teks: ExcelJS.CellValue): void {
  const sel = ws.getRow(baris).getCell(1)
  sel.value = teks
  ws.mergeCells(baris, 1, baris, kolTerakhir)
  sel.font = { name: 'Arial', size: 8.5, italic: true, color: { argb: argb('redup') } }
  sel.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
  // Excel tidak menyesuaikan tinggi baris sel GABUNG — kalimat panjang terpotong satu baris.
  // Lebar ditaksir dari kolom yang digabung (± 1 huruf per satuan lebar kolom).
  let lebar = 0
  for (let c = 1; c <= kolTerakhir; c++) lebar += ws.getColumn(c).width ?? 10
  const panjang = String(typeof teks === 'string' ? teks : '').length
  const baris_ = Math.max(1, Math.ceil(panjang / Math.max(20, lebar * 1.1)))
  if (baris_ > 1) ws.getRow(baris).height = 12 * baris_
}

/**
 * Pejabat penanda tangan dari Pengaturan → Pejabat Penanda Tangan SPJ (`blud_pejabat`).
 * `jabatan` = "Bunyi jabatan yang dicetak" (`jabatan_teks`); kosong → "Direktur".
 */
export interface PejabatTtd {
  nama: string
  nip: string | null
  pangkat?: string | null
  jabatan?: string | null
}

export interface BarisTtd { teks: string; tebal: boolean; garisBawah: boolean }

/**
 * Isi blok tanda tangan — SATU daftar untuk Excel & PDF, urutan sama dgn lembar SPJ
 * (jabatan cetak · instansi · ruang tanda tangan · nama bergaris bawah · pangkat · NIP).
 * `null` di daftar = baris kosong (ruang tanda tangan basah). Tanpa data → bergaris diisi tangan.
 */
export function isiTandaTangan(direktur: PejabatTtd | null): Array<BarisTtd | null> {
  const nama = direktur?.nama?.trim()
  const pangkat = direktur?.pangkat?.trim()
  const nip = direktur?.nip?.trim()
  return [
    { teks: `Semarang, ${GARIS_ISI}`, tebal: false, garisBawah: false },
    { teks: direktur?.jabatan?.trim() || 'Direktur', tebal: false, garisBawah: false },
    { teks: INSTANSI, tebal: true, garisBawah: false },
    { teks: PROVINSI, tebal: true, garisBawah: false },
    null, null, null,
    { teks: nama || GARIS_ISI, tebal: true, garisBawah: !!nama },
    ...(pangkat ? [{ teks: pangkat, tebal: false, garisBawah: false }] : []),
    { teks: nip ? `NIP. ${nip}` : `NIP. ${GARIS_ISI}`, tebal: false, garisBawah: false },
  ]
}

/** Hanya Direktur (keputusan 2026-08-05), isinya ikut Pengaturan (`isiTandaTangan`). */
export function tandaTanganExcel(
  ws: ExcelJS.Worksheet,
  mulai: number,
  kolAwal: number,
  kolTerakhir: number,
  direktur: PejabatTtd | null,
  bersih: (s: string) => ExcelJS.CellValue,
): void {
  isiTandaTangan(direktur).forEach((b, i) => {
    if (!b) return
    const sel = ws.getRow(mulai + i).getCell(kolAwal)
    sel.value = bersih(b.teks)
    ws.mergeCells(mulai + i, kolAwal, mulai + i, kolTerakhir)
    sel.font = {
      name: 'Arial', size: 10, bold: b.tebal, underline: b.garisBawah,
      ...(b.tebal ? { color: { argb: argb('navy') } } : {}),
    }
    sel.alignment = { horizontal: 'center' }
  })
}

/**
 * Siap cetak: A4, muat selebar kertas, kepala berulang, nomor halaman, tanpa garis
 * kisi, kepala dibekukan.
 */
export function aturCetakExcel(
  ws: ExcelJS.Worksheet,
  opsi: { mendatar: boolean; kepalaAwal: number; kepalaAkhir: number },
): void {
  ws.views = [{ state: 'frozen', ySplit: opsi.kepalaAkhir, showGridLines: false }]
  ws.pageSetup = {
    paperSize: 9,
    orientation: opsi.mendatar ? 'landscape' : 'portrait',
    fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    printTitlesRow: `${opsi.kepalaAwal}:${opsi.kepalaAkhir}`,
  }
  ws.headerFooter = { oddFooter: '&L&8PRIMA - BLUD&R&8Halaman &P dari &N' }
}

// ─── PDF (jsPDF + autotable) ─────────────────────────────────────────────────
// Tipe minimum yang dipakai — jsPDF diimpor dinamis oleh pemanggil (PERF-C3).

export interface DokPdf {
  internal: { pageSize: { getWidth(): number; getHeight(): number } }
  setFont(nama: string, gaya?: string): unknown
  setFontSize(n: number): unknown
  setTextColor(r: number, g?: number, b?: number): unknown
  setDrawColor(r: number, g?: number, b?: number): unknown
  setFillColor(r: number, g?: number, b?: number): unknown
  setLineWidth(n: number): unknown
  line(x1: number, y1: number, x2: number, y2: number): unknown
  rect(x: number, y: number, w: number, h: number, gaya?: string): unknown
  text(t: string | string[], x: number, y: number, opsi?: Record<string, unknown>): unknown
  splitTextToSize(t: string, lebar: number): string[]
  getTextWidth(t: string): number
  getNumberOfPages(): number
  setPage(n: number): unknown
  addPage(): unknown
  lastAutoTable?: { finalY: number }
}

/** Kop PDF — memulangkan Y tempat tabel mulai. */
export function kopPdf(doc: DokPdf, judul: string, tahun: number | null, baris5: string | undefined): number {
  const L = doc.internal.pageSize.getWidth()
  doc.setTextColor(...rgb('navy'))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5)
  doc.text(judul, L / 2, 14, { align: 'center' })
  doc.setFontSize(10)
  doc.text('BADAN LAYANAN UMUM DAERAH', L / 2, 19.5, { align: 'center' })
  doc.text(`${INSTANSI} ${PROVINSI}`, L / 2, 24.5, { align: 'center' })
  let y = 24.5
  if (tahun) { y += 5; doc.text(`TAHUN ANGGARAN ${tahun}`, L / 2, y, { align: 'center' }) }
  if (baris5) {
    y += 5
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(...rgb('redup'))
    doc.text(baris5, L / 2, y, { align: 'center' })
  }
  y += 2.5
  doc.setDrawColor(...rgb('navy')); doc.setLineWidth(0.6); doc.line(10, y, L - 10, y)
  doc.setDrawColor(...rgb('amber')); doc.setLineWidth(0.9); doc.line(10, y + 1.4, L - 10, y + 1.4)
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2)
  return y + 6
}

/** Garis amber + "PRIMA - BLUD" + "Halaman x dari y" di setiap halaman. Panggil PALING AKHIR. */
export function kakiPdf(doc: DokPdf): void {
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    const L = doc.internal.pageSize.getWidth()
    const T = doc.internal.pageSize.getHeight()
    doc.setDrawColor(...rgb('amber')); doc.setLineWidth(0.4); doc.line(10, T - 9, L - 10, T - 9)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...rgb('redup'))
    doc.text('PRIMA - BLUD', 10, T - 5.5)
    doc.text(`Halaman ${i} dari ${n}`, L - 10, T - 5.5, { align: 'right' })
  }
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2)
}

/** Catatan miring di bawah tabel; memulangkan Y sesudahnya. */
export function catatanPdf(doc: DokPdf, teks: string, x: number, y: number, lebar: number): number {
  doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...rgb('redup'))
  const baris = doc.splitTextToSize(teks, lebar)
  doc.text(baris, x, y)
  doc.setTextColor(0)
  return y + baris.length * 3.4
}

/** Tanda tangan Direktur, rata tengah pada `x`. Pindah halaman kalau ruangnya tak cukup. */
export function tandaTanganPdf(doc: DokPdf, x: number, yAwal: number, direktur: PejabatTtd | null): void {
  let y = yAwal
  if (y > doc.internal.pageSize.getHeight() - 62) { doc.addPage(); y = 20 }
  doc.setFontSize(9.5)
  isiTandaTangan(direktur).forEach((b, i) => {
    if (!b) return
    const yb = y + i * 5 + (i >= 7 ? 8 : 0) // ruang tanda tangan basah sedikit lebih lega
    doc.setFont('helvetica', b.tebal ? 'bold' : 'normal')
    if (b.tebal) doc.setTextColor(...rgb('navy')); else doc.setTextColor(0)
    doc.text(b.teks, x, yb, { align: 'center' })
    if (b.garisBawah) {
      const w = doc.getTextWidth(b.teks)
      doc.setDrawColor(...rgb('navy')); doc.setLineWidth(0.25)
      doc.line(x - w / 2, yb + 0.8, x + w / 2, yb + 0.8)
      doc.setDrawColor(0)
    }
  })
  doc.setTextColor(0)
}

/** Opsi dasar autoTable: kepala navy + baris nomor kolom. */
export function opsiTabelPdf(kolom: readonly string[]): Record<string, unknown> {
  return {
    theme: 'grid',
    head: [[...kolom], kolom.map((_, i) => teksNomorKolom(i))],
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.4, lineColor: rgb('garisTegak'), lineWidth: 0.1, textColor: rgb('teks'), overflow: 'linebreak' },
    headStyles: { fillColor: rgb('navy'), textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: rgb('garisKepala') },
  }
}

interface SelPdf {
  section: string
  row: { index: number }
  column: { index: number }
  cell: { styles: Record<string, unknown>; x: number; y: number; height: number; width: number }
}
export type SelAutoTable = SelPdf

/** Gaya baris `(1)(2)…` kepala. Memulangkan `true` kalau sel ini BUKAN sel badan. */
export function gayaKepalaPdf(d: SelPdf): boolean {
  if (d.section === 'head' && d.row.index === 1) {
    d.cell.styles.fillColor = rgb('biru1')
    d.cell.styles.textColor = rgb('navy')
    d.cell.styles.fontStyle = 'italic'
    d.cell.styles.fontSize = 6.5
    d.cell.styles.cellPadding = 0.6
  }
  return d.section !== 'body'
}

/** Gaya sel badan menurut tingkat + jorok uraian (kolom `kolUraian`). */
export function gayaTingkatPdf(d: SelPdf, t: Tingkat, kedalaman: number, kolUraian = 1): void {
  if (d.column.index === kolUraian) {
    d.cell.styles.cellPadding = { left: 1.4 + Math.min(kedalaman, 6) * 2.5, right: 1.4, top: 1.4, bottom: 1.4 }
  }
  if (t !== 'biasa') d.cell.styles.fontStyle = 'bold'
  const latar = latarTingkat(t)
  if (latar) d.cell.styles.fillColor = rgb(latar)
  if (t === 'akar') d.cell.styles.textColor = 255
}

/** Baris JUMLAH penutup di PDF. */
export function gayaTotalPdf(d: SelPdf, kolUraian = 1): void {
  d.cell.styles.fontStyle = 'bold'
  d.cell.styles.fillColor = rgb('amber')
  d.cell.styles.textColor = rgb('navy')
  if (d.column.index === kolUraian) d.cell.styles.halign = 'right'
}

/** Rupiah id-ID; negatif dalam kurung (gaya dokumen anggaran). */
export function rupiahPdf(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return ''
  const v = Math.round(Number(n))
  const t = Math.abs(v).toLocaleString('id-ID')
  return v < 0 ? `(${t})` : t
}

/** Nama berkas PDF: `AWALAN_2026_20260829.pdf`. */
export function namaBerkasPdf(awalan: string, tahun: number, tag: string): string {
  return `${awalan}_${tahun}_${tag.replace(/-/g, '')}.pdf`
}
