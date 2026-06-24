import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DokumenQuerySchema, DokumenCreateSchema, DokumenDeleteSchema, lkjipRateLimit } from '@/lib/lkjip/schemas';
import { listDokumen, createDokumen, deleteDokumen } from '@/lib/lkjip/data';
import { guard } from './_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { searchParams } = new URL(req.url);
  const parsed = DokumenQuerySchema.safeParse({
    tahun:  searchParams.get('tahun')  ?? undefined,
    status: searchParams.get('status') ?? undefined,
    q:      searchParams.get('q')      ?? undefined,
    page:   searchParams.get('page')   ?? undefined,
    limit:  searchParams.get('limit')  ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const result = await listDokumen(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'doc-create', 20); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = DokumenCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { id, canonical_id } = await createDokumen(parsed.data.tahun, parsed.data.judul, g.session.userId, parsed.data.template);
  await writeAuditLog({ req, eventType: 'LKJIP_CREATE', userId: g.session.userId, username: g.session.username, detail: `LKJIP create ${canonical_id} tahun ${parsed.data.tahun} (${parsed.data.template})` });
  return NextResponse.json({ ok: true, id, canonical_id });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await lkjipRateLimit(g.session.userId, 'doc-delete', 20); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const parsed = DokumenDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, msg: 'ID tidak valid' }, { status: 400 });
  const ok = await deleteDokumen(parsed.data.id);
  if (!ok) return NextResponse.json({ ok: false, msg: 'Dokumen tidak ditemukan' }, { status: 404 });
  await writeAuditLog({ req, eventType: 'LKJIP_DELETE', userId: g.session.userId, username: g.session.username, detail: `LKJIP delete id=${parsed.data.id}` });
  return NextResponse.json({ ok: true });
}
