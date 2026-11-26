// lib/blud/export/gaya-dokumen.ts — gaya unduhan BLUD = gaya bersama `lib/shared/gaya-dokumen.ts`
// dengan identitas BLUD (subjudul "BADAN LAYANAN UMUM DAERAH", kaki "PRIMA - BLUD").
// Bentuk pemanggilan lama (posisi argumen) dipertahankan supaya eksportir BLUD tidak berubah.
import type ExcelJS from 'exceljs'
import {
  kopDokExcel, kopDokPdf, kakiDokPdf, aturCetakExcel as aturCetakBersama, periodeTahun,
  type KopDok, type DokPdf,
} from '@/lib/shared/gaya-dokumen'

export * from '@/lib/shared/gaya-dokumen'

export const MODUL_BLUD = 'BLUD'
const SUBJUDUL_BLUD = 'BADAN LAYANAN UMUM DAERAH'

const kopBlud = (judul: string, tahun: number | null, baris5: string | undefined): KopDok => ({
  judul, subjudul: SUBJUDUL_BLUD, periode: periodeTahun(tahun), keterangan: baris5, modul: MODUL_BLUD,
})

/**
 * Kop dokumen BLUD. `baris5` — penanda Perubahan / acuan / versi; BIARKAN di baris 5:
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
  kopDokExcel(ws, kolTerakhir, kopBlud(judul, tahun, baris5), bersih)
}

export function kopPdf(doc: DokPdf, judul: string, tahun: number | null, baris5: string | undefined): number {
  return kopDokPdf(doc, kopBlud(judul, tahun, baris5))
}

export function kakiPdf(doc: DokPdf): void {
  kakiDokPdf(doc, MODUL_BLUD)
}

export function aturCetakExcel(
  ws: ExcelJS.Worksheet,
  opsi: { mendatar: boolean; kepalaAwal: number; kepalaAkhir: number },
): void {
  aturCetakBersama(ws, { ...opsi, modul: MODUL_BLUD })
}
