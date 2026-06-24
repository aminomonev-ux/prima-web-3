
import { NextRequest, NextResponse } from 'next/server';
import { sql, queryOne } from '@/lib/data/db';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 403 });
  }
  const { sessionId } = await params;
  if (sessionId === session.sessionId) {
    return NextResponse.json({ ok: false, message: 'Tidak dapat menghapus sesi Anda sendiri.' }, { status: 400 });
  }
  // O1: queryOne — null check + typed return.
  const row = await queryOne<{ username: string }>(
    sql`SELECT username FROM user_sessions WHERE session_id = ${sessionId} AND invalidated_at IS NULL LIMIT 1`
  );
  if (!row) return NextResponse.json({ ok: false, message: 'Sesi tidak ditemukan.' }, { status: 404 });
  await sql`UPDATE user_sessions SET invalidated_at = NOW() WHERE session_id = ${sessionId}`;
  const target = row.username;
  await writeAuditLog({ req, eventType: 'LOGOUT', userId: session.userId, username: session.username, detail: `Force logout sesi milik ${target}` });
  return NextResponse.json({ ok: true });
}
