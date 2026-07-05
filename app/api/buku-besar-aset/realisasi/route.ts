import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BbaRealisasiSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { setRealisasi, BbaVersionConflictError, BbaTransitionError, BbaNotFoundError, BbaUsulanLockedError, BbaRealisasiRangeError, BbaStatusMismatchError } from '@/lib/data/buku-besar-aset';
import { guard } from '../_guard';

// PATCH /api/buku-besar-aset/realisasi — set nilai realisasi + status (REALISASI_*).
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await bbaRateLimit(g.session.userId, 'realisasi', 60); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = BbaRealisasiSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  let koreksiMundur = false;
  try {
    ({ koreksiMundur } = await setRealisasi(parsed.data, g.session.userId, g.session.role === 'SUPER_ADMIN'));
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof BbaTransitionError)      return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaUsulanLockedError)    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaRealisasiRangeError)  return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaStatusMismatchError)  return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaNotFoundError)        return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'BBA_REALISASI', userId: g.session.userId, username: g.session.username, detail: `BBA realisasi id=${parsed.data.id} nilai=${parsed.data.nilai_realisasi} vol=${parsed.data.vol_realisasi} status=${parsed.data.status}${koreksiMundur ? ' (koreksi mundur REALISASI_PENUH oleh SUPER_ADMIN)' : ''}` });
  return NextResponse.json({ ok: true });
}
