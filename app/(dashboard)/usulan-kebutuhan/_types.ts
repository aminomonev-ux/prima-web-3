// Shared types, constants, and pure helpers untuk usulan-client + _modals/* + _panels/*
// Sumber: dipindah dari usulan-client.tsx saat refactor PERF-C2
// Lokasi: top level (sibling dari _modals/) untuk import path uniform dari subdirs.

// ── Panel type ───────────────────────────────────────────────────

export type Panel =
  | 'dashboard' | 'buat' | 'milik' | 'tracking' | 'semua' | 'data-admin' | 'rekap' | 'antrian'
  | 'data-usulan' | 'rekap-verif' | 'bidang-antrian' | 'bidang-data'
  | 'kelola-user' | 'batas-waktu' | 'set-pagu' | 'hapus-usulan';

// ── Interfaces ───────────────────────────────────────────────────

export interface KPIData {
  total: number; disetujui: number; ditolak: number;
  proses: number; menunggu_admin: number; nominal: number;
  nilai_aktif: number; nilai_telaah: number; nilai_disetujui: number; pagu: number;
  chartStatus: { status: string; cnt: number }[];
  chartBidang: { sub_bidang: string; cnt: number; total_est: number; nominal_admin?: number; nominal_kasubag?: number; nominal_disetujui?: number }[];
  bidang_antrian: number; bidang_revisi: number; bidang_ditolak: number;
  bidang_direview: number; bidang_diteruskan: number; bidang_nilai_antrian: number;
}

export interface UsulanHeader {
  id: number; no_usulan: string; tanggal: string; pengusul: string;
  sub_bidang: string; jenis_belanja: string; jumlah_item: number;
  total_nilai: number; total_nominal: number; status_ringkas: string;
  pembuat?: string; status_counts?: Record<string, number>;
  jumlah_item_admin?: number; total_nilai_admin?: number;
  matched_items?: string | null; created_by?: number;
}

export interface UsulanItem {
  id: number; no_item: number; nama_barang: string; spesifikasi: string;
  qty: number; satuan: string; harga_est: number; total_est: number;
  prioritas: string; status: string; nominal_disetujui: number;
  admin_catatan: string; admin_qty: number; admin_harga: number; admin_nominal: number;
  kasubag_catatan: string; kasubag_putusan: string; kasubag_qty: number; kasubag_harga: number; kasubag_nominal: number;
  kabag_catatan: string; file_url: string; jenis_belanja: string;
  bidang_keputusan: string; bidang_catatan: string; bidang_by: string;
  nama_asal: string; spesifikasi_asal: string; qty_asal: number; harga_asal: number;
  sub_bidang?: string; alasan?: string; url_merk1?: string; url_merk2?: string; url_merk3?: string;
}

export interface ItemForm {
  id: string; nama_barang: string; spesifikasi: string; qty: number;
  satuan: string; harga_est: number; prioritas: 'TINGGI' | 'SEDANG' | 'RENDAH';
  alasan: string; url_merk1: string; url_merk2: string; url_merk3: string;
  file_url: string; sub_bidang: string; jenis_belanja: string;
}

export interface UserRow {
  id: number; username: string; nama_lengkap: string; email: string;
  role: string; status: string; email_verified: boolean; created_at: string;
}

export interface TelaahDecision {
  status: 'DITELAAH' | 'DITOLAK_ADMIN' | 'DIREVISI_ADMIN';
  admin_qty?: number; admin_harga?: number; catatan: string;
}

export interface PutusanDecision {
  status: 'DIPROSES' | 'DISETUJUI' | 'DITOLAK' | 'DIREVISI_KASUBAG';
  nominal: number; catatan: string; kasubag_qty?: number; kasubag_harga?: number;
}

export interface NotifRow {
  id: number; type: string; pesan: string; no_usulan: string | null;
  sub_bidang: string | null; dibaca: boolean; created_at: string;
}

// ── Status badge mapping ─────────────────────────────────────────

export const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:            { label: 'Draft',           bg: 'rgba(133,183,235,0.10)', color: '#85B7EB' },
  DIAJUKAN_REVIEW:  { label: 'Review Bidang',   bg: 'rgba(124,92,252,0.13)',  color: '#A78BFA' },
  REVISI_BIDANG:    { label: 'Revisi Bidang',   bg: 'rgba(186,117,23,0.15)',  color: '#FAC775' },
  DITOLAK_BIDANG:   { label: 'Tolak Bidang',    bg: 'rgba(226,75,74,0.10)',   color: '#FCA5A5' },
  DIAJUKAN:         { label: 'Menunggu Admin',  bg: 'rgba(55,138,221,0.13)',  color: '#7DD3FC' },
  DITELAAH:         { label: 'Ditelaah Admin',  bg: 'rgba(124,92,252,0.13)',  color: '#A78BFA' },
  DITOLAK_ADMIN:    { label: 'Ditolak Admin',   bg: 'rgba(226,75,74,0.16)',   color: '#F09595' },
  DIREVISI_ADMIN:   { label: 'Direvisi Admin',  bg: 'rgba(186,117,23,0.15)',  color: '#FAC775' },
  DIPROSES:         { label: 'Diputus Kasubag', bg: 'rgba(29,158,117,0.13)',  color: '#6EE7B7' },
  DIREVISI_KASUBAG: { label: 'Revisi Kasubag',  bg: 'rgba(186,117,23,0.15)',  color: '#FAC775' },
  DISETUJUI:        { label: 'Disetujui',       bg: 'rgba(29,158,117,0.13)',  color: '#6EE7B7' },
  DITOLAK:          { label: 'Ditolak',         bg: 'rgba(226,75,74,0.24)',   color: '#E24B4A' },
};

// ── Status grouping (untuk dropdown filter) ───────────────────────

export const STATUS_GROUPS = [
  { label: '── Tahap Bidang ──',  statuses: ['DRAFT', 'DIAJUKAN_REVIEW', 'REVISI_BIDANG', 'DITOLAK_BIDANG'] },
  { label: '── Tahap Admin ──',   statuses: ['DIAJUKAN', 'DITELAAH', 'DITOLAK_ADMIN', 'DIREVISI_ADMIN'] },
  { label: '── Tahap Kasubag ──', statuses: ['DIPROSES', 'DIREVISI_KASUBAG'] },
  { label: '── Final ──',         statuses: ['DISETUJUI', 'DITOLAK'] },
];

// PERF-W7: stable refs untuk array props yang biasa dipakai (memo-friendly).
export const HIDE_BIDANG_STATUSES = ['DRAFT', 'DIAJUKAN_REVIEW', 'REVISI_BIDANG', 'DITOLAK_BIDANG'] as const;
// DA-1: opsi filter status sesuai isi panel — Semua Usulan (ADMIN) = antrian telaah,
// Data Admin = pasca-telaah (status DIAJUKAN mustahil muncul di sana).
export const ADMIN_ANTRIAN_STATUSES = ['DIAJUKAN', 'DITELAAH', 'DITOLAK_ADMIN', 'DIREVISI_ADMIN'] as const;
export const HIDE_DATA_ADMIN_STATUSES = [...HIDE_BIDANG_STATUSES, 'DIAJUKAN'] as const;

// ── Format helpers ────────────────────────────────────────────────
// PERF-W1: re-export dari lib/shared/utils untuk preserve import path
// DetailModal (./_types). Canonical implementation di utils.ts.

export { fmtRp, fmtTgl, fmtNum, parseNum } from '@/lib/shared/utils';
