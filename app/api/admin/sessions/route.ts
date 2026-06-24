
import { NextRequest, NextResponse } from 'next/server';
import { sql, safeInt, sqlInt } from '@/lib/data/db';
import { getSession, verifyPassword } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';

// PERF-W5: GET tanpa LIMIT bisa load ribuan row kalau user_sessions tumbuh.
// Default 100/page (ceiling). Frontend backward-compat: `data` tetap array.
// N-2: ghost-invalidate + prune dipindah ke cron purge-retention (GET kini
// murni read-only — tidak lagi write-on-read tiap request).
const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 500;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }

  // Parse & clamp pagination params
  const url      = new URL(req.url);
  const reqLimit = safeInt(url.searchParams.get('limit'), DEFAULT_LIMIT);
  const limit    = Math.min(Math.max(reqLimit, 1), MAX_LIMIT);
  const offset   = Math.max(safeInt(url.searchParams.get('offset'), 0), 0);

  // Count total active sessions (untuk pagination metadata)
  const countRows = await sql`
    SELECT COUNT(*) AS total
    FROM user_sessions s
    WHERE s.invalidated_at IS NULL
  ` as Array<{ total: number | string }>;
  const total = Number(countRows[0]?.total ?? 0);

  const rows = await sql`
    SELECT s.id, s.session_id, s.user_id, s.username, s.role,
           s.ip_address, s.user_agent, s.created_at, s.last_active,
           TIMESTAMPDIFF(SECOND, s.last_active, NOW()) AS idle_seconds
    FROM user_sessions s
    WHERE s.invalidated_at IS NULL
    ORDER BY s.last_active DESC
    LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}
  `;
  return NextResponse.json({
    ok: true,
    data: rows,
    pagination: { total, limit, offset, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  const { password } = await req.json() as { password?: string };
  if (!password) {
    return NextResponse.json({ ok: false, message: 'Password wajib diisi.' }, { status: 400 });
  }
  const users = await sql`SELECT password_hash FROM users WHERE id = ${session.userId} LIMIT 1`;
  if (!users.length) return NextResponse.json({ ok: false, message: 'User tidak ditemukan.' }, { status: 404 });
  const valid = await verifyPassword(password, (users[0] as Record<string,string>).password_hash);
  if (!valid) {
    await writeAuditLog({ req, eventType: 'LOGIN_FAILED', userId: session.userId, username: session.username, detail: 'Emergency logout password salah' });
    return NextResponse.json({ ok: false, message: 'Password salah.' }, { status: 403 });
  }
  const result = await sql`
    UPDATE user_sessions SET invalidated_at = NOW()
    WHERE invalidated_at IS NULL AND session_id != ${session.sessionId ?? ''}
  `;
  const deleted = (result[0] as { affectedRows: number })?.affectedRows ?? 0;
  await writeAuditLog({ req, eventType: 'LOGOUT', userId: session.userId, username: session.username, detail: `Emergency logout: ${deleted} sesi dihapus` });
  return NextResponse.json({ ok: true, deleted });
}
