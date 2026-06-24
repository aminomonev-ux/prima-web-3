
import { NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { SESSION_INACTIVE_MINUTES } from '@/lib/constants';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  const threshold = SESSION_INACTIVE_MINUTES * 60 * 0.5;
  const [userStats, sessionStats] = await Promise.all([
    sql`
      SELECT
        COUNT(*)                                                          AS total,
        SUM(CASE WHEN status = 'AKTIF'     THEN 1 ELSE 0 END)            AS aktif,
        SUM(CASE WHEN status = 'NONAKTIF'  THEN 1 ELSE 0 END)            AS nonaktif,
        SUM(CASE WHEN status = 'MENUNGGU'  THEN 1 ELSE 0 END)            AS menunggu,
        SUM(CASE WHEN locked_until > NOW() THEN 1 ELSE 0 END)            AS locked
      FROM users
    `,
    sql`
      SELECT
        COUNT(*)                                                                                                                AS total,
        SUM(CASE WHEN invalidated_at IS NULL AND TIMESTAMPDIFF(SECOND, last_active, NOW()) < ${threshold} THEN 1 ELSE 0 END)   AS aktif,
        SUM(CASE WHEN invalidated_at IS NULL AND TIMESTAMPDIFF(SECOND, last_active, NOW()) >= ${threshold} THEN 1 ELSE 0 END)  AS idle,
        SUM(CASE WHEN invalidated_at IS NOT NULL THEN 1 ELSE 0 END)                                                            AS expired,
        COUNT(DISTINCT CASE WHEN invalidated_at IS NULL THEN username END)                                                     AS unik
      FROM user_sessions
    `,
  ]);
  return NextResponse.json({
    ok: true,
    users:    userStats[0],
    sessions: sessionStats[0],
  });
}
