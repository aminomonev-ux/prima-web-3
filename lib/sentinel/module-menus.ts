// lib/sentinel/module-menus.ts — menu DI DALAM tiap modul untuk jawaban Rima
// "menu apa saja di <modul>". Disetel per-role MENGIKUTI gating sidebar asli tiap
// modul (sumber kebenaran ditulis per-case) supaya Rima TIDAK menyebut menu di luar
// akses user. id modul WAJIB sinkron dengan NAV_MODULES (nav.ts).
//
// ⚠️ DRIFT: ini cermin manual dari sidebar masing-masing modul. Kalau menu/gating
// sidebar berubah, update di sini juga (khususnya Usulan yang role-gated).
import type { Role } from '@/types'
import { BIDANG_ROLES, SUBBIDANG_ROLES } from '@/lib/constants'

const isBidang = (r: Role | null) => !!r && (BIDANG_ROLES as readonly string[]).includes(r)
const isSub    = (r: Role | null) => !!r && (SUBBIDANG_ROLES as readonly string[]).includes(r)

// Usulan Kebutuhan — MIRROR app/(dashboard)/usulan-kebutuhan/_utils.tsx getPanels()
// + label dari sidebarItems (usulan-client.tsx). Panel id → label tampilan.
const USULAN_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', buat: 'Buat Usulan', milik: 'Usulan Saya', tracking: 'Lacak Usulan',
  semua: 'Semua Usulan', 'data-admin': 'Data Admin', rekap: 'Rekap & Laporan',
  antrian: 'Antrian Verif', 'data-usulan': 'Data Usulan', 'rekap-verif': 'Rekap Verifikasi',
  'bidang-antrian': 'Review Bidang', 'bidang-data': 'Data Review',
  'kelola-user': 'Kelola User', 'batas-waktu': 'Batas Waktu', 'set-pagu': 'Set Pagu BLUD',
  'hapus-usulan': 'Hapus Usulan',
}
function usulanPanels(role: Role | null): string[] {
  if (role === 'SUPER_ADMIN') return ['dashboard', 'buat', 'milik', 'tracking', 'semua', 'data-admin', 'rekap', 'antrian', 'data-usulan', 'rekap-verif', 'bidang-antrian', 'bidang-data', 'kelola-user', 'batas-waktu', 'set-pagu', 'hapus-usulan']
  if (role === 'ADMIN')       return ['dashboard', 'semua', 'data-admin', 'rekap', 'kelola-user', 'batas-waktu', 'set-pagu', 'hapus-usulan']
  if (role === 'ADMIN_KASUBAG' || role === 'ADMIN_KABAG') return ['dashboard', 'antrian', 'data-usulan', 'rekap-verif']
  if (isBidang(role)) return ['dashboard', 'bidang-antrian', 'bidang-data']
  if (isSub(role))    return ['dashboard', 'buat', 'milik', 'tracking']
  return ['dashboard']
}

/** Daftar label menu yang TERLIHAT untuk role di sebuah modul (id sinkron NAV_MODULES).
 *  [] = modul tanpa sub-menu khusus (cukup buka modulnya). */
export function moduleMenusFor(moduleId: string, role: Role | null): string[] {
  switch (moduleId) {
    case 'usulan_aset': // role-gated (getPanels)
      return usulanPanels(role).map(p => USULAN_LABEL[p] ?? p)
    case 'blud': // blud-shell.tsx TILES (tanpa gating role)
      return ['Beranda', 'Master Akun', 'Kode Besar', 'Penanggung Jawab', 'DPA BLUD', 'Pergeseran DPA', 'Cetak', 'Pengaturan']
    case 'new_econtrolling': // kinerja Sidebar.tsx — "Pengaturan" khusus SUPER_ADMIN
      return ['Beranda', 'Laporan Konsolidasi', 'Master Rekening', 'Rekening', 'RKO', 'Realisasi', 'Cetak Realisasi', 'Pendapatan & CRR', ...(role === 'SUPER_ADMIN' ? ['Pengaturan'] : [])]
    case 'perjanjian_kinerja': // pk-shell.tsx TILES
      return ['Beranda', 'Master Sasaran', 'Master Program', 'Form PK', 'Riwayat', 'Master Pejabat', 'Master Unit']
    case 'rencana_aksi': // rencana-aksi Sidebar.tsx (Indikator + Data Entry)
      return ['Indikator Kinerja (Tujuan, Sasaran, Program, Kegiatan, Sub Kegiatan)', 'Data Entry (Tujuan, Sasaran, Program, Kegiatan, Sub Kegiatan)']
    case 'buku_besar_aset': // buku-besar-aset-client.tsx nav
      return ['Aset', 'Master']
    case 'lkjip': // lkjip-client.tsx — daftar dokumen + editor kerangka
      return ['Daftar Dokumen E-LKJIP (buat & susun laporan)']
    case 'admin': // admin-client.tsx TABS (modul khusus SUPER_ADMIN)
      return ['Active Sessions', 'App Control', 'Attack Monitor', 'User Management', 'Security Status', 'Broadcast', 'Audit Trail', 'Email Notif', 'Promotion Req']
    default:
      return []
  }
}
