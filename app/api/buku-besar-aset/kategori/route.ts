import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { KategoriCreateSchema, KategoriDeleteSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { listKategori, createKategori, deleteKategori } from '@/lib/data/buku-besar-aset';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const data = await listKategori();
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await bbaRateLimit(g.session.userId, 'kategori', 30); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const parsed = KategoriCreateSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { id } = await createKategori(parsed.data.nama);
    await writeAuditLog({ req, eventType: 'BBA_KATEGORI_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA kategori add "${parsed.data.nama}"` });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return NextResponse.json({ ok: false, message: 'Kategori sudah ada' }, { status: 409 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const { searchParams } = new URL(req.url);
  const parsed = KategoriDeleteSchema.safeParse({ id: searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  const ok = await deleteKategori(parsed.data.id);
  if (!ok) return NextResponse.json({ ok: false, message: 'Kategori tidak ditemukan' }, { status: 404 });
  await writeAuditLog({ req, eventType: 'BBA_KATEGORI_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA kategori delete id=${parsed.data.id}` });
  return NextResponse.json({ ok: true });
}
