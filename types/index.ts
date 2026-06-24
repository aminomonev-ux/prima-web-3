// ─── PRIMA — Type Definitions ───────────────────────────────────────────────

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'ADMIN_KASUBAG'
  | 'ADMIN_KABAG'
  | 'BIDANG_UMUM'
  | 'BIDANG_KEUANGAN'
  | 'BIDANG_PELAYANAN'
  | 'BIDANG_PENUNJANG'
  | 'RENBANG'
  | 'UMUM'
  | 'KEUANGAN'
  | 'PELAYANAN'
  | 'PENUNJANG'
  | 'KEPERAWATAN'
  | 'PROGRAM'
  | 'MDSI'
  | 'DIKLAT'
  | 'RUMAH TANGGA'
  | 'TUKMAS'
  | 'KEPEGAWAIAN'
  | 'PERBENDAHARAAN'
  | 'AKUNTANSI'
  | 'PENGEMBANGAN PENDAPATAN'
  | 'PELAYANAN MEDIS'
  | 'KEPERAWATAN MEDIS'
  | 'PENUNJANG MEDIS'
  | 'PENUNJANG NON MEDIS';

// Hanya 3 status user yang benar-benar di-set oleh code path:
// - MENUNGGU: setelah register, sebelum klik link verifikasi email
// - AKTIF: setelah verifikasi email berhasil
// - NONAKTIF: setelah admin tekan tombol "Nonaktifkan" di Kelola User
// 'DITOLAK' & 'PENDING' lama dihapus karena tidak ada API yang men-set.
export type UserStatus = 'AKTIF' | 'NONAKTIF' | 'MENUNGGU';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  nama_lengkap?: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  failed_attempts: number;
  locked_until?: Date;
}

export interface SessionPayload {
  userId: number;
  username: string;
  role: Role;
  email: string;
  sessionId?: string;
  lastActive?: number;
  // SEC-W3: epoch seconds pertama kali login. Persists across keepalive
  // rotations (createToken meneruskannya). getSession reject kalau
  // `now - originalIat*1000 > SESSION_ABSOLUTE_LIFETIME_HOURS*3600*1000`.
  originalIat?: number;
  iat?: number;
  exp?: number;
}

// ─── Usulan Aset ─────────────────────────────────────────────────────────────

export type StatusItem =
  | 'DRAFT'
  | 'DIAJUKAN_REVIEW'
  | 'REVISI_BIDANG'
  | 'DITOLAK_BIDANG'
  | 'DIAJUKAN'
  | 'DITELAAH'
  | 'DIREVISI_ADMIN'
  | 'DITOLAK_ADMIN'
  | 'DIPROSES'
  | 'DIREVISI_KASUBAG'
  | 'DISETUJUI'
  | 'DITOLAK';

export type StatusRingkas =
  | 'DRAFT'
  | 'DIAJUKAN_REVIEW'
  | 'REVISI_BIDANG'
  | 'DITOLAK_BIDANG'
  | 'DIAJUKAN'
  | 'DITELAAH'
  | 'DITOLAK_ADMIN'
  | 'DIPROSES'
  | 'DISETUJUI'
  | 'DITOLAK';

export type Prioritas = 'TINGGI' | 'SEDANG' | 'RENDAH';

export interface UsulanHeader {
  id: number;
  no_usulan: string;
  tanggal: Date;
  pengusul: string;
  sub_bidang: string;
  jenis_belanja?: string;
  tahun_anggaran?: string;
  jenis_usulan: 'MURNI' | 'PERUBAHAN';
  jumlah_item: number;
  total_nilai: number;
  total_nominal: number;
  status_ringkas: StatusRingkas;
  created_at: Date;
  updated_at: Date;
  matched_items?: string | null;
}

