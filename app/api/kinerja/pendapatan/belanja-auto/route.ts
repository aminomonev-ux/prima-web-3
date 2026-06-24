import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { sql } from '@/lib/data/db';
import { isKinerjaRole, KinerjaQuerySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

/**
 * GET /api/kinerja/pendapatan/belanja-auto?tahun=2025&bulan=1
 * Ambil total real_keuangan dari kinerja_realisasi per bulan untuk auto-fill CRR.
 * - blud   : SUM(real_keuangan) WHERE sumber='BLUD'
 * - daerah : SUM(real_keuangan) semua sumber (total belanja RS)
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // C-SEC-1 (Tahap 12): read endpoint juga butuh role guard — sama dengan PUT.
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  // C-WORK-1/4 (Tahap 12): validate tahun range + bulan 1-12 via Zod
  const { searchParams } = new URL(req.url);
  const bulanRaw = searchParams.get('bulan');
  if (!bulanRaw) return NextResponse.json({ ok: false, message: 'Parameter bulan wajib diisi' }, { status: 400 });
  const q = KinerjaQuerySchema.safeParse({
    tahun: searchParams.get('tahun') ?? undefined,
    bulan: bulanRaw,
  });
  if (!q.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  const tahun = q.data.tahun ?? new Date().getFullYear().toString();
  const bulan = q.data.bulan!;

  const [bludRow] = await sql`
    SELECT COALESCE(SUM(real_keuangan), 0) AS total
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND bulan = ${bulan} AND sumber = 'BLUD'
  ` as Record<string, unknown>[];

  const [daerahRow] = await sql`
    SELECT COALESCE(SUM(real_keuangan), 0) AS total
    FROM kinerja_realisasi
    WHERE tahun = ${tahun} AND bulan = ${bulan}
  ` as Record<string, unknown>[];

  return NextResponse.json({
    ok:     true,
    blud:   Number(bludRow?.total ?? 0),
    daerah: Number(daerahRow?.total ?? 0),
  });
}
