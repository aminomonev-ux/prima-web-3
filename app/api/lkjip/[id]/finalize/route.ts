import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DokumenFinalizeSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import {
  finalizeDokumen,
  LkjipVersionConflictError, LkjipNotFoundError, LkjipFinalError,
} from '@/lib/lkjip/data';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'finalize', 20); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const parsed = DokumenFinalizeSchema.safeParse({ ...(raw ?? {}), id });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    await finalizeDokumen(id, parsed.data.expected_version, g.session.userId);
  } catch (err) {
    if (err instanceof LkjipVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', msg: err.message }, { status: 409 });
    if (err instanceof LkjipFinalError)           return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
    if (err instanceof LkjipNotFoundError)        return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'LKJIP_FINALIZE', userId: g.session.userId, username: g.session.username, detail: `LKJIP finalize id=${id}` });
  return NextResponse.json({ ok: true });
}