export interface UsulanItem {
  id: number;
  usulan_id: number;
  no_usulan: string;
  no_item: number;
  sub_bidang: string;
  pengusul: string;
  jenis_belanja?: string;
  nama_barang: string;
  spesifikasi?: string;
  qty: number;
  satuan: string;
  harga_est: number;
  total_est: number;
  prioritas: Prioritas;
  status: StatusItem;
  file_url?: string;
  // Bidang fields
  bidang_by?: string;
  bidang_tgl?: string;
  bidang_keputusan?: string;
  bidang_catatan?: string;
  // Admin fields
  admin_by?: string;
  admin_tgl?: string;
  admin_rekomendasi?: string;
  admin_catatan?: string;
  admin_qty?: number;
  admin_nominal?: number;
  admin_harga?: number;
  // Kasubag fields
  kasubag_by?: string;
  kasubag_tgl?: string;
  kasubag_putusan?: string;
  kasubag_catatan?: string;
  // Kabag fields
  kabag_by?: string;
  kabag_tgl?: string;
  kabag_putusan?: string;
  kabag_catatan?: string;
  // Final
  qty_disetujui?: number;
  nominal_disetujui?: number;
  created_at: Date;
  updated_at: Date;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  ok: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── BLUD — DPA & Pergeseran ──────────────────────────────────────────────────

/**
 * Chain hierarchy (strict L1 → L8.1, no branching).
 *
 *   L1   GRANDMASTER       (root)
 *   L2   MASTER            head
 *   L2.1 CHILD             leaf/aggregator
 *   L3   LEADER            head
 *   L3.1 MEMBER            leaf/aggregator
 *   L4   PLETON-LEADER     head
 *   L4.1 PLETON-MEMBER     leaf/aggregator
 *   L5   KETUA-KELOMPOK-A  head
 *   L5.1 ANGGOTA-KELOMPOK-A leaf/aggregator
 *   L6   KETUA-KELOMPOK-B  head
 *   L6.1 ANGGOTA-KELOMPOK-B leaf/aggregator
 *   L7   L7-HEAD           head
 *   L7.1 L7-SUB            leaf/aggregator
 *   L8   L8-HEAD           head
 *   L8.1 L8-SUB            leaf (max depth)
 */
export type TipeBaris =
  | 'GRANDMASTER'
  | 'MASTER'
  | 'CHILD'
  | 'LEADER'
  | 'MEMBER'
  | 'PLETON-LEADER'
  | 'PLETON-MEMBER'
  | 'KETUA-KELOMPOK-A'
  | 'ANGGOTA-KELOMPOK-A'
  | 'KETUA-KELOMPOK-B'
  | 'ANGGOTA-KELOMPOK-B'
  | 'L7-HEAD'
  | 'L7-SUB'
  | 'L8-HEAD'
  | 'L8-SUB'

export interface DpaBaris {
  id: number
  versi_tanggal: string
  is_latest: number
  kode_rekening: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlah: number
  penanggung_jawab: string | null
  keterangan: string | null
  tipe_baris: TipeBaris
  row_id: string
  parent_id: string | null
  urutan: number
  origin: 'MANUAL' | 'USULAN'
  usulan_item_id: number | null
  usulan_no: string | null
}

export interface DpaBarisInput {
  kode_rekening: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlah: number
  penanggung_jawab?: string | null
  keterangan?: string | null
  tipe_baris: TipeBaris
  row_id: string
  parent_id: string | null
  urutan: number
  origin?: 'MANUAL' | 'USULAN'
  usulan_item_id?: number | null
  usulan_no?: string | null
}

export interface PergeseranBaris {
  id: number
  versi_tanggal: string
  dpa_versi_tanggal: string
  is_latest: number
  kode_rekening: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlah: number
  vol_p: number | null
  harga_p: number | null
  pergeseran: number
  bertambah_berkurang: number
  tipe_baris: TipeBaris
  row_id: string
  parent_id: string | null
  urutan: number
}

export interface PergeseranBarisInput {
  kode_rekening: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlah: number
  vol_p: number | null
  harga_p: number | null
  pergeseran: number
  bertambah_berkurang: number
  tipe_baris: TipeBaris
  row_id: string
  parent_id: string | null
  urutan: number
}

export interface DpaHistoryItem {
  versi_tanggal: string
  jumlah_baris: number
}

export interface PergeseranHistoryItem {
  versi_tanggal: string
  dpa_versi_tanggal: string
  jumlah_baris: number
}
