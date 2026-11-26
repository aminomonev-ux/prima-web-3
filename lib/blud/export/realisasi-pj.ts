// lib/blud/export/realisasi-pj.ts — unduh "Realisasi per Penanggung Jawab" (Excel & PDF).
//
// Dirakit di peramban dari hasil `rekapPerPj` yang SAMA dgn tabel di layar (pola Rekap
// E-Anggaran): berkas wajib memuat angka yang persis tampil, dan menghitung ulang di sini
// = dua sumber kebenaran untuk satu tabel. exceljs/jspdf dimuat saat tombol ditekan
// (PERF-C3) — berkas ini tanpa impor tingkat-atas pustaka berat.

import { loadExcelJs, downloadWorkbook } from '@/lib/shared/excel-export'
import type ExcelJS from 'exceljs'
import {
  kolomRekapPj, kolomRincianPj, tabelRekapPj, tabelRincianPj, LABEL_TANPA_PJ,
  type BarisPj, type HasilRekapPj, type SelEkspor,
} from '@/lib/blud/realisasi-pj'
import { kalimatDiLuarPagu, type DiLuarPagu } from '@/lib/blud/di-luar-pagu'
import { kakiDokPdf, type KopDok } from '@/lib/shared/gaya-dokumen'
import { tulisTabelExcel, gambarTabelPdf, type DokTabel, type BarisDok, type JenisKolom } from '@/lib/shared/tabel-dokumen'
import { MODUL_BLUD } from '@/lib/blud/export/gaya-dokumen'

export interface ArgEksporPj {
  tahun:     number
  namaBulan: string
  /** "Pagu dari Pergeseran 12 Okt 2026" — kalimat yang sama dgn pil di layar. */
  sumber:    string
  hasil:     HasilRekapPj
  rows:      readonly BarisPj[]
  /** `di_luar_pagu` route pagu — titik waktunya sama dgn kolom s.d. di berkas. */
  diLuar?:   DiLuarPagu | null
}

const NAMA_BERKAS = (a: ArgEksporPj, ext: string) => `Realisasi-per-PJ-${a.namaBulan}-${a.tahun}.${ext}`

function kop(a: ArgEksporPj, judul: string): KopDok {
  return {
    judul, subjudul: 'BADAN LAYANAN UMUM DAERAH',
    periode: `S.D. ${a.namaBulan.toUpperCase()} ${a.tahun}`, keterangan: a.sumber, modul: MODUL_BLUD,
  }
}

/** Catatan yang wajib ikut ke berkas — angka yang dibawa ke rapat tidak boleh kehilangan sebabnya. */
export function catatanEksporPj(a: ArgEksporPj): string[] {
  const c = [
    'PJ sebuah rekening = PJ di baris itu atau induk terdekatnya, menurut versi yang jadi sumber pagu sekarang.',
  ]
  if (a.hasil.konflik > 0) {
    c.push(`${a.hasil.konflik} baris ber-PJ yang induknya juga ber-PJ — dihitung ke PJ induk saja, supaya uangnya tidak terhitung dua kali.`)
  }
  if (a.hasil.tanpaPj) c.push(`"${LABEL_TANPA_PJ}" = rekening yang rantainya tidak ber-PJ di DPA/Pergeseran.`)
  // Tanpa kalimat ini JUMLAH berkas lebih kecil dari kas yang keluar, dan orang yang cuma
  // memegang berkasnya tidak punya cara mengetahui sebabnya.
  const luar = a.diLuar ? kalimatDiLuarPagu(a.diLuar, `s.d. ${a.namaBulan}`) : null
  if (luar) c.push(luar)
  return c
}

const tebal = (sel: SelEkspor) => typeof sel === 'string' && (sel === 'JUMLAH' || sel.startsWith('Jumlah '))

/** Baris berkas: JUMLAH = baris total amber, "Jumlah <PJ>" = subtotal bertingkat. */
const barisDok = (isi: SelEkspor[][]): BarisDok[] =>
  isi.map(sel => (sel[0] === 'JUMLAH' ? { sel, total: true } : tebal(sel[0]) ? { sel, tingkat: 'induk2' } : { sel }))

const jenis = (kolom: string[], angkaMulai: number): JenisKolom[] =>
  kolom.map((k, i) => (i < angkaMulai ? (i === 1 && angkaMulai > 1 ? 'kode' : 'teks') : k === '%' ? 'angka' : i === 1 ? 'angka' : 'rupiah'))

/** Dua dokumen (rekap, rincian) — SATU susunan untuk Excel DAN PDF. */
export function dokRealisasiPj(a: ArgEksporPj): { rekap: DokTabel; rincian: DokTabel } {
  const kRekap = kolomRekapPj(a.namaBulan)
  const kRinci = kolomRincianPj(a.namaBulan)
  const jRekap = jenis(kRekap, 1)
  const jRinci = jenis(kRinci, 3)
  const lRekap = [34, 10, 18, 16, 18, 18, 18, 7]
  const lRinci = [26, 28, 42, 17, 15, 17, 17, 17, 7]
  return {
    rekap: {
      kop: kop(a, 'REALISASI ANGGARAN PER PENANGGUNG JAWAB'),
      kolom: kRekap.map((judul, i) => ({ judul, jenis: jRekap[i], lebar: lRekap[i] })),
      baris: barisDok(tabelRekapPj(a.hasil)),
      catatan: catatanEksporPj(a),
      mendatar: true,
    },
    rincian: {
      kop: kop(a, 'RINCIAN REKENING PER PENANGGUNG JAWAB'),
      kolom: kRinci.map((judul, i) => ({ judul, jenis: i === 2 ? 'uraian' : jRinci[i], lebar: lRinci[i] })),
      baris: barisDok(tabelRincianPj(a.rows, a.hasil)),
      catatan: catatanEksporPj(a),
      mendatar: true,
    },
  }
}

// ─── Excel ───────────────────────────────────────────────────────────────────

/** Dipisah dari tombolnya supaya isi berkas bisa diuji di Node, bukan dicocokkan ke sumbernya. */
export async function buatWorkbookRealisasiPj(a: ArgEksporPj): Promise<ExcelJS.Workbook> {
  const ExcelJSLib = await loadExcelJs()
  const wb = new ExcelJSLib.Workbook()
  const { rekap, rincian } = dokRealisasiPj(a)
  tulisTabelExcel(wb.addWorksheet('Rekap per PJ'), rekap)
  tulisTabelExcel(wb.addWorksheet('Rincian Rekening'), rincian)
  return wb
}

export async function unduhRealisasiPjExcel(a: ArgEksporPj): Promise<void> {
  await downloadWorkbook(await buatWorkbookRealisasiPj(a), NAMA_BERKAS(a, 'xlsx'))
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

/** Dipisah dari tombolnya supaya isi berkas bisa diuji di Node. */
export async function buatPdfRealisasiPj(a: ArgEksporPj) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const { rekap, rincian } = dokRealisasiPj(a)
  gambarTabelPdf(doc, autoTable, rekap)
  gambarTabelPdf(doc, autoTable, rincian, { halamanBaru: true })
  kakiDokPdf(doc, MODUL_BLUD)
  return doc
}

export async function unduhRealisasiPjPdf(a: ArgEksporPj): Promise<void> {
  (await buatPdfRealisasiPj(a)).save(NAMA_BERKAS(a, 'pdf'))
}
