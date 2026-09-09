// app/(dashboard)/admin/_panels/_shared.ts — bentuk data & pembantu yang dipakai lebih
// dari satu panel Admin Panel.
//
// Isinya dulu tinggal di kepala admin-client.tsx bersama seluruh tab. Waktu tab dipecah
// ke berkas masing-masing, yang benar-benar dipakai bersama dipindah ke sini; yang cuma
// dipakai satu panel ikut pindah ke panel itu, bukan menumpuk di sini.

import { ROLE_LABELS } from '@/lib/constants';
import { LABEL_SAKELAR } from '@/lib/registry/apps';

/** Dipakai APP CONTROL (saklar) & SECURITY STATUS (daftar modul aktif). */
/**
 * Fase B (Tahap 2): DITURUNKAN dari `lib/registry/apps.ts`. Sebelumnya daftar tangan
 * berisi 11 entri, sementara route `app-status` punya daftarnya sendiri berisi 12 —
 * dan yang ke-12 (`app_status_blud_realisasi`) sudah ditegakkan guard BLUD tapi tak
 * punya satu pun tombol untuk menyalakannya kembali (T-5). Selisih seperti itu tidak
 * bisa lahir lagi begitu keduanya membaca daftar yang sama.
 */
export const APP_STATUS_LABELS: Record<string, string> = { ...LABEL_SAKELAR };

/** Dipakai USER MANAGEMENT (ubah peran) & BROADCAST (pilih penerima). */
export const ALL_ROLES = Object.keys(ROLE_LABELS);

export interface SessionRow {
  id: number; session_id: string; user_id: number; username: string; role: string;
  ip_address: string | null; user_agent: string | null;
  created_at: string; last_active: string; idle_seconds: number;
}

export interface UserRow {
  id: number; username: string; nama_lengkap: string | null; email: string;
  role: string; status: string;
  app_access: string[] | null; created_at: string;
  promotion_locked_until?: string | null;
  probationary_until?: string | null;
  probationary_from_role?: string | null;
  /** Jumlah perkecualian akses menu — dipakai peringatan di modal UBAH ROLE. */
  menu_exceptions?: number;
}

export interface AppStatus { [key: string]: string }
export interface ChartSlot { label: string; login: number; failed: number; blocked: number; }
export interface AuditRow {
  id: number; username: string | null; event_type: string;
  ip_address: string | null; detail: string | null; created_at: string;
}
export interface BroadcastRow { id: number; recipient: string; pesan: string; created_at: string; }
export interface LogRow {
  id: number; username: string | null; event_type: string;
  ip_address: string | null; detail: string | null; created_at: string;
}

export function fmtTs(ts: string) {
  return new Date(ts).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtIdle(sec: number) {
  if (sec < 60) return `${Math.floor(sec)}d`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}j`;
}
