import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { isIkiRole } from '@/lib/data/iki-schemas';

export type GuardedSession = { userId: number; username: string; role: string };

// Akses: SUPER_ADMIN/ADMIN, atau role lain yang punya app_access 'iki'
// (diatur Admin Panel → User Management). Pola Rencana Aksi/BBA _guard.
export async function guard(): Promise<
  | { ok: true; session: GuardedSession }
  | { ok: false; res: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, res: NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 }) };
  }
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`,
  );
  if (!isIkiRole(session.role, row?.app_access ?? null)) {
    return { ok: false, res: NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 }) };
  }
  return { ok: true, session: { userId: session.userId, username: session.username, role: session.role } };
}
