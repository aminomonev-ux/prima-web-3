// lib/bba/kib-excel.ts — penulis lembar berbentuk templat ekspor sistem aset provinsi + lembar KIB A–F.
// Konsep: docs/CONCEPT-bba-buku-aset.md §9. Kolom & kepala dari lib/bba/kib.ts (satu sumber); lembar
// lain (sensus, KIR, BI, Rekap) di lembar-excel.ts memakai `tulisLembar` yang sama.
// Bentuk ditiru dari lembar ekspor nyata: kop Arial 14/12 · kepala Calibri 11 + nomor kolom · isi
// Arial 9 · satu baris pendek sesudah isi (ikut rentang SUM) · baris "Jumlah" · tanda tangan dua blok.
import type ExcelJS from 'exceljs'
import {
  KOLOM_KIB, JUDUL_KIB, NOMOR_KOLOM, TEKS_KONDISI_KIB, gabunganKepala, kisiKepala,
  type Golongan, type KolomKib,
} from './kib'
import type { AsetRingan } from './aset'
import type { PengaturanBba } from './pengaturan'

const TIPIS = { style: 'thin' } as ExcelJS.Border
const BINGKAI: Partial<ExcelJS.Borders> = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS }
export const FMT_UANG = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'
export const FMT_ANGKA = '_-* #,##0_-;-* #,##0_-;_-* "-"??_-;_-@_-'
const HURUF_ISI: Partial<ExcelJS.Font> = { name: 'Arial', size: 9 }
const HURUF_KEPALA: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }

