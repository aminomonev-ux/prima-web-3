// lib/bba/kib-excel.ts — Excel KIB A–F berbentuk templat ekspor sistem aset provinsi.
// Konsep: docs/CONCEPT-bba-buku-aset.md §9. Kolom & kepala dari lib/bba/kib.ts (satu sumber).
// Bentuk ditiru dari lembar ekspor nyata: kop Arial 14/12 · kepala Calibri 11 tiga baris +
// nomor kolom · isi Arial 9 · satu baris pendek sesudah isi · baris "Jumlah" ber-SUM ·
// tanda tangan dua blok · A4 mendatar skala 64, nomor kolom diulang tiap halaman.
import type ExcelJS from 'exceljs'
import {
  KOLOM_KIB, JUDUL_KIB, NOMOR_KOLOM, TEKS_KONDISI_KIB, gabunganKepala, kisiKepala,
  type Golongan, type KolomKib,
} from './kib'
import type { AsetRingan } from './aset'
import type { PengaturanBba } from './pengaturan'

const BARIS_KEPALA = 10
const BARIS_ISI = 14
const TIPIS = { style: 'thin' } as ExcelJS.Border
const BINGKAI: Partial<ExcelJS.Borders> = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS }
const FMT_UANG = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'
const FMT_ANGKA = '_-* #,##0_-;-* #,##0_-;_-* "-"??_-;_-@_-'
const HURUF_ISI: Partial<ExcelJS.Font> = { name: 'Arial', size: 9 }
const HURUF_KEPALA: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 }

export function hurufKolom(n: number): string {
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}

