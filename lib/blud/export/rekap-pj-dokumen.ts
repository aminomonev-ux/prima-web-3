// lib/blud/export/rekap-pj-dokumen.ts — unduhan Excel Rekap Penanggung Jawab (DPA & pasca-geser).
// Konsep: docs/konsep/blud/CONCEPT-blud-format-unduhan.md §3, §5a, §6.2.
//
// Angka dari `susunRekapPj` (lib/blud/rekap-pj.ts) — aturan yang SAMA dengan layar Cetak
// dan nominal BLUD Form PK. Berkas ini hanya menata; ia tidak menghitung ulang.
import type ExcelJS from 'exceljs'
import { loadExcelJs, downloadWorkbook, sanitizeCell } from '@/lib/shared/excel-export'
import { susunRekapPj, barisRekapDpa, barisRekapPergeseran, siapkanKonteksPj, type SusunanRekapPj, type KonteksPjMentah } from '@/lib/blud/rekap-pj'
import { hitungDeltaPergeseranRoot } from '@/lib/blud/recalc'
import { formatTanggalId, tanggalHariIniWIB } from '@/lib/blud/tanggal'
import {
  BARIS_KEPALA, argb, kopExcel, kepalaExcel, nomorKolomExcel, hiasSelData, hiasBarisTotalExcel,
  catatanExcel, tandaTanganExcel, aturCetakExcel, type PejabatTtd,
} from '@/lib/blud/export/gaya-dokumen'
import type { DpaBaris, PergeseranBaris } from '@/types'

export type SumberRekapPj = 'dpa' | 'pergeseran'

export interface UnduhRekapPjArgs {
  tahun: number
  versi: string | null
  sumber: SumberRekapPj
  rows: DpaBaris[] | PergeseranBaris[]
  direktur?: PejabatTtd | null
  /** Pembanding Audit Rekap PJ (versi lalu, tahun lalu, DPA acuan, label PK) — dimuat layar Cetak. */
  konteks?: KonteksPjMentah | null
}

export const KOLOM_REKAP_PJ = ['No', 'Penanggung Jawab / Uraian', 'Jumlah (Rp)', '%', 'Keterangan'] as const

/** Bahan bersama Excel & PDF: susunan + judul + baris 5 kop. */
export function bahanRekapPj(args: UnduhRekapPjArgs): { susunan: SusunanRekapPj; judul: string; baris5: string } {
  const { sumber, rows, versi } = args
  const pergeseran = sumber === 'pergeseran'
  const audit = pergeseran
    ? barisRekapPergeseran(rows as PergeseranBaris[])
    : barisRekapDpa(rows as DpaBaris[])
  const labelSumber = pergeseran ? 'Pergeseran' : 'DPA'
  const susunan = susunRekapPj(audit, labelSumber, {
    konteks: siapkanKonteksPj(sumber, args.konteks), labelPk: args.konteks?.labelPk,
  })
  // Pergeseran belum berimbang = dokumen DRAFT (sama dengan judul layar Cetak).
  const draft = pergeseran && hitungDeltaPergeseranRoot(rows as PergeseranBaris[]) !== 0
  const judul = pergeseran ? 'REKAP ANGGARAN PER PENANGGUNG JAWAB (PASCA-PERGESERAN)' : 'REKAP ANGGARAN PER PENANGGUNG JAWAB'
  const baris5 = [
    `Sumber: ${pergeseran ? 'Pergeseran' : 'DPA BLUD'}${versi ? ` versi ${formatTanggalId(versi)}` : ' terbaru'}`,
    draft ? 'DRAFT — pergeseran belum berimbang' : '',
  ].filter(Boolean).join(' · ')
  return { susunan, judul, baris5 }
}

