// app/api/iki/[id]/finalize/route.ts — POST DRAFT→FINAL · DELETE (SUPER_ADMIN) FINAL→DRAFT
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { FinalizeSchema, ikiRateLimit } from '@/lib/data/iki-schemas';
import {
  finalizeDokumen, unfinalizeDokumen,
  IkiVersionConflictError, IkiNotFoundError,
} from '@/lib/data/iki';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'finalize', 20);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });

  const raw = await req.json().catch(() => null);
  const parsed = FinalizeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    await finalizeDokumen(id, parsed.data.expected_version, g.session.userId);
  } catch (err) {
    if (err instanceof IkiVersionConflictError) {
      return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    }
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    console.error('[IKI Finalize Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
  await writeAuditLog({
    req, eventType: 'IKI_FINALIZE', userId: g.session.userId, username: g.session.username,
    detail: `Finalisasi dokumen IKI id=${id}`,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  if (g.session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN yang bisa membuka dokumen FINAL.' }, { status: 403 });
  }
  const limited = await ikiRateLimit(g.session.userId, 'unfinalize', 10);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    await unfinalizeDokumen(id, g.session.userId);
  } catch (err) {
    if (err instanceof IkiNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    console.error('[IKI Unfinalize Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
  await writeAuditLog({
    req, eventType: 'IKI_UNFINALIZE', userId: g.session.userId, username: g.session.username,
    detail: `Buka kembali (FINAL→DRAFT) dokumen IKI id=${id}`,
  });
  return NextResponse.json({ ok: true });
}
