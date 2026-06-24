import { NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { isRencanaAksiRole } from '@/lib/data/rencana-aksi-schemas';

export type GuardedSession = {
  userId: number;
  username: string;
  role: string;
};

export async function guard(): Promise<
  | { ok: true; session: GuardedSession }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  }
  const row = await queryOne<{ app_access: string[] | null }>(
    sql`SELECT app_access FROM users WHERE id = ${session.userId} LIMIT 1`,
  );
  if (!isRencanaAksiRole(session.role, row?.app_access ?? null)) {
    return { ok: false, response: NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 }) };
  }
  return {
    ok: true,
    session: { userId: session.userId, username: session.username, role: session.role },
  };
}
