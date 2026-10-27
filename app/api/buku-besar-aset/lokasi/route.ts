import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { LokasiCreateSchema, LokasiUpdateSchema, LokasiDeleteSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import {
  listLokasi, createLokasi, updateLokasi, hapusLokasi, BbaLokasiKembarError, BbaLokasiDipakaiError, BbaGedungTidakDikenalError,
} from '@/lib/data/buku-besar-aset';
import { listGedung } from '@/lib/data/bba-aset';
import { guard, tolakKecualiEdit } from '../_guard';

export const dynamic = 'force-dynamic';

// Master Ruangan BBA (docs/CONCEPT-bba-buku-aset.md §15) — ruangan tempat peralatan, berada di gedung
// mana (kop KIR), luas, dan penanggung jawabnya. Modul kolaboratif seperti Master Barang (AUTHZ-02);
// jejaknya audit BBA_LOKASI_*. `gedung` = pilihan KIB C aktif untuk isian gedung & opname per gedung.
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const [data, gedung] = await Promise.all([listLokasi(), listGedung()]);
  return NextResponse.json({ ok: true, data, gedung });
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
    if (!(await updateLokasi(parsed.data))) return NextResponse.json({ ok: false, message: 'Ruangan tidak ditemukan.' }, { status: 404 });
  } catch (err) {
    if (err instanceof BbaLokasiKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    if (err instanceof BbaGedungTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
  const { id, ...ubah } = parsed.data;
  const ket = Object.entries(ubah).map(([k, v]) => `${k}=${v === null ? 'kosong' : JSON.stringify(v).slice(0, 60)}`).join(' ');
  await writeAuditLog({ req, eventType: 'BBA_LOKASI_UPDATE', userId: g.session.userId, username: g.session.username, detail: `BBA ruangan update id=${id} ${ket}` });
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
    if (!hasil) return NextResponse.json({ ok: false, message: 'Ruangan tidak ditemukan.' }, { status: 404 });
    await writeAuditLog({ req, eventType: 'BBA_LOKASI_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA lokasi delete id=${parsed.data.id} "${hasil.nama}"` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BbaLokasiDipakaiError) return NextResponse.json({ ok: false, code: 'LOKASI_DIPAKAI', message: err.message }, { status: 409 });
    throw err;
  }
}
