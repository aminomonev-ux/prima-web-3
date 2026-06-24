import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { isLkjipRole } from '@/lib/lkjip/schemas';

export type GuardedSession = { userId: number; username: string; role: string };

// Akses: SUPER_ADMIN/ADMIN, atau role lain (mis. BIDANG_RENBANG) dgn app_access 'lkjip'
// (diatur Admin Panel → User Management). Pola BBA/Rencana Aksi _guard.
export async function guard(): Promise<
  | { ok: true; session: GuardedSession }
  | { ok: false; res: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, res: NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 }) };
  }
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`,
  );
  if (!isLkjipRole(session.role, row?.app_access ?? null)) {
    return { ok: false, res: NextResponse.json({ ok: false, msg: 'Akses ditolak' }, { status: 403 }) };
  }
  return { ok: true, session: { userId: session.userId, username: session.username, role: session.role } };
}
