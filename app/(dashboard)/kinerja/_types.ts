// ─── PRIMA E-Anggaran — Shared Types ────────────────────────────────────────────
// O2: extract type alias dari kinerja-client.tsx (3,222 baris god component).
// Semua type yang dipakai cross-tab (Dashboard, Master, Rekening, SSK,
// Realisasi, CRR, Pendapatan, Cetak, Laporan) di-pindah ke sini supaya tab
// files tidak duplicate definition.

// ─── Enum-like literals ─────────────────────────────────────────────────────

export type SumberSSK   = 'GAJI' | 'BLUD' | 'HARLEP' | 'PROMKES' | 'SARPRAS' | 'OBAT' | 'PEMELIHARAAN' | 'PEMBANGUNAN';
export type MasterTipe  = 'program' | 'kegiatan' | 'subkegiatan' | 'uraian_ssk' | 'sumber_anggaran';
export type KTab        = 'dashboard' | 'master' | 'rekening' | 'ssk' | 'realisasi' | 'cetak' | 'pend-crr' | 'laporan' | 'pengaturan';
export type MonthKey    = 'jan'|'feb'|'mar'|'apr'|'mei'|'jun'|'jul'|'agu'|'sep'|'okt'|'nov'|'des';
export type SskMonths   = Record<MonthKey, number>;

// ─── Row data shapes (mirror schema-mysql.sql tables) ───────────────────────

export interface MasterRow {
  id: number;
  tipe: MasterTipe;
  sumber: SumberSSK | null;
  nama: string;
  program_ref: string | null;
  kegiatan_ref: string | null;
  subkegiatan_ref: string | null;
  urut: number;
}

export interface RekeningRow {
  id: number;
  uraian: string;
  uraian_ssk: string | null;
  sumber_anggaran: string | null;
  program: string | null;
  kegiatan: string | null;
  subkegiatan: string | null;
}

export interface SskRow {
  id?: number;
  uraian_ssk: string;
  uraian: string;
  program: string;
  kegiatan: string;
  subkegiatan: string;
  pagu: number;
  months: SskMonths;
  months_pct: SskMonths;
  total: number;
  total_pct: number;
  // Refactor Versi (Checkpoint C):
  canonical_id?: string;
  versi_tipe?: 'MURNI' | 'PERUBAHAN';
  versi_seq?: number;
  is_nullified?: boolean;
  locked_at?: string | null;
}

export interface RealRow {
  id?: number;
  bulan: number;
  keterangan: string;
  program: string;
  kegiatan: string;
  subkegiatan: string;
  uraian_ssk: string;
  // Refactor Versi (Checkpoint C): pointer ke SSK canonical (cross-versi)
  ssk_canonical_id?: string;
  ssk_versi_tipe?: 'MURNI' | 'PERUBAHAN';
  ssk_versi_seq?: number;
  pagu_awal: number;
  target_fisik: number;
  real_fisik: number;
  pct_fisik: number;
  akum_target_fisik: number;
  akum_real_fisik: number;
  akum_pct_fisik: number;
  real_keuangan: number;
  pct_keuangan: number;
  akum_keuangan: number;
  akum_pct_keuangan: number;
  deviasi_fisik: number;
  deviasi_keuangan: number;
}

export interface CrrRow {
  bulan_ke: number;
  bulan: string;
  pendapatan: number;
  belanja_blud: number;
  belanja_daerah: number;
  pendapatan_sd: number;
  belanja_blud_sd: number;
  belanja_daerah_sd: number;
  crr_parsial_pct: number;
  crr_total_pct: number;
}

export interface PendRow {
  id?: number;
  keterangan: string;
  target: number;
  realisasi: number;
  capaian_pct: number;
}

// Master options (cached at shell, shared antar Master/Rekening/SSK tab).
// program/kegiatan/sumber_anggaran/uraian_ssk = list nama (string[]) untuk dropdown,
// kegiatanRows/subkegiatanRows/sskRows = full row data untuk filter by ref hierarki.
export interface MasterOpts {
  program: string[];
  kegiatan: string[];
  kegiatanRows: MasterRow[];
  subkegiatan: string[];
  subkegiatanRows: MasterRow[];
  sumber_anggaran: string[];
  uraian_ssk: string[];
  sskRows: MasterRow[];
}

// ─── Form & KPI shapes ──────────────────────────────────────────────────────

export interface RekForm {
  uraian: string;
  uraian_ssk: string;
  sumber_anggaran: string;
  program: string;
  kegiatan: string;
  subkegiatan: string;
}

export interface KpiData {
  total_pagu: number;
  total_ssk_rows: number;
  total_rekening: number;
  total_real_keuangan: number;
  pct_serapan: number;
  pagu_per_sumber: Partial<Record<SumberSSK, number>>;
}

// ─── Laporan shapes (chart trend per sumber) ────────────────────────────────

export interface LaporanTrend {
  bulan: number;
  real_keuangan: number;
  pct_keuangan: number;
  akum_keuangan: number;
  akum_pct_keuangan: number;
  real_fisik: number;
  akum_pct_fisik: number;
}

export interface LaporanSumber {
  sumber: SumberSSK;
  total_pagu: number;
  total_target_fisik: number;
  total_real_keuangan: number;
  total_real_fisik: number;
  pct_serapan: number;
  pct_fisik: number;
  bulan_terakhir: number;
  trend: LaporanTrend[];
}

// ─── Form input field name types (untuk updateXxxInput handler) ─────────────

export type RealInputField = 'keterangan' | 'pagu_awal' | 'target_fisik' | 'real_fisik' | 'real_keuangan';
export type CrrInputField  = 'belanja_blud' | 'belanja_daerah';
