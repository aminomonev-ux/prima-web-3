
import { NextResponse } from 'next/server';
import { getSession, createToken, setSessionCookie } from '@/lib/security/auth';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { sql } from '@/lib/data/db';

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Session expired' }, { status: 401 });
  }
  // SDL-M17: rate-limit heartbeat. Client normal ~1/menit, beri budget 30/menit
  // untuk multi-tab/burst. Tanpa ini, attacker dengan stolen JWT bisa hammer
  // endpoint → contention UPDATE user_sessions.last_active.
  const rl = await checkRateLimit(`keepalive:${session.userId}`, 30, 60);
  if (!rl.allowed) {
    return new NextResponse(null, { status: 429, headers: { 'Retry-After': String(rl.resetIn) } });
  }
  if (session.sessionId) {
    let rows: unknown[] = [];
    try {
      rows = await sql`
        SELECT id FROM user_sessions
        WHERE session_id = ${session.sessionId} AND invalidated_at IS NULL
        LIMIT 1
      `;
    } catch { rows = []; }
    if (!rows.length) {
      return NextResponse.json({ ok: false, message: 'Session revoked' }, { status: 401 });
    }
    try {
      await sql`UPDATE user_sessions SET last_active = NOW() WHERE session_id = ${session.sessionId}`;
    } catch { /* silent */ }
  }
  // SEC-W3: `session` sudah mengandung `originalIat` (atau fallback ke `iat`
  // untuk token legacy via getSession). createToken meneruskannya tanpa
  // reset → clock absolute lifetime tetap valid.
  const newToken = await createToken(session, session.sessionId);
  await setSessionCookie(newToken);
  return NextResponse.json({ ok: true });
}
