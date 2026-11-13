// app/(dashboard)/perjanjian-kinerja/form/_types.ts
import type { PkLevel, PkJenis, PkStatus } from '../_utils/pk-types'
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib'

export interface LampiranRow {
  unit_kerja: string
  level: PkLevel
  program: string | null
  kegiatan: string | null
  subkegiatan: string | null
  uraian: string
  indikator: string | null
  target: string | null
  satuan: string | null
  urutan: number
  _id?: string
  _deleted?: boolean
}

export interface AnggaranRow {
  unit_kerja: string
  level: PkLevel
  program: string | null
  kegiatan: string | null
  subkegiatan: string | null
  uraian: string
  keterangan_sumber: string
  nominal: number
  urutan: number
  auto_filled_from_blud: boolean
  _id?: string
  _deleted?: boolean
}

export interface PkFormState {
  id: number | null
  status: PkStatus
  /** I4: angka kunci dari server — dikirim balik saat Simpan & Finalisasi. */
  version: number
  tahun: string
  tanggal_dokumen: string
  jenis_pk: PkJenis
  unit_pertama: string
  nama_pertama: string
  jabatan_pertama: string
  pangkat_pertama: string
  nip_pertama: string
  unit_kedua: string
  nama_kedua: string
  jabatan_kedua: string
  pangkat_kedua: string
  nip_kedua: string
  lampiran: LampiranRow[]
  anggaran: AnggaranRow[]
}

export type TabKey = 'pihak1' | 'pihak2' | 'lampiran'

/** Pilihan Keterangan (Sumber Dana) Anggaran. 'APBD & BLUD' = nominal APBD diketik + bagian BLUD lewat ✎. */
export const SUMBER_DANA = ['APBD', 'BLUD', 'APBD & BLUD', 'APBN', 'HIBAH', 'LAINNYA'] as const

/** Panjang teks "Lainnya" — sisa ruang untuk " & BLUD" di kolom keterangan_sumber (50, Zod & DB). */
export const PANJANG_SUMBER_LAIN = 40

/** Sumber yang nominalnya diketik, dari pilihan dropdown (Lainnya = teks yang diketik). */
export function sumberUtama(pilihan: string, lainnya: string): string {
  if (pilihan === 'APBD & BLUD') return 'APBD'
  if (pilihan === 'LAINNYA') return lainnya.trim()
  return pilihan
}

/**
 * Keterangan yang tersimpan dan tercetak di Word. Bagian BLUD dari ✎ yang ditambahkan ke sumber lain
 * WAJIB ikut tertulis ("APBD & BLUD"): dulu nominal gabungan tersimpan berlabel "APBD" saja.
 */
export function keteranganAnggaran(pilihan: string, lainnya: string, adaBlud: boolean): string {
  if (pilihan === 'BLUD') return 'BLUD'
  const utama = sumberUtama(pilihan, lainnya)
  return adaBlud ? `${utama} & BLUD` : utama
}

/** Nominal yang tersimpan: sumber utama + bagian BLUD (pilihan BLUD = nominalnya sendiri). */
export function totalAnggaran(pilihan: string, nominal: number, bagianBlud: number | null): number {
  return pilihan === 'BLUD' ? nominal : nominal + (bagianBlud ?? 0)
}

/** Alasan Tambah Anggaran ditolak karena keterangan belum lengkap, atau null. */
export function alasanTolakSumber(pilihan: string, lainnya: string, bagianBlud: number | null): string | null {
  if (pilihan === 'LAINNYA' && !lainnya.trim()) return 'Tulis sumber dananya di kolom "Lainnya".'
  if (pilihan === 'APBD & BLUD' && bagianBlud === null) return 'Isi bagian BLUD lewat tombol ✎ di sebelah nominal.'
  return null
}
export type SumberDana = typeof SUMBER_DANA[number]

let _seq = 0
export function genRowId(): string {
  _seq += 1
  return `r_${_seq}_${Date.now().toString(36)}`
}

/** Form kosong untuk dokumen PK baru. B1: tanggal WIB — `toISOString()` memberi tanggal kemarin antara 00:00–06:59. */
export function emptyForm(tahun: string): PkFormState {
  return {
    id: null, status: 'DRAFT', version: 0, tahun,
    tanggal_dokumen: tanggalHariIniWIB(), jenis_pk: 'MURNI',
    unit_pertama: '', nama_pertama: '', jabatan_pertama: '', pangkat_pertama: '', nip_pertama: '',
    unit_kedua: '',   nama_kedua: '',   jabatan_kedua: '',   pangkat_kedua: '',   nip_kedua: '',
    lampiran: [], anggaran: [],
  }
}

/**
 * Form untuk PK berikutnya sesudah Simpan / "+ PK Baru": tahun, tanggal dokumen, dan jenis dipertahankan
 * (satu kali input beberapa PK biasanya sama). Pihak Kedua SENGAJA ikut dikosongkan — mempertahankannya
 * berisiko PK berikutnya tersimpan dengan atasan yang salah (keputusan pemilik 2026-11-13).
 */
export function formBerikutnya(f: PkFormState): PkFormState {
  return { ...emptyForm(f.tahun), tanggal_dokumen: f.tanggal_dokumen, jenis_pk: f.jenis_pk }
}

/** Sidik isi form untuk "belum tersimpan" — angka kunci & status bukan isian. */
export function sidikForm(f: PkFormState): string {
  return JSON.stringify({ ...f, version: 0, status: '' })
}
