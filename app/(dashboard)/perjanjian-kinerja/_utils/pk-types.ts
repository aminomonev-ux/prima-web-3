// app/(dashboard)/perjanjian-kinerja/_utils/pk-types.ts
// Type alias untuk row data PK — derive dari shape API (lib/data/pk-schemas.ts).

export type PkLevel = 'program' | 'kegiatan' | 'subkegiatan';
export type PkJenis = 'MURNI' | 'PERUBAHAN';
export type PkStatus = 'DRAFT' | 'FINAL';

export interface PkSasaranRow {
  id?: number;
  program: string;
  indikator_program: string | null;
  target_program: string | null;
  kegiatan: string | null;
  indikator_kegiatan: string | null;
  target_kegiatan: string | null;
  subkegiatan: string | null;
  indikator_subkegiatan: string | null;
  target_subkegiatan: string | null;
  tahun?: string;
  _deleted?: boolean;
  _dirty?: boolean;
}

export interface PkProgramRow {
  id?: number;
  program: string;
  kegiatan: string | null;
  subkegiatan: string | null;
  level: PkLevel;
  tahun?: string;
  _dirty?: boolean;
  /** Checkbox selection state untuk bulk delete. */
  _selected?: boolean;
  /** Intent dari level picker — kunci cell di atas intent (program-only → kegiatan+subkeg lock). Existing rows dari DB tidak punya intent → free edit. */
  _intent?: PkLevel;
}

export interface PkProgramHierarchy {
  programs: string[];
  kegiatanByProgram: Record<string, string[]>;
  subByKegiatan: Record<string, string[]>;
}

export interface PkUnitKerja {
  id: number;
  nama_unit: string;
  level: PkLevel;
  atasan_default: string | null;
  selectable_as_pertama: boolean;
  urutan: number;
  active: boolean;
}

export interface PkPejabat {
  id?: number;
  unit_kerja: string;
  nama: string;
  jabatan: string;
  pangkat: string | null;
  nip: string | null;
  is_active?: boolean;
  tahun?: string;
}

export interface PkDokumenRow {
  id: number;
  tahun: string;
  tanggal_dokumen: string;
  jenis_pk: PkJenis;
  unit_pertama: string;
  nama_pertama: string;
  jabatan_pertama: string;
  unit_kedua: string;
  nama_kedua: string;
  jabatan_kedua: string;
  status: PkStatus;
  generated_at: string | null;
  generated_filesize: number | null;
  created_at: string;
  created_by: number | null;
}
