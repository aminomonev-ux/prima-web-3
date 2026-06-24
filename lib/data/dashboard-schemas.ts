// ═══ PRIMA — Dashboard (ringkasan lintas-modul) Schemas ═════════════════════
// Role allow-list + Zod + rate-limit untuk endpoint app/api/dashboard.
// Pola mirror kinerja-schemas / rencana-aksi-schemas (modul "milik bersama":
// default beberapa role, sisanya di-grant via users.app_access include 'dashboard').

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

/**
 * Audiens default Dashboard = role verif/admin yang memang melihat data lintas
 * modul secara penuh. Role lain (mis. bidang) bisa di-grant manual via Admin
 * Panel → User Management (users.app_access include 'dashboard').
 */
export const DASHBOARD_ALLOWED_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG',
] as const;

export const DASHBOARD_APP_KEY = 'dashboard'; // = APP_CARDS.id kartu Dashboard

/**
 * Cek role + app_access (pola isAsetRole/isKinerjaRole). Pakai via
 * `requireAccess(isDashboardRole)` atau `hasAppAccess(userId, role, isDashboardRole)`.
 */
export function isDashboardRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((DASHBOARD_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(DASHBOARD_APP_KEY);
}

export async function dashboardRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 60,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`dashboard-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

/** Tahun anggaran 4-digit; default tahun berjalan kalau absen. */
export const DashboardQuerySchema = z.object({
  tahun: z
    .string()
    .regex(/^\d{4}$/, 'Tahun harus 4 digit')
    .refine((v) => { const n = Number(v); return n >= 2020 && n <= 2100; }, 'Tahun harus 2020-2100')
    .optional(),
});
