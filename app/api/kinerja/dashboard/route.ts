import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getKinerjaKpi } from '@/lib/data/kinerja';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  // SDL-M14: dashboard di-poll dari client, beri budget 60/menit.
  const limited = await kinerjaRateLimit(session.userId, 'dashboard', 60); if (limited) return limited;

  // C-WORK-1 (Tahap 12): validate tahun range via Zod
  const { searchParams } = new URL(req.url);
  const q = KinerjaQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();

  const kpi = await getKinerjaKpi(tahun);
  return NextResponse.json({ ok: true, kpi });
}
