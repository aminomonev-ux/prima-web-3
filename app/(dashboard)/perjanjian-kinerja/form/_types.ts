// app/(dashboard)/perjanjian-kinerja/form/_types.ts
import type { PkLevel, PkJenis, PkStatus } from '../_utils/pk-types'

export interface LampiranRow {
  unit_kerja: string
  level: PkLevel
  program: string | null
  kegiatan: string | null
  subkegiatan: string | null
  uraian: string
  indikator: string | null
  target: string | null
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

export const SUMBER_DANA = ['APBD', 'BLUD', 'APBN', 'HIBAH', 'LAINNYA'] as const
export type SumberDana = typeof SUMBER_DANA[number]

let _seq = 0
export function genRowId(): string {
  _seq += 1
  return `r_${_seq}_${Date.now().toString(36)}`
}
