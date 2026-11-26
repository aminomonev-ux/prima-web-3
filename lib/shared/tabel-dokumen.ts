// lib/shared/tabel-dokumen.ts — penulis tabel "Resmi berwarna" untuk unduhan Excel & PDF
// semua modul (konsep: docs/konsep/sistem/CONCEPT-format-unduhan-seragam.md).
//
// Modul menyusun DATA (kolom + baris), berkas ini yang menggambar: kop baris 1–5, garis
// amber baris 6, kepala navy mulai baris 7, nomor kolom (1)(2)…, latar tingkat, baris
// JUMLAH amber, catatan miring, tanda tangan, A4 siap cetak. Satu `DokTabel` dipakai
// Excel DAN PDF, jadi dua berkasnya tidak bisa berbeda isi.
//
// Aman-klien: exceljs/jspdf hanya sebagai tipe; pemanggil yang memuat pustakanya.
import type ExcelJS from 'exceljs'
import { sanitizeCell } from './excel-export'
import { tulisDesimal, tulisPersen } from './desimal'
import {
  argb, rgb, teksNomorKolom, kopDokExcel, gayaKepalaExcel, nomorKolomExcel, hiasSelData,
  warnaiTingkatExcel, hiasBarisTotalExcel, catatanExcel, blokTtdExcel, aturCetakExcel,
  kopDokPdf, catatanPdf, blokTtdPdf, gayaTingkatPdf, gayaTotalPdf, rupiahPdf, isiBlokTtd,
  latarTingkat, RUPIAH, BARIS_KEPALA,
  type KopDok, type Tingkat, type NamaWarna, type BlokTtd, type DokPdf, type SelAutoTable,
} from './gaya-dokumen'

export type JenisKolom = 'teks' | 'uraian' | 'nomor' | 'kode' | 'rupiah' | 'angka' | 'desimal' | 'persen'

export interface KolomDok {
  judul: string
  /** Bawaan 'teks'. Menentukan perataan, huruf (mono utk angka & kode), format angka. */
  jenis?: JenisKolom
  /** Lebar Excel (≈ jumlah huruf). PDF membagi lebar halaman sebanding angka ini. */
  lebar?: number
  /** Timpa format angka Excel bawaan jenisnya (mis. '0.00%' utk persen berskala 0–1). */
  numFmt?: string
  /** Timpa teks PDF sel angka (bawaan: menurut jenis). */
  teksPdf?: (v: number) => string
}

export type NilaiSel = string | number | null | undefined

export interface BarisDok {
  sel: NilaiSel[]
  /** Latar & tebal menurut tingkat pohon (akar navy, induk biru). */
  tingkat?: Tingkat
  /** Jorok kolom uraian. */
  kedalaman?: number
  /** Baris JUMLAH (amber). */
  total?: boolean
  tebal?: boolean
  /** Warna teks per kolom (naik/turun). */
  warnaTeks?: (NamaWarna | null | undefined)[]
}

/** Sel kepala bertingkat — semantik autoTable (`colSpan`/`rowSpan`). */
export interface SelKepala { teks: string; colSpan?: number; rowSpan?: number }

export interface DokTabel {
  kop: KopDok
  kolom: KolomDok[]
  /** Kepala bertingkat; tanpa ini = satu baris dari `kolom[].judul`. */
  kepala?: SelKepala[][]
  baris: BarisDok[]
  catatan?: string[]
  /** 0–2 blok tanda tangan; yang terakhir di kanan. */
  ttd?: BlokTtd[]
  mendatar?: boolean
  /** Tanpa baris (1)(2)… di bawah kepala. */
  tanpaNomorKolom?: boolean
}

const jenisDari = (k: KolomDok): JenisKolom => k.jenis ?? 'teks'
const JENIS_ANGKA = new Set<JenisKolom>(['rupiah', 'angka', 'desimal', 'persen'])
export const kolomAngka = (k: KolomDok) => JENIS_ANGKA.has(jenisDari(k))

const FORMAT_EXCEL: Partial<Record<JenisKolom, string>> = {
  rupiah: RUPIAH,
  angka: '#,##0',
  // Persen dalam satuan persen (62,01 = 62,01%) — `0.00%` akan mengalikan 100.
  persen: '0.00',
}

/** Kepala dalam bentuk kisi: tiap sel + posisinya (0-based) — dipakai Excel. */
export function tataKepala(kepala: SelKepala[][]): Array<{ teks: string; r: number; c: number; rs: number; cs: number }> {
  const terisi: boolean[][] = []
  const hasil: Array<{ teks: string; r: number; c: number; rs: number; cs: number }> = []
  kepala.forEach((baris, r) => {
    let c = 0
    for (const sel of baris) {
      while (terisi[r]?.[c]) c++
      const rs = Math.max(1, sel.rowSpan ?? 1)
      const cs = Math.max(1, sel.colSpan ?? 1)
      for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) (terisi[i] ??= [])[j] = true
      hasil.push({ teks: sel.teks, r, c, rs, cs })
      c += cs
    }
  })
  return hasil
}

