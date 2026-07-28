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

/**
 * S4 — kill-switch modul. Membaca `app_config` dan menolak kalau flagnya bukan
 * 'online'. Meniru `app/api/rima/query/route.ts` yang sudah bersikap begini.
 *
 * **503, bukan 403.** "Modul sedang dimatikan admin" dan "Anda tidak berhak" dua
 * hal berbeda, dan yang menerimanya harus bisa membedakan — yang pertama akan
 * hilang sendiri, yang kedua perlu minta akses. Karena itu pula ini TIDAK
 * diselipkan ke dalam `hasAppAccess`: hasilnya akan jadi 403 dengan pesan keliru.
 *
 * **Fail-closed.** Gagal membaca `app_config` = tolak, bukan lanjut diam-diam.
 * Sakelar keamanan yang menyala hanya kalau semuanya lancar bukan sakelar.
 * Risikonya kecil: kalau MySQL bermasalah, modulnya toh sudah tidak bisa apa-apa.
 *
 * Mengembalikan `NextResponse | null` supaya jadi early-return satu baris, pola
 * yang sama dengan `bludRateLimit`:
 *   const mati = await modulMati('app_status_blud')
 *   if (mati) return mati
 */
export async function modulMati(...keys: string[]): Promise<NextResponse | null> {
  let nyala: Set<string>;
  try {
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${keys})`;
    nyala = new Set(
      (rows as { key: string; value: string }[])
        .filter((r) => r.value !== 'online')
        .map((r) => r.key),
    );
  } catch {
    return NextResponse.json(
      { ok: false, code: 'MODUL_MATI', error: 'Modul sedang tidak tersedia. Coba lagi beberapa saat lagi.' },
      { status: 503 },
    );
  }
  // Kunci yang belum ada barisnya dianggap 'online' — sama seperti GET app-status
  // yang mengisi default. Modul baru tidak boleh mati hanya karena seed tertinggal.
  if (nyala.size === 0) return null;
  return NextResponse.json(
    { ok: false, code: 'MODUL_MATI', error: 'Modul ini sedang dimatikan admin untuk pemeliharaan.' },
    { status: 503 },
  );
}

/**
 * Versi untuk server component / layout: cukup tahu mati atau tidak, tanpa
 * membentuk respons. Gagal baca = dianggap mati, sejalan dengan `modulMati`.
 */
export async function modulSedangMati(...keys: string[]): Promise<boolean> {
  try {
    const rows = await sql`SELECT \`key\`, value FROM app_config WHERE \`key\` IN (${keys})`;
    return (rows as { value: string }[]).some((r) => r.value !== 'online');
  } catch {
    return true;
  }
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