export function hurufKolom(n: number): string {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

export function tanggalPanjang(iso: string): string {
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${BULAN[m - 1]} ${y}`
}

/** Urutan cetak: kode barang (memuat tahun) lalu register — sama dengan ekspor provinsi. */
export function urutCetak<T extends Pick<AsetRingan, 'kode_barang' | 'register' | 'id'>>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (a.kode_barang ?? '').localeCompare(b.kode_barang ?? '') || (a.register ?? '').localeCompare(b.register ?? '') || a.id - b.id)
}

// ─── Penulis lembar generik ─────────────────────────────────────────────────

export interface SelTtd { d: number; c: number; sampai?: number; v: string }

export interface BentukLembar {
  nama: string
  judul: string
  /** Kolom judul & "PROVINSI JAWA TENGAH" (C; lembar Rekap: D). */
  kolomJudul?: number
  /** Baris 5 dst: label di A, ": isi" di C. */
  kop: [string, string][]
  kopLain?: { r: number; c: number; v: string }[]
  kolom: readonly KolomKib[]
  kisi: string[][]
  barisKepala: number
  /** Tinggi baris kepala ke-n (0 = baris pertama). */
  tinggiKepala?: Record<number, number>
  nomor?: readonly string[]
  /** Nilai sel siap tulis, sejajar `kolom`. Rumus per baris dihitung pemanggil (barisnya = `barisIsi(bentuk) + i`). */
  baris: ExcelJS.CellValue[][]
  tinggiPenutup: number
  jumlah: { label?: [kolom: number, teks: string]; sum: number[]; lain?: (rJumlah: number) => { c: number; v: ExcelJS.CellValue; numFmt?: string }[] }
  /** Tanda tangan: baris = rJumlah + d. */
  ttd: SelTtd[]
  halaman: Partial<ExcelJS.PageSetup>
}

export const barisIsi = (b: Pick<BentukLembar, 'barisKepala' | 'kisi' | 'nomor'>) => b.barisKepala + b.kisi.length + (b.nomor ? 1 : 0)

/** Baris "Jumlah" untuk `n` baris isi — pemanggil butuh untuk rumus yang merujuknya. */
export const barisJumlah = (b: Pick<BentukLembar, 'barisKepala' | 'kisi' | 'nomor'>, n: number) => barisIsi(b) + n + 1

const angkaSel = (v: ExcelJS.CellValue): number => {
  if (typeof v === 'number') return v
  if (v && typeof v === 'object' && 'result' in v && typeof v.result === 'number') return v.result
  return 0
}

export function tulisLembar(wb: ExcelJS.Workbook, b: BentukLembar): ExcelJS.Worksheet {
  const { kolom } = b
  const r0 = barisIsi(b)
  const ws = wb.addWorksheet(b.nama, {
    views: [{ zoomScale: 80, zoomScaleNormal: 80 }],
    pageSetup: {
      paperSize: 9, horizontalCentered: true, showGridLines: false,
      printTitlesRow: b.nomor ? `${r0 - 1}:${r0 - 1}` : `${b.barisKepala}:${r0 - 1}`,
      ...b.halaman,
    },
  })
  kolom.forEach((k, i) => {
    const c = ws.getColumn(i + 1)
    if (k.lebar === 0) c.hidden = true
    else c.width = k.lebar
  })

  const kj = b.kolomJudul ?? 3
  ws.getCell(2, kj).value = b.judul
  ws.getCell(2, kj).font = { name: 'Arial', size: 14 }
  ws.getCell(2, kj).alignment = { vertical: 'middle' }
  ws.getRow(2).height = 17.4
  ws.getCell(3, kj).value = 'PROVINSI JAWA TENGAH'
  ws.getCell(3, kj).font = { name: 'Arial', size: 12 }
  ws.getRow(3).height = 15.6
  b.kop.forEach(([label, isi], i) => {
    ws.getCell(5 + i, 1).value = label
    ws.getCell(5 + i, 3).value = `: ${isi}`.trimEnd()
  })
  for (const s of b.kopLain ?? []) ws.getCell(s.r, s.c).value = s.v

  b.kisi.forEach((baris, r) => baris.forEach((t, c) => {
    const sel = ws.getCell(b.barisKepala + r, c + 1)
    sel.value = t
    sel.font = HURUF_KEPALA
    sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sel.border = BINGKAI
  }))
  for (const m of gabunganKepala(b.kisi)) ws.mergeCells(b.barisKepala + m.r1, m.c1 + 1, b.barisKepala + m.r2, m.c2 + 1)
  for (const [i, h] of Object.entries(b.tinggiKepala ?? {})) ws.getRow(b.barisKepala + Number(i)).height = h
  b.nomor?.forEach((t, c) => {
    const sel = ws.getCell(r0 - 1, c + 1)
    sel.value = t
    sel.font = HURUF_KEPALA
    sel.alignment = { horizontal: 'center', vertical: 'middle' }
    sel.border = BINGKAI
  })

  b.baris.forEach((isi, i) => {
    const r = r0 + i
    kolom.forEach((k, c) => {
      const sel = ws.getCell(r, c + 1)
      sel.value = isi[c] ?? ''
      sel.font = HURUF_ISI
      const kanan = k.tipe === 'uang' || k.tipe === 'angka'
      sel.alignment = { horizontal: kanan ? 'right' : 'left', vertical: 'top', wrapText: !kanan }
      if (k.tipe === 'uang') sel.numFmt = FMT_UANG
      else if (k.tipe === 'angka' && k.kunci !== 'no') sel.numFmt = FMT_ANGKA
      else if (k.tipe === 'register') sel.numFmt = '@'
      else if (k.tipe === 'tanggal') sel.numFmt = 'mm-dd-yy'
      sel.border = { left: TIPIS, right: TIPIS, ...(i === 0 ? { top: TIPIS } : {}) }
    })
  })
  const rPenutup = r0 + b.baris.length
  ws.getRow(rPenutup).height = b.tinggiPenutup
  kolom.forEach((_, c) => { ws.getCell(rPenutup, c + 1).border = { left: TIPIS, right: TIPIS, bottom: TIPIS, ...(b.baris.length === 0 ? { top: TIPIS } : {}) } })

  const rJumlah = rPenutup + 1
  const lain = b.jumlah.lain?.(rJumlah) ?? []
  const awalBingkai = Math.min(...b.jumlah.sum, ...lain.map(x => x.c)) - 1
  kolom.forEach((_, c) => {
    const sel = ws.getCell(rJumlah, c + 1)
    sel.font = HURUF_ISI
    sel.border = c >= awalBingkai ? BINGKAI : { top: TIPIS, bottom: TIPIS, ...(c === 0 ? { left: TIPIS } : {}), ...(c === awalBingkai - 1 ? { right: TIPIS } : {}) }
  })
  if (b.jumlah.label) {
    const sel = ws.getCell(rJumlah, b.jumlah.label[0])
    sel.value = b.jumlah.label[1]
    sel.alignment = { vertical: 'middle' }
  }
  for (const c of b.jumlah.sum) {
    const h = hurufKolom(c)
    const sel = ws.getCell(rJumlah, c)
    sel.value = { formula: `SUM(${h}${r0}:${h}${rPenutup})`, result: b.baris.reduce((s, isi) => s + angkaSel(isi[c - 1]), 0) }
    sel.numFmt = kolom[c - 1].tipe === 'uang' ? FMT_UANG : FMT_ANGKA
    sel.alignment = { horizontal: 'right', vertical: 'middle' }
  }
  for (const x of lain) {
    const sel = ws.getCell(rJumlah, x.c)
    sel.value = x.v
    if (x.numFmt) sel.numFmt = x.numFmt
    sel.alignment = { horizontal: 'right', vertical: 'middle' }
  }

  for (const t of b.ttd) {
    const r = rJumlah + t.d
    if (t.sampai && t.sampai > t.c) ws.mergeCells(r, t.c, r, t.sampai)
    const sel = ws.getCell(r, t.c)
    sel.value = t.v
    sel.font = HURUF_KEPALA
    sel.alignment = { horizontal: 'center' }
  }
  return ws
}

// ─── Tanda tangan ────────────────────────────────────────────────────────────

const TITIK = { nama: '………………………………', nip: '………………………', namaKanan: '…………………………………..', nipKanan: '………………………………', kota: '………………' }

/** Blok kiri "Mengetahui," — kepala SKPD (bawaan) atau penanggung jawab ruangan (KIR). */
export function blokKiri(c: number, jabatan: string, nama: string, nip: string): SelTtd[] {
  return [
    { d: 2, c, v: 'Mengetahui,' }, { d: 3, c, v: jabatan },
    { d: 7, c, v: `( ${nama || TITIK.nama} )` }, { d: 8, c, v: `NIP. ${nip || TITIK.nip}` },
  ]
}

/**
 * Blok kanan: kota+tanggal, jabatan, nama, NIP. `letak` = kolom tiap baris (BI & Rekap menaruh
 * jabatan dua baris di bawah kota; KIB menaruhnya tepat di bawah).
 */
export function blokKanan(
  p: PengaturanBba, tanggalCetak: string, jabatan: string, nama: string, nip: string,
  letak: { c: number; sampai?: number; dJabatan?: number; kotaDari?: number },
): SelTtd[] {
  const { c, sampai } = letak
  return [
    { d: 2, c: letak.kotaDari ?? c, sampai, v: `${p.ttd.kota || TITIK.kota} , ${tanggalPanjang(tanggalCetak)}` },
    { d: letak.dJabatan ?? 3, c, sampai, v: jabatan },
    { d: 7, c, sampai, v: `( ${nama || TITIK.namaKanan} )` }, { d: 8, c, sampai, v: `NIP. ${nip || TITIK.nipKanan}` },
  ]
}

export const kopBawaan = (p: PengaturanBba): [string, string][] => [
  ['Kode Lokasi', p.kop.kode_lokasi], ['Bidang', p.kop.bidang], ['Sub Bidang', p.kop.sub_bidang], ['Satuan Kerja', p.kop.satuan_kerja],
]

// ─── KIB A–F ─────────────────────────────────────────────────────────────────

export function nilaiSelKib(k: KolomKib, a: AsetRingan, no: number): ExcelJS.CellValue {
  switch (k.kunci) {
    case 'no': return no
    case 'nama_resmi': return a.nama_resmi
    case 'kode_barang': return a.kode_barang ?? ''
    case 'register': return a.register ?? ''
    case 'kondisi': return a.kondisi ? TEKS_KONDISI_KIB[a.kondisi] : ''
    case 'asal_usul': return a.asal_usul ?? ''
    case 'harga': return a.harga
    case 'keterangan': return a.keterangan ?? ''
  }
  const v = a.kib?.[k.kunci]
  if (v == null || v === '') return ''
  if (k.tipe === 'tanggal' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d))
  }
  return v
}

/**
 * Satu lembar KIB. `tanggalCetak` dioper (YYYY-MM-DD, WIB) — penyusun tidak membaca jam sendiri
 * supaya hasilnya bisa diuji.
 */
export function tulisLembarKib(wb: ExcelJS.Workbook, g: Golongan, rows: readonly AsetRingan[], p: PengaturanBba, tanggalCetak: string): ExcelJS.Worksheet {
  const kolom = KOLOM_KIB[g]
  const iHarga = kolom.findIndex(k => k.kunci === 'harga') + 1
  const t = p.ttd
  return tulisLembar(wb, {
    nama: `KIB${g}`, judul: JUDUL_KIB[g], kop: kopBawaan(p), kolom,
    kisi: kisiKepala(g), barisKepala: 10, tinggiKepala: { 2: 28.8 }, nomor: NOMOR_KOLOM[g],
    baris: urutCetak(rows).map((a, i) => kolom.map(k => nilaiSelKib(k, a, i + 1))),
    tinggiPenutup: 6,
    jumlah: { label: [iHarga - 2, 'Jumlah'], sum: [iHarga] },
    // Kiri di kolom D (KIB F: C), kanan di kolom Harga digabung sampai kolom terakhir.
    ttd: [
      ...blokKiri(g === 'F' ? 3 : 4, t.kepala_jabatan || 'KEPALA SKPD', t.kepala_nama, t.kepala_nip),
      ...blokKanan(p, tanggalCetak, 'Pengurus Barang', t.pengurus_nama, t.pengurus_nip, { c: iHarga, sampai: kolom.length }),
    ],
    halaman: {
      orientation: 'landscape', scale: 64,
      margins: { left: 0.197, right: 0.197, top: 0.551, bottom: 0.551, header: 0.315, footer: 0.315 },
    },
  })
}

export const NAMA_BERKAS_KIB = (g: Golongan | 'SEMUA', tanggal: string) => `KIB-${g === 'SEMUA' ? 'A-F' : g}-${tanggal}.xlsx`
