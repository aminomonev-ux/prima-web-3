
import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlInt, safeInt, escapeLike } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }

  const sp         = req.nextUrl.searchParams;
  const page       = Math.max(1, safeInt(sp.get('page'),  1));
  const limit      = Math.min(100, Math.max(1, safeInt(sp.get('limit'), 50)));
  const offset     = (page - 1) * limit;
  const eventType  = sp.get('event') ?? '';
  const username   = sp.get('username') ?? '';
  const dateFrom   = sp.get('from') ?? '';
  const dateTo     = sp.get('to') ?? '';

  const whereEvent    = eventType ? sql`AND event_type = ${eventType}`            : sql``;
  // O5: escapeLike supaya % atau _ di input tidak diperlakukan sebagai wildcard MySQL.
  const whereUsername = username  ? sql`AND username LIKE ${'%' + escapeLike(username) + '%'}` : sql``;
  const whereFrom     = dateFrom  ? sql`AND created_at >= ${dateFrom}`            : sql``;
  const whereTo       = dateTo    ? sql`AND created_at <  DATE_ADD(DATE(${dateTo}), INTERVAL 1 DAY)` : sql``;

  const [{ count }] = await sql`
    SELECT COUNT(*) as count FROM audit_log
    WHERE 1=1 ${whereEvent} ${whereUsername} ${whereFrom} ${whereTo}
  ` as { count: number }[];

  const rows = await sql`
    SELECT id, user_id, username, event_type, ip_address, user_agent, detail, created_at
    FROM audit_log
    WHERE 1=1 ${whereEvent} ${whereUsername} ${whereFrom} ${whereTo}
    ORDER BY created_at DESC
    LIMIT ${sqlInt(limit)} OFFSET ${sqlInt(offset)}
  `;

  return NextResponse.json({
    ok: true,
    data: rows,
    pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
  });
}
