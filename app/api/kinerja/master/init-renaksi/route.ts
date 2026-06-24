import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { initMasterFromRenaksi } from '@/lib/data/kinerja';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, InitRenaksiBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = InitRenaksiBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, dry } = parsed.data;

  if (!dry) {
    const limited = await kinerjaRateLimit(session.userId, 'init-renaksi', 5);
    if (limited) return limited;
  }

  const result = await initMasterFromRenaksi(tahun, session.userId, dry);

  if (!dry) {
    await writeAuditLog({
      req,
      eventType: 'KINERJA_MASTER_INIT_RENAKSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `Init Renaksi tahun ${tahun}: +${result.programInserted}P/+${result.kegiatanInserted}K/+${result.subkegiatanInserted}S (skip ${result.programSkipped}/${result.kegiatanSkipped}/${result.subkegiatanSkipped}, total RA=${result.raTotal})`,
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