function nilaiSel(k: KolomKib, a: AsetRingan, no: number): ExcelJS.CellValue {
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

/** Urutan cetak: kode barang (memuat tahun) lalu register — sama dengan ekspor provinsi. */
export function urutCetak(rows: readonly AsetRingan[]): AsetRingan[] {
  return [...rows].sort((a, b) => (a.kode_barang ?? '').localeCompare(b.kode_barang ?? '') || (a.register ?? '').localeCompare(b.register ?? '') || a.id - b.id)
}

export function tanggalPanjang(iso: string): string {
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${BULAN[m - 1]} ${y}`
}

/**
 * Satu lembar KIB. `tanggalCetak` dioper (YYYY-MM-DD, WIB) — penyusun tidak membaca jam sendiri
 * supaya hasilnya bisa diuji.
 */
export function tulisLembarKib(wb: ExcelJS.Workbook, g: Golongan, rows: readonly AsetRingan[], p: PengaturanBba, tanggalCetak: string): ExcelJS.Worksheet {
  const kolom = KOLOM_KIB[g]
  const n = kolom.length
  const ws = wb.addWorksheet(`KIB${g}`, {
    views: [{ zoomScale: 80, zoomScaleNormal: 80 }],
    pageSetup: {
      paperSize: 9, orientation: 'landscape', scale: 64, horizontalCentered: true,
      margins: { left: 0.197, right: 0.197, top: 0.551, bottom: 0.551, header: 0.315, footer: 0.315 },
      printTitlesRow: '13:13', showGridLines: false,
    },
  })
  kolom.forEach((k, i) => {
    const c = ws.getColumn(i + 1)
    if (k.lebar === 0) c.hidden = true
    else c.width = k.lebar
  })

  ws.getCell('C2').value = JUDUL_KIB[g]
  ws.getCell('C2').font = { name: 'Arial', size: 14 }
  ws.getCell('C2').alignment = { vertical: 'middle' }
  ws.getRow(2).height = 17.4
  ws.getCell('C3').value = 'PROVINSI JAWA TENGAH'
  ws.getCell('C3').font = { name: 'Arial', size: 12 }
  ws.getRow(3).height = 15.6
  const kop: [string, string][] = [
    ['Kode Lokasi', p.kop.kode_lokasi], ['Bidang', p.kop.bidang], ['Sub Bidang', p.kop.sub_bidang], ['Satuan Kerja', p.kop.satuan_kerja],
  ]
  kop.forEach(([label, isi], i) => {
    ws.getCell(5 + i, 1).value = label
    ws.getCell(5 + i, 3).value = `: ${isi}`.trimEnd()
  })

  // Kepala tiga baris + gabungan (rumus gabungan diuji sama persis dengan templat).
  const kisi = kisiKepala(g)
  kisi.forEach((baris, r) => baris.forEach((t, c) => {
    const sel = ws.getCell(BARIS_KEPALA + r, c + 1)
    sel.value = t
    sel.font = HURUF_KEPALA
    sel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sel.border = BINGKAI
  }))
  for (const m of gabunganKepala(kisi)) ws.mergeCells(BARIS_KEPALA + m.r1, m.c1 + 1, BARIS_KEPALA + m.r2, m.c2 + 1)
  ws.getRow(BARIS_KEPALA + 2).height = 28.8
  NOMOR_KOLOM[g].forEach((t, c) => {
    const sel = ws.getCell(BARIS_KEPALA + 3, c + 1)
    sel.value = t
    sel.font = HURUF_KEPALA
    sel.alignment = { horizontal: 'center', vertical: 'middle' }
    sel.border = BINGKAI
  })

  const urut = urutCetak(rows)
  urut.forEach((a, i) => {
    const r = BARIS_ISI + i
    kolom.forEach((k, c) => {
      const sel = ws.getCell(r, c + 1)
      sel.value = nilaiSel(k, a, i + 1)
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
  // Baris pendek penutup isi (6 pt) — ada di ekspor provinsi, termasuk di dalam rentang SUM.
  const rPenutup = BARIS_ISI + urut.length
  ws.getRow(rPenutup).height = 6
  kolom.forEach((_, c) => { ws.getCell(rPenutup, c + 1).border = { left: TIPIS, right: TIPIS, bottom: TIPIS, ...(urut.length === 0 ? { top: TIPIS } : {}) } })

  const iHarga = kolom.findIndex(k => k.kunci === 'harga')
  const rJumlah = rPenutup + 1
  kolom.forEach((_, c) => {
    const sel = ws.getCell(rJumlah, c + 1)
    sel.font = HURUF_ISI
    sel.border = c >= iHarga ? BINGKAI : { top: TIPIS, bottom: TIPIS, ...(c === 0 ? { left: TIPIS } : {}), ...(c === iHarga - 1 ? { right: TIPIS } : {}) }
  })
  ws.getCell(rJumlah, iHarga - 1).value = 'Jumlah'
  ws.getCell(rJumlah, iHarga - 1).alignment = { vertical: 'middle' }
  const hHarga = hurufKolom(iHarga + 1)
  const total = urut.reduce((s, a) => s + a.harga, 0)
  const selTotal = ws.getCell(rJumlah, iHarga + 1)
  selTotal.value = { formula: `SUM(${hHarga}${BARIS_ISI}:${hHarga}${rPenutup})`, result: total }
  selTotal.numFmt = FMT_UANG
  selTotal.alignment = { horizontal: 'right', vertical: 'middle' }

  // Tanda tangan: kiri di kolom D (KIB F: C), kanan di kolom Harga digabung sampai kolom terakhir.
  const kiri = g === 'F' ? 3 : 4
  const t = p.ttd
  const blokKiri = ['Mengetahui,', t.kepala_jabatan || 'KEPALA SKPD', `( ${t.kepala_nama || '………………………………'} )`, `NIP. ${t.kepala_nip || '………………………'}`]
  const blokKanan = [`${t.kota || '………………'} , ${tanggalPanjang(tanggalCetak)}`, 'Pengurus Barang', `( ${t.pengurus_nama || '…………………………………..'} )`, `NIP. ${t.pengurus_nip || '………………………………'}`]
  const geser = [2, 3, 7, 8]
  geser.forEach((d, i) => {
    const r = rJumlah + d
    const sKiri = ws.getCell(r, kiri)
    sKiri.value = blokKiri[i]
    sKiri.font = HURUF_KEPALA
    sKiri.alignment = { horizontal: 'center' }
    if (iHarga + 1 < n) ws.mergeCells(r, iHarga + 1, r, n)
    const sKanan = ws.getCell(r, iHarga + 1)
    sKanan.value = blokKanan[i]
    sKanan.font = HURUF_KEPALA
    sKanan.alignment = { horizontal: 'center' }
  })
  return ws
}

export const NAMA_BERKAS_KIB = (g: Golongan | 'SEMUA', tanggal: string) => `KIB-${g === 'SEMUA' ? 'A-F' : g}-${tanggal}.xlsx`
