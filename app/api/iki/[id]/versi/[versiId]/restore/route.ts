// app/api/iki/[id]/versi/[versiId]/restore/route.ts — POST pulihkan snapshot (DRAFT only)
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { ikiRateLimit } from '@/lib/data/iki-schemas';
import { restoreVersi, IkiFinalError, IkiNotFoundError, IkiVersionConflictError } from '@/lib/data/iki';
import { guard } from '../../../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; versiId: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'restore-versi', 10);
  if (limited) return limited;

  const p = await params;
  const id = safeInt(p.id, 0);
  const versiId = safeInt(p.versiId, 0);
  if (id <= 0 || versiId <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });

  try {
    const newVersion = await restoreVersi(id, versiId, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_RESTORE_VERSI', userId: g.session.userId, username: g.session.username,
      detail: `Pulihkan dokumen IKI id=${id} dari versi id=${versiId}`,
    });
    return NextResponse.json({ ok: true, version: newVersion });
  } catch (err) {
    if (err instanceof IkiFinalError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    if (err instanceof IkiVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    }
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    const message = err instanceof Error ? err.message : '';
    const known = message.includes('Versi tidak ditemukan');
    if (!known) console.error('[IKI Restore Versi Error]', err);
    return NextResponse.json(
      { ok: false, message: known ? message : 'Terjadi kesalahan server.' },
      { status: known ? 404 : 500 },
    );
  }
}
