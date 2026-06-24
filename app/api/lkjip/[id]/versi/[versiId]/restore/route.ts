import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { VersiRestoreSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import { restoreVersi } from '@/lib/lkjip/versi';
import { LkjipNotFoundError, LkjipFinalError, LkjipVersionConflictError } from '@/lib/lkjip/data';
import { guard } from '../../../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; versiId: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'versi-restore', 20); if (limited) return limited;
  const p = await params;
  const dokumenId = safeInt(p.id, 0);
  const versiId = safeInt(p.versiId, 0);
  if (dokumenId <= 0 || versiId <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const parsed = VersiRestoreSchema.safeParse({ ...(raw ?? {}), versi_id: versiId });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    await restoreVersi(versiId, dokumenId, parsed.data.expected_version, g.session.userId);
  } catch (err) {
    if (err instanceof LkjipVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', msg: err.message }, { status: 409 });
    if (err instanceof LkjipFinalError)           return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
    if (err instanceof LkjipNotFoundError)        return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'LKJIP_VERSI_RESTORE', userId: g.session.userId, username: g.session.username, detail: `LKJIP pulihkan versi id=${versiId}` });
  return NextResponse.json({ ok: true });
}
