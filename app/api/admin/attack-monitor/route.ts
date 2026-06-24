
import { NextResponse } from 'next/server';
import { sql } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  const [rows, totals, logs] = await Promise.all([
    sql`
      SELECT
        ANY_VALUE(DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%H:00')) AS label,
        SUM(CASE WHEN event_type = 'LOGIN_SUCCESS' THEN 1 ELSE 0 END)                                        AS login,
        SUM(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 ELSE 0 END)                                         AS failed,
        SUM(CASE WHEN event_type IN ('LOGIN_BLOCKED','ACCOUNT_LOCKED') THEN 1 ELSE 0 END)                    AS blocked
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL 12 HOUR
      GROUP BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%Y-%m-%d %H:00:00')
      ORDER BY DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%Y-%m-%d %H:00:00')
    `,
    sql`
      SELECT
        SUM(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 ELSE 0 END)                                                                        AS total_failed,
        SUM(CASE WHEN event_type = 'ACCOUNT_LOCKED' THEN 1 ELSE 0 END)                                                                      AS total_locked,
        SUM(CASE WHEN event_type = 'LOGIN_BLOCKED' THEN 1 ELSE 0 END)                                                                       AS total_blocked,
        SUM(CASE WHEN event_type = 'LOGIN_SUCCESS' THEN 1 ELSE 0 END)                                                                       AS total_login,
        SUM(CASE WHEN event_type NOT IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGIN_BLOCKED','ACCOUNT_LOCKED','LOGOUT') THEN 1 ELSE 0 END)        AS total_warn,
        COUNT(DISTINCT CASE WHEN event_type IN ('LOGIN_FAILED','LOGIN_BLOCKED') THEN ip_address END)                                         AS unique_ips,
        COUNT(*)                                                                                                                              AS total_all
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL 24 HOUR
    `,
    sql`
      SELECT id, username, event_type, ip_address, detail,
        DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+07:00'), '%d/%m/%Y, %H.%i.%S') AS created_at
      FROM audit_log
      WHERE created_at >= NOW() - INTERVAL 24 HOUR
      ORDER BY created_at DESC
      LIMIT 200
    `,
  ]);
  return NextResponse.json({ ok: true, chart: rows, totals: totals[0], logs });
}
