import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { LokasiCreateSchema, LokasiUpdateSchema, LokasiDeleteSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { listLokasi, createLokasi, updateLokasi, hapusLokasi, BbaLokasiKembarError, BbaLokasiDipakaiError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

export const dynamic = 'force-dynamic';

// Master Lokasi BBA (CONCEPT-bba-perencanaan §6.1) — ruangan tempat pendataan eksisting.
// Modul kolaboratif seperti Master Kategori/Barang (AUTHZ-02); jejaknya audit BBA_LOKASI_*.
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  return NextResponse.json({ ok: true, data: await listLokasi() });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'lokasi', 30); if (limited) return limited;
  const parsed = LokasiCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { id, nama } = await createLokasi(parsed.data.nama);
    await writeAuditLog({ req, eventType: 'BBA_LOKASI_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA lokasi add id=${id} "${nama}"` });
    return NextResponse.json({ ok: true, id, nama });
  } catch (err) {
    if (err instanceof BbaLokasiKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'lokasi', 30); if (limited) return limited;
  const parsed = LokasiUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    if (!(await updateLokasi(parsed.data.id, parsed.data.nama))) return NextResponse.json({ ok: false, message: 'Lokasi tidak ditemukan.' }, { status: 404 });
  } catch (err) {
    if (err instanceof BbaLokasiKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'BBA_LOKASI_UPDATE', userId: g.session.userId, username: g.session.username, detail: `BBA lokasi update id=${parsed.data.id} nama="${parsed.data.nama}"` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'lokasi', 30); if (limited) return limited;
  const parsed = LokasiDeleteSchema.safeParse({ id: new URL(req.url).searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    const hasil = await hapusLokasi(parsed.data.id);
    if (!hasil) return NextResponse.json({ ok: false, message: 'Lokasi tidak ditemukan.' }, { status: 404 });
    await writeAuditLog({ req, eventType: 'BBA_LOKASI_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA lokasi delete id=${parsed.data.id} "${hasil.nama}"` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BbaLokasiDipakaiError) return NextResponse.json({ ok: false, code: 'LOKASI_DIPAKAI', message: err.message }, { status: 409 });
    throw err;
  }
}