export async function buatWorkbookRekapPj(args: UnduhRekapPjArgs): Promise<ExcelJS.Workbook> {
  if (!Array.isArray(args.rows) || args.rows.length === 0) throw new Error('Data kosong — tidak ada yang bisa diunduh')
  const { susunan, judul, baris5 } = bahanRekapPj(args)
  if (!susunan.baris.length) throw new Error('Belum ada baris ber-Penanggung Jawab di versi ini.')

  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const ws = wb.addWorksheet(args.sumber === 'pergeseran' ? 'Rekap PJ Pergeseran' : 'Rekap PJ')
  const kol = KOLOM_REKAP_PJ.length
  // Lebar DULU: tinggi baris catatan di bawah tabel ditaksir dari lebar kolom.
  ;[6, 58, 20, 8, 28].forEach((w, i) => { ws.getColumn(i + 1).width = w })
  kopExcel(ws, kol, judul, args.tahun, baris5, sanitizeCell)
  kepalaExcel(ws, BARIS_KEPALA, KOLOM_REKAP_PJ)
  nomorKolomExcel(ws, BARIS_KEPALA + 1, kol)

  const isi = (sel: ExcelJS.Cell, w: string) => { sel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: w } } }
  let n = BARIS_KEPALA + 2
  for (const b of susunan.baris) {
    const baris = ws.getRow(n++)
    if (b.jenis === 'kelompok') {
      baris.values = [b.huruf, sanitizeCell(b.pj), b.subtotal, b.porsi, '']
      for (let c = 1; c <= kol; c++) {
        hiasSelData(baris.getCell(c), { angka: c === 3 || c === 4, tebal: true, warna: 'navy' })
        isi(baris.getCell(c), argb('krem'))
      }
      baris.getCell(1).alignment = { horizontal: 'center', vertical: 'top' }
      baris.getCell(1).border = { ...baris.getCell(1).border, left: { style: 'thick', color: { argb: argb('amber') } } }
      baris.getCell(4).numFmt = '0.0%'
    } else if (b.jenis === 'rincian') {
      const dobel = b.dobelDengan != null
      baris.values = [`${b.nomor}.`, sanitizeCell(b.uraian), b.jumlah, '', dobel ? sanitizeCell(`* juga dihitung di ${b.dobelDengan}`) : '']
      for (let c = 1; c <= kol; c++) hiasSelData(baris.getCell(c), { angka: c === 3, uraian: c === 2, indent: 1 })
      baris.getCell(1).alignment = { horizontal: 'right', vertical: 'top' }
      if (dobel) {
        // Angka tetap tampil (subtotal mentah memuatnya), tapi tampak "tidak masuk total".
        for (const c of [3, 5]) baris.getCell(c).font = { ...baris.getCell(c).font, italic: true, color: { argb: argb('redup') } }
      }
    } else {
      baris.values = ['', `Jumlah ${b.huruf}`, b.subtotal, '', '']
      for (let c = 1; c <= kol; c++) {
        hiasSelData(baris.getCell(c), { angka: c === 3, tebal: true, warna: 'navy' })
        isi(baris.getCell(c), argb('kremPucat'))
        baris.getCell(c).border = { ...baris.getCell(c).border, top: { style: 'thin', color: { argb: argb('amber') } } }
      }
      baris.getCell(2).alignment = { horizontal: 'right', vertical: 'top' }
    }
  }
  const total = ws.getRow(n++)
  total.values = ['', 'JUMLAH SELURUHNYA', susunan.total, 1, '']
  hiasBarisTotalExcel(total, kol, [3, 4])
  total.getCell(4).numFmt = '0.0%'

  n += 1
  for (const c of susunan.catatan) catatanExcel(ws, n++, kol, sanitizeCell(c))
  tandaTanganExcel(ws, n + 1, 3, kol, args.direktur ?? null, sanitizeCell)

  aturCetakExcel(ws, { mendatar: false, kepalaAwal: BARIS_KEPALA, kepalaAkhir: BARIS_KEPALA + 1 })
  return wb
}

export async function exportRekapPjDokumen(args: UnduhRekapPjArgs): Promise<void> {
  const wb = await buatWorkbookRekapPj(args)
  const tag = (args.versi ?? tanggalHariIniWIB()).replace(/-/g, '')
  await downloadWorkbook(wb, `REKAP_PJ${args.sumber === 'pergeseran' ? '_PERGESERAN' : ''}_${args.tahun}_${tag}.xlsx`)
}
