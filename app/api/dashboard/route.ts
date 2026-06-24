import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/security/guard';
import { isDashboardRole, dashboardRateLimit, DashboardQuerySchema } from '@/lib/data/dashboard-schemas';
import { getDashboardSummary } from '@/lib/data/dashboard';

export const dynamic = 'force-dynamic';

// GET /api/dashboard?tahun=YYYY — agregasi ringkasan lintas-modul (READ-ONLY).
// Guard L60/L61: requireAccess(isDashboardRole), bukan cuma getSession.
export async function GET(req: NextRequest) {
  const g = await requireAccess(isDashboardRole);
  if (!g.ok) return g.res;

  // SDL-M14: dashboard di-poll dari client → budget 60/menit.
  const limited = await dashboardRateLimit(g.session.userId, 'summary', 60);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const parsed = DashboardQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const tahun = parsed.data.tahun ?? String(new Date().getFullYear());

  try {
    const data = await getDashboardSummary(tahun);
    return NextResponse.json({ ok: true, tahun, data });
  } catch (err) {
    console.error('[Dashboard GET Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