const kepalaDok = (dok: DokTabel): SelKepala[][] => dok.kepala ?? [dok.kolom.map(k => ({ teks: k.judul }))]

export interface LetakTabelExcel {
  kepalaAwal: number
  kepalaAkhir: number
  dataAwal: number
  /** Baris kosong pertama sesudah tabel, catatan, dan tanda tangan. */
  sesudah: number
}

/**
 * Tulis satu dokumen tabel ke lembar. `mulai` (bawaan 1) memungkinkan beberapa dokumen
 * dalam satu lembar (mis. satu blok per bulan); hanya dokumen yang mulai di baris 1 yang
 * memasang pengaturan cetak (kepala berulang dihitung dari blok itu).
 */
export function tulisTabelExcel(
  ws: ExcelJS.Worksheet,
  dok: DokTabel,
  opsi: { mulai?: number } = {},
): LetakTabelExcel {
  const mulai = opsi.mulai ?? 1
  const kol = dok.kolom.length
  const geser = mulai - 1
  // Kop selalu di baris 1–6 relatif → tulis lewat lembar bayangan bila tidak mulai di 1.
  if (geser === 0) kopDokExcel(ws, kol, dok.kop, sanitizeCell)
  else tulisKopBergeser(ws, kol, dok.kop, geser)

  const kepalaAwal = BARIS_KEPALA + geser
  const kepala = kepalaDok(dok)
  for (const s of tataKepala(kepala)) {
    const sel = ws.getRow(kepalaAwal + s.r).getCell(s.c + 1)
    sel.value = s.teks
    if (s.rs > 1 || s.cs > 1) ws.mergeCells(kepalaAwal + s.r, s.c + 1, kepalaAwal + s.r + s.rs - 1, s.c + s.cs)
  }
  for (let r = 0; r < kepala.length; r++) {
    for (let c = 1; c <= kol; c++) gayaKepalaExcel(ws.getRow(kepalaAwal + r).getCell(c))
    ws.getRow(kepalaAwal + r).height = kepala.length > 1 ? 22 : 30
  }
  let kepalaAkhir = kepalaAwal + kepala.length - 1
  if (!dok.tanpaNomorKolom) { kepalaAkhir++; nomorKolomExcel(ws, kepalaAkhir, kol) }

  const dataAwal = kepalaAkhir + 1
  const kolAngka = dok.kolom.flatMap((k, i) => (kolomAngka(k) ? [i + 1] : []))
  dok.baris.forEach((b, i) => {
    const row = ws.getRow(dataAwal + i)
    dok.kolom.forEach((k, c) => {
      const sel = row.getCell(c + 1)
      const v = b.sel[c]
      const jenis = jenisDari(k)
      sel.value = v == null ? null : typeof v === 'string' ? sanitizeCell(v) : v
      const angka = kolomAngka(k)
      hiasSelData(sel, {
        angka, volume: true, mono: jenis === 'kode',
        uraian: jenis === 'uraian', indent: jenis === 'uraian' ? Math.min(b.kedalaman ?? 0, 8) : 0,
        tebal: !!b.tebal || (!!b.tingkat && b.tingkat !== 'biasa'),
        warna: b.warnaTeks?.[c] ?? null,
      })
      if (jenis === 'nomor') sel.alignment = { horizontal: 'center', vertical: 'top' }
      if (angka && typeof v === 'number') sel.numFmt = k.numFmt ?? FORMAT_EXCEL[jenis] ?? 'General'
    })
    if (b.tingkat) warnaiTingkatExcel(row, kol, b.tingkat)
    if (b.total) {
      hiasBarisTotalExcel(row, kol, kolAngka)
      dok.kolom.forEach((k, c) => {
        const sel = row.getCell(c + 1)
        if (kolomAngka(k) && typeof sel.value === 'number') sel.numFmt = k.numFmt ?? FORMAT_EXCEL[jenisDari(k)] ?? 'General'
      })
    }
  })

  let n = dataAwal + dok.baris.length
  if (dok.catatan?.length) {
    n++
    for (const c of dok.catatan) { catatanExcel(ws, n, kol, sanitizeCell(c)); n++ }
  }
  const ttd = dok.ttd ?? []
  if (ttd.length) {
    n++
    const blok = letakTtdExcel(kol, ttd.length)
    let tinggi = 0
    ttd.forEach((t, i) => {
      const baris = isiBlokTtd(t)
      blokTtdExcel(ws, n, blok[i][0], blok[i][1], baris, sanitizeCell)
      tinggi = Math.max(tinggi, baris.length)
    })
    n += tinggi
  }

  dok.kolom.forEach((k, i) => {
    const w = ws.getColumn(i + 1)
    const ingin = k.lebar ?? lebarBawaan(k)
    if (!w.width || w.width < ingin) w.width = ingin
  })
  if (geser === 0) {
    aturCetakExcel(ws, { mendatar: dok.mendatar ?? kol > 6, kepalaAwal, kepalaAkhir, modul: dok.kop.modul })
  }
  return { kepalaAwal, kepalaAkhir, dataAwal, sesudah: n + 1 }
}

