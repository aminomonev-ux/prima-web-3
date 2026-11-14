// GET /api/kinerja/pagu-renaksi?tahun= — pagu sub kegiatan Rencana Aksi + agregat RKO versi terbaru
// semua tab, untuk pita di layar RKO (docs/CONCEPT-renaksi-pagu-rko.md Tahap B). Hanya membaca.
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { hasAppAccess } from '@/lib/security/guard';
import { isKinerjaRole, kinerjaRateLimit, KinerjaQuerySchema } from '@/lib/data/kinerja-schemas';
import { muatBahanPaguRenaksi } from '@/lib/data/pagu-renaksi-rko';
import { sql } from '@/lib/data/db';
import { kinerjaMati } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'pagu-renaksi', 60);
  if (limited) return limited;

  const q = KinerjaQuerySchema.safeParse({ tahun: new URL(req.url).searchParams.get('tahun') ?? undefined });
  if (!q.success || !q.data.tahun) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await muatBahanPaguRenaksi(sql, Number(q.data.tahun))) });
}
