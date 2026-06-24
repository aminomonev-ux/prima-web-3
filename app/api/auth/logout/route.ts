
import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sql } from '@/lib/data/db';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.sessionId) {
    try {
      await sql`UPDATE user_sessions SET invalidated_at = NOW() WHERE session_id = ${session.sessionId}`;
    } catch (e) {
      console.error('[Logout] Gagal invalidate sesi:', e);
    }
  }
  await writeAuditLog({ req, eventType: 'LOGOUT', userId: session?.userId, username: session?.username });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
