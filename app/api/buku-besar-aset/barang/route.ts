import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  BarangCreateSchema, BarangUpdateSchema, BarangDeleteSchema, BarangQuerySchema, bbaRateLimit,
} from '@/lib/data/buku-besar-aset-schemas';
import {
  listBarang, createBarang, updateBarang, hapusBarang, perBarangTahun, detailBarang,
  BbaBarangKembarError, BbaBarangDipakaiError,
} from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

export const dynamic = 'force-dynamic';

// Master Barang BBA (CONCEPT-bba-perencanaan §5). Modul kolaboratif: semua pemegang akses BBA
// boleh mengelola, sama seperti Master Kategori (AUTHZ-02) — jejaknya audit BBA_BARANG_*.
//   GET                     → daftar barang (Master + pemilih barang di modal item)
//   GET ?ringkas=1&tahun=T  → tampilan Per Barang tahun T + item belum ditautkan
//   GET ?id=&tahun=T        → kartu barang (riwayat per tahun)
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const p = BarangQuerySchema.safeParse({ id: sp.get('id') ?? undefined, tahun: sp.get('tahun') ?? undefined, ringkas: sp.get('ringkas') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  const tahun = p.data.tahun ?? new Date().getFullYear();
  if (p.data.id) {
    const detail = await detailBarang(p.data.id, tahun);
    if (!detail) return NextResponse.json({ ok: false, message: 'Barang tidak ditemukan.' }, { status: 404 });
    return NextResponse.json({ ok: true, ...detail });
  }
  if (p.data.ringkas) return NextResponse.json({ ok: true, ...(await perBarangTahun(tahun)) });
  return NextResponse.json({ ok: true, data: await listBarang() });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'barang', 30); if (limited) return limited;
  const parsed = BarangCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const { id, nama } = await createBarang(parsed.data, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_BARANG_ADD', userId: g.session.userId, username: g.session.username, detail: `BBA barang add id=${id} "${nama}"` });
    return NextResponse.json({ ok: true, id, nama });
  } catch (err) {
    if (err instanceof BbaBarangKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    throw err;
  }
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'barang', 30); if (limited) return limited;
  const parsed = BarangUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const ok = await updateBarang(parsed.data);
    if (!ok) return NextResponse.json({ ok: false, message: 'Barang tidak ditemukan.' }, { status: 404 });
  } catch (err) {
    if (err instanceof BbaBarangKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 409 });
    throw err;
  }
  await writeAuditLog({ req, eventType: 'BBA_BARANG_UPDATE', userId: g.session.userId, username: g.session.username, detail: `BBA barang update id=${parsed.data.id}${parsed.data.nama ? ` nama="${parsed.data.nama}"` : ''}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'barang', 30); if (limited) return limited;
  const parsed = BarangDeleteSchema.safeParse({ id: new URL(req.url).searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  try {
    const hasil = await hapusBarang(parsed.data.id);
    if (!hasil) return NextResponse.json({ ok: false, message: 'Barang tidak ditemukan.' }, { status: 404 });
    await writeAuditLog({ req, eventType: 'BBA_BARANG_DELETE', userId: g.session.userId, username: g.session.username, detail: `BBA barang delete id=${parsed.data.id} "${hasil.nama}"` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BbaBarangDipakaiError) return NextResponse.json({ ok: false, code: 'BARANG_DIPAKAI', message: err.message }, { status: 409 });
    throw err;
  }
}
