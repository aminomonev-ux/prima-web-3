import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  BbaQuerySchema, BbaCreateSchema, BbaUpdateSchema, BbaDeleteSchema, bbaRateLimit,
} from '@/lib/data/buku-besar-aset-schemas';
import {
  listAset, createAset, updateAset, deleteAset,
  BbaVersionConflictError, BbaTransitionError, BbaNotFoundError, BbaUsulanLockedError,
} from '@/lib/data/buku-besar-aset';
import { guard } from './_guard';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { searchParams } = new URL(req.url);
  const parsed = BbaQuerySchema.safeParse({
    tahun:    searchParams.get('tahun')    ?? undefined,
    status:   searchParams.get('status')   ?? undefined,
    sumber:   searchParams.get('sumber')   ?? undefined,
    kategori:  searchParams.get('kategori')  ?? undefined,
    pj:        searchParams.get('pj')        ?? undefined,
    origin:    searchParams.get('origin')    ?? undefined,
    keputusan: searchParams.get('keputusan') ?? undefined,
    q:         searchParams.get('q')         ?? undefined,
    page:     searchParams.get('page')     ?? undefined,
    limit:    searchParams.get('limit')    ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const result = await listAset(parsed.data);
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await bbaRateLimit(g.session.userId, 'create', 30); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = BbaCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { id, canonical_id } = await createAset(parsed.data, g.session.userId);
  await writeAuditLog({ req, eventType: 'BBA_CREATE', userId: g.session.userId, username: g.session.username, detail: `BBA create ${canonical_id} (${parsed.data.tahun_anggaran}) ${parsed.data.uraian.slice(0, 60)}` });
  return NextResponse.json({ ok: true, id, canonical_id });
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await bbaRateLimit(g.session.userId, 'update', 60); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = BbaUpdateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    await updateAset(parsed.data, g.session.userId);
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof BbaTransitionError)      return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaUsulanLockedError)    return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaNotFoundError)        return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'BBA_UPDATE', userId: g.session.userId, username: g.session.username, detail: `BBA update id=${parsed.data.id}${parsed.data.status ? ' status=' + parsed.data.status : ''}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await bbaRateLimit(g.session.userId, 'delete', 30); if (limited) return limited;
  const { searchParams } = new URL(req.url);
  const parsed = BbaDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  const ok = await deleteAset(parsed.data.id);
  if (!ok) return NextResponse.json({ ok: false, message: 'Data tidak ditemukan' }, { status: 404 });
  await writeAuditLog({ req, eventType: 'BBA_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA delete id=${parsed.data.id}` });
  return NextResponse.json({ ok: true });
}
