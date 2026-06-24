import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DokumenHeaderSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import {
  getDokumenDetail, updateDokumenHeader,
  LkjipVersionConflictError, LkjipNotFoundError, LkjipFinalError,
} from '@/lib/lkjip/data';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const detail = await getDokumenDetail(id);
  if (!detail) return NextResponse.json({ ok: false, msg: 'Dokumen tidak ditemukan' }, { status: 404 });
  return NextResponse.json({ ok: true, dokumen: detail });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'doc-header', 60); if (limited) return limited;
  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const raw = await req.json().catch(() => null);
  const parsed = DokumenHeaderSchema.safeParse({ ...(raw ?? {}), id });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    await updateDokumenHeader(id, parsed.data.expected_version, { judul: parsed.data.judul, style_config: parsed.data.style_config }, g.session.userId);
  } catch (err) {
    if (err instanceof LkjipVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', msg: err.message }, { status: 409 });
    if (err instanceof LkjipFinalError)           return NextResponse.json({ ok: false, msg: err.message }, { status: 409 });
    if (err instanceof LkjipNotFoundError)        return NextResponse.json({ ok: false, msg: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'LKJIP_UPDATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP header update id=${id}` });
  return NextResponse.json({ ok: true });
}
