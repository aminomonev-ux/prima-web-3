import { NextRequest, NextResponse } from 'next/server';
import { requireAccess } from '@/lib/security/guard';
import { isDashboardRole, dashboardRateLimit, DashboardQuerySchema } from '@/lib/data/dashboard-schemas';
import { getModuleDetail, isDashModule } from '@/lib/data/dashboard';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/[modul]?tahun=YYYY — detail drill-down satu modul (READ-ONLY).
// Akses sama dgn overview: isDashboardRole. Modul divalidasi allowlist (deny-by-default).
export async function GET(req: NextRequest, ctx: { params: Promise<{ modul: string }> }) {
  const g = await requireAccess(isDashboardRole);
  if (!g.ok) return g.res;

  const limited = await dashboardRateLimit(g.session.userId, 'detail', 60);
  if (limited) return limited;

  const { modul } = await ctx.params;
  if (!isDashModule(modul)) return NextResponse.json({ ok: false, message: 'Modul tidak dikenal' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const parsed = DashboardQuerySchema.safeParse({ tahun: searchParams.get('tahun') ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const tahun = parsed.data.tahun ?? String(new Date().getFullYear());

  try {
    const payload = await getModuleDetail(modul, tahun);
    return NextResponse.json({ ok: true, tahun, data: payload });
  } catch (err) {
    console.error('[Dashboard Detail GET Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