function lebarBawaan(k: KolomDok): number {
  switch (jenisDari(k)) {
    case 'nomor': return 5
    case 'uraian': return 44
    case 'kode': return 16
    case 'rupiah': return 17
    case 'persen': case 'desimal': case 'angka': return 12
    default: return 18
  }
}

/** Kolom awal & akhir tiap blok tanda tangan: satu blok di kanan, dua blok kiri & kanan. */
export function letakTtdExcel(kol: number, jumlah: number): Array<[number, number]> {
  const lebar = Math.max(1, Math.min(kol, Math.ceil(kol / 3)))
  const kanan: [number, number] = [Math.max(1, kol - lebar + 1), kol]
  if (jumlah < 2) return [kanan]
  const kiri: [number, number] = [kol >= 5 ? 2 : 1, Math.min(kanan[0] - 1, (kol >= 5 ? 2 : 1) + lebar - 1)]
  return [kiri[1] >= kiri[0] ? kiri : [1, 1], kanan]
}

function tulisKopBergeser(ws: ExcelJS.Worksheet, kol: number, kop: KopDok, geser: number): void {
  // Blok kedua dst. di lembar yang sama: kop sama bentuknya, cuma bergeser ke bawah.
  const teks = [kop.judul, kop.subjudul ?? '', '', kop.periode ?? ''].filter(Boolean)
  const isi = [...teks, ...Array(4 - Math.min(4, teks.length)).fill('')].slice(0, 4)
  // Baris instansi tetap ditulis agar kop setiap blok utuh.
  const lengkap = [kop.judul, ...(kop.subjudul ? [kop.subjudul] : []), 'RSJD Dr. AMINO GONDOHUTOMO PROVINSI JAWA TENGAH', ...(kop.periode ? [kop.periode] : [])]
  for (let i = 0; i < 4; i++) {
    const r = geser + i + 1
    const sel = ws.getRow(r).getCell(1)
    sel.value = sanitizeCell(lengkap[i] ?? isi[i] ?? '')
    if (kol > 1) ws.mergeCells(r, 1, r, kol)
    sel.font = { name: 'Arial', bold: true, size: i === 0 ? 13 : 10, color: { argb: argb('navy') } }
    sel.alignment = { horizontal: 'center', vertical: 'middle' }
  }
  const s5 = ws.getRow(geser + 5).getCell(1)
  if (kop.keterangan) s5.value = sanitizeCell(kop.keterangan)
  if (kol > 1) ws.mergeCells(geser + 5, 1, geser + 5, kol)
  s5.font = { name: 'Arial', italic: true, size: 9, color: { argb: argb('redup') } }
  s5.alignment = { horizontal: 'center', vertical: 'middle' }
  for (let c = 1; c <= kol; c++) {
    ws.getRow(geser + 5).getCell(c).border = { bottom: { style: 'double', color: { argb: argb('navy') } } }
    ws.getRow(geser + 6).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('amber') } }
  }
  ws.getRow(geser + 6).height = 3
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/** Teks PDF satu sel menurut jenis kolomnya. */
export function teksSelPdf(k: KolomDok, v: NilaiSel): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (!Number.isFinite(v)) return ''
  if (k.teksPdf) return k.teksPdf(v)
  switch (jenisDari(k)) {
    case 'rupiah': return rupiahPdf(v)
    case 'persen': return tulisPersen(v)
    case 'desimal': return tulisDesimal(v)
    case 'angka': return Math.round(v).toLocaleString('id-ID')
    default: return String(v)
  }
}

export interface OpsiPdf {
  /** Mulai di halaman baru (dokumen kedua dst. dalam satu berkas). */
  halamanBaru?: boolean
  /** Lebar kolom (mm) — timpa pembagian sebanding `kolom[].lebar`. */
  lebarKolom?: number[]
  huruf?: number
}

/**
 * Gambar satu dokumen tabel ke PDF: kop, tabel, catatan, tanda tangan. Kaki halaman
 * (`kakiDokPdf`) dipanggil PEMANGGIL sekali di akhir berkas. Memulangkan Y terakhir.
 */
