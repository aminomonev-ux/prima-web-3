// app/api/iki/[id]/duplicate/route.ts — POST duplikasi dokumen ke tahun lain
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DuplicateSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import { duplicateDokumen, IkiNotFoundError } from '@/lib/data/iki';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'duplicate', 10);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });

  const raw = await req.json().catch(() => null);
  const parsed = DuplicateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const newId = await duplicateDokumen(id, parsed.data.tahun_target, g.session.userId);
    await writeAuditLog({
      req, eventType: 'IKI_CREATE', userId: g.session.userId, username: g.session.username,
      detail: `Duplikat dokumen IKI id=${id} → id=${newId} tahun ${parsed.data.tahun_target}`,
    });
    return NextResponse.json({ ok: true, id: newId });
  } catch (err) {
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    const message = err instanceof Error ? err.message : '';
    const known = message.includes('sudah ada') || message.includes('sama dengan tahun sumber');
    if (!known) console.error('[IKI Duplicate Error]', err);
    return NextResponse.json(
      { ok: false, message: known ? message : 'Terjadi kesalahan server.' },
      { status: known ? 409 : 500 },
    );
  }
}
