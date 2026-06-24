// ─── PRIMA — Central Route Guard helpers ──────────────────────────────────────
// STANDAR WAJIB untuk SEMUA route API (L60/L61): proxy.ts TIDAK menjaga /api/* per
// role — enforcement ada di tiap route. Route baru yang lupa guard = lubang akses
// instan. Pakai helper ini, JANGAN cuma cek getSession() (itu hanya "sudah login").
//
//   requireSession()              → wajib login (self/identity endpoint)
//   requireRole([roles])          → login + role ∈ allowed (akses berbasis role murni)
//   requireAccess(check)          → login + check(role, app_access) (modul "milik bersama"
//                                    yang bisa di-grant manual via app_access; pola lkjip/bba/ra)
//
// Semua mengembalikan discriminated union — pakai: `const g = await requireRole(...);
// if (!g.ok) return g.res; const { session } = g;`
import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import type { SessionPayload } from '@/types';

export type GuardOk   = { ok: true; session: SessionPayload };
export type GuardFail = { ok: false; res: NextResponse };
export type GuardResult = GuardOk | GuardFail;

const unauthorized = (): GuardFail => ({ ok: false, res: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) });
const forbidden    = (): GuardFail => ({ ok: false, res: NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 }) });

export async function requireSession(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  return { ok: true, session };
}

export async function requireRole(allowed: readonly string[]): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!allowed.includes(session.role)) return forbidden();
  return { ok: true, session };
}

// Evaluasi role + app_access untuk modul "milik bersama" (isBludRole, isKinerjaRole,
// isPkRole, isLkjipRole, isAsetRole, ...). Short-circuit: role allow-list lolos tanpa
// query DB; selain itu baca users.app_access sekali. Dipakai requireAccess (route yang
// sudah pegang session) dan page guard server component (userId/role dari header proxy).
export async function hasAppAccess(
  userId: number,
  role: string,
  check: (role: string, appAccess: string[] | null) => boolean,
): Promise<boolean> {
  if (check(role, null)) return true;
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${userId} LIMIT 1`,
  );
  return check(role, row?.app_access ?? null);
}

// Untuk modul "milik bersama" yang aksesnya bisa diberikan manual lewat users.app_access.
export async function requireAccess(
  check: (role: string, appAccess: string[] | null) => boolean,
): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return unauthorized();
  if (!(await hasAppAccess(session.userId, session.role, check))) return forbidden();
  return { ok: true, session };
}