export function gambarTabelPdf<D extends object>(
  doc: D,
  autoTable: (doc: D, opsi: never) => unknown,
  dok: DokTabel,
  opsi: OpsiPdf = {},
): number {
  const d = doc as unknown as DokPdf
  if (opsi.halamanBaru) d.addPage()
  const y = kopDokPdf(d, dok.kop)
  const L = d.internal.pageSize.getWidth()
  const tepi = 10
  const lebar = opsi.lebarKolom ?? lebarPdf(dok.kolom, L - 2 * tepi)
  const kepala = kepalaDok(dok)
  const head: Array<Array<{ content: string; colSpan?: number; rowSpan?: number }>> = kepala.map(b =>
    b.map(s => ({ content: s.teks, ...(s.colSpan ? { colSpan: s.colSpan } : {}), ...(s.rowSpan ? { rowSpan: s.rowSpan } : {}) })))
  if (!dok.tanpaNomorKolom) head.push(dok.kolom.map((_, i) => ({ content: teksNomorKolom(i) })))
  const barisNomor = dok.tanpaNomorKolom ? -1 : head.length - 1
  const kolUraian = dok.kolom.findIndex(k => jenisDari(k) === 'uraian')

  autoTable(doc, {
    theme: 'grid',
    startY: y,
    margin: { left: tepi, right: tepi, bottom: 14 },
    head,
    body: dok.baris.map(b => dok.kolom.map((k, c) => teksSelPdf(k, b.sel[c]))),
    styles: {
      font: 'helvetica', fontSize: opsi.huruf ?? 7.5, cellPadding: 1.4, lineColor: rgb('garisTegak'),
      lineWidth: 0.1, textColor: rgb('teks'), overflow: 'linebreak', valign: 'top',
    },
    headStyles: { fillColor: rgb('navy'), textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: rgb('garisKepala') },
    columnStyles: Object.fromEntries(dok.kolom.map((k, i) => [i, {
      cellWidth: lebar[i],
      halign: kolomAngka(k) ? 'right' : jenisDari(k) === 'nomor' ? 'center' : 'left',
      ...(kolomAngka(k) || jenisDari(k) === 'kode' ? { font: 'courier' } : {}),
    }])),
    didParseCell: (data: SelAutoTable) => {
      if (data.section === 'head') {
        if (data.row.index === barisNomor) {
          data.cell.styles.fillColor = rgb('biru1')
          data.cell.styles.textColor = rgb('navy')
          data.cell.styles.fontStyle = 'italic'
          data.cell.styles.fontSize = 6.5
          data.cell.styles.cellPadding = 0.6
        }
        return
      }
      if (data.section !== 'body') return
      const b = dok.baris[data.row.index]
      if (!b) return
      if (b.total) { gayaTotalPdf(data, kolUraian >= 0 ? kolUraian : 1); return }
      if (b.tingkat) gayaTingkatPdf(data, b.tingkat, b.kedalaman ?? 0, kolUraian >= 0 ? kolUraian : -1)
      else if (kolUraian >= 0 && data.column.index === kolUraian && b.kedalaman) {
        data.cell.styles.cellPadding = { left: 1.4 + Math.min(b.kedalaman, 6) * 2.5, right: 1.4, top: 1.4, bottom: 1.4 }
      }
      if (b.tebal) data.cell.styles.fontStyle = 'bold'
      const w = b.warnaTeks?.[data.column.index]
      if (w && !(b.tingkat && latarTingkat(b.tingkat) === 'navy')) { data.cell.styles.textColor = rgb(w); data.cell.styles.fontStyle = 'bold' }
    },
  } as never)

  let yAkhir = (d.lastAutoTable?.finalY ?? y) + 5
  for (const c of dok.catatan ?? []) yAkhir = catatanPdf(d, c, tepi + 2, yAkhir, L - 2 * tepi - 4) + 1.5
  const ttd = dok.ttd ?? []
  if (ttd.length) {
    const xs = ttd.length === 1 ? [L - 60] : [60, L - 60]
    yAkhir = blokTtdPdf(d, ttd.map((t, i) => ({ x: xs[i], baris: isiBlokTtd(t) })), yAkhir + 4)
  }
  return yAkhir
}

/** Lebar kolom PDF sebanding `lebar` Excel, memenuhi lebar halaman. */
export function lebarPdf(kolom: readonly KolomDok[], total: number): number[] {
  const bobot = kolom.map(k => k.lebar ?? lebarBawaan(k))
  const jml = bobot.reduce((s, v) => s + v, 0) || 1
  return bobot.map(b => (b / jml) * total)
}

/** Berkas PDF baru A4 (mendatar bawaan bila kolomnya banyak). */
export function opsiHalamanPdf(dok: Pick<DokTabel, 'kolom' | 'mendatar'>): { orientation: 'landscape' | 'portrait'; unit: 'mm'; format: 'a4' } {
  return { orientation: (dok.mendatar ?? dok.kolom.length > 6) ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' }
}

export { argb }
