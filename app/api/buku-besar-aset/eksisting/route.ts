import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { EksistingSimpanSchema, EksistingFormSchema, EksistingDeleteSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import {
  formPendataan, simpanPendataan, hapusPendataan,
  BbaLokasiTidakDikenalError, BbaBarangTidakDikenalError, BbaBerkasTidakDikenalError, BbaTanggalCekError,
} from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

export const dynamic = 'force-dynamic';

// Pendataan kondisi eksisting (CONCEPT-bba-perencanaan §6.1).
//   GET ?lokasi_id=&tgl=  → form: barang yang pernah tercatat di lokasi itu + angka terakhir & tanggal itu
//   POST                  → simpan satu lokasi × satu tanggal (tanggal sama = menimpa)
//   DELETE ?id=           → koreksi: hapus satu pendataan
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const p = EksistingFormSchema.safeParse({ lokasi_id: sp.get('lokasi_id') ?? undefined, tgl: sp.get('tgl') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  const form = await formPendataan(p.data.lokasi_id, p.data.tgl);
  if (!form) return NextResponse.json({ ok: false, message: 'Lokasi tidak ditemukan.' }, { status: 404 });
  return NextResponse.json({ ok: true, ...form });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'eksisting', 30); if (limited) return limited;
  const parsed = EksistingSimpanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const h = await simpanPendataan(parsed.data, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_EKSISTING_SAVE', userId: g.session.userId, username: g.session.username,
      detail: `BBA pendataan lokasi="${h.lokasi}" tgl=${parsed.data.tgl_cek} barang=${h.disimpan}${h.ditimpa ? ` menimpa=${h.ditimpa}` : ''}` });
    return NextResponse.json({ ok: true, ...h });
  } catch (err) {
    if (err instanceof BbaLokasiTidakDikenalError || err instanceof BbaBarangTidakDikenalError || err instanceof BbaBerkasTidakDikenalError || err instanceof BbaTanggalCekError)
      return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'eksisting', 30); if (limited) return limited;
  const parsed = EksistingDeleteSchema.safeParse({ id: new URL(req.url).searchParams.get('id') ?? undefined });
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });
  const h = await hapusPendataan(parsed.data.id);
  if (!h) return NextResponse.json({ ok: false, message: 'Pendataan tidak ditemukan.' }, { status: 404 });
  await writeAuditLog({ req, eventType: 'BBA_EKSISTING_DELETE', userId: g.session.userId, username: g.session.username,
    detail: `BBA pendataan delete id=${parsed.data.id} barang="${h.barang}" lokasi="${h.lokasi}" tgl=${h.tgl_cek}` });
  return NextResponse.json({ ok: true });
}
