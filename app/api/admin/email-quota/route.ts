
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getEmailQuota } from '@/lib/services/email';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const quota = await getEmailQuota();
  return NextResponse.json({ ok: true, ...quota });
}
