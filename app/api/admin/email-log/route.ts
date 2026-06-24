// GET /api/admin/email-log?limit=50
// Return baris terakhir email_log untuk Admin Panel tab Email Notif.
// Hanya SUPER_ADMIN yang boleh akses (handler enforce SUPER_ADMIN-only).

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getRecentEmailLog } from '@/lib/services/email';
import { safeInt } from '@/lib/data/db';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const limit = safeInt(req.nextUrl.searchParams.get('limit'), 50);
  const rows = await getRecentEmailLog(Math.min(200, limit));
  return NextResponse.json({ ok: true, rows });
}
