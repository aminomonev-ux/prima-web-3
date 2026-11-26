import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { PenawaranSimpanSchema, PenawaranHapusSchema } from '@/lib/data/bba-penawaran-schemas';
import { listPenawaran, itemPenawaran, saranRekanan, simpanPenawaran, hapusPenawaran } from '@/lib/data/bba-penawaran';
import { BbaVersionConflictError, BbaNotFoundError, BbaBerkasTidakDikenalError, BbaBarangTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit, type GuardedSession } from '../_guard';

// Penawaran Rekanan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5A). Lihat = semua pemegang BBA (guard); catat/ubah/hapus =
// EDIT bagian Rencana ATAU Pengadaan — keduanya menerima penawaran.
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const barang = Number(sp.get('barang'));
  if (Number.isInteger(barang) && barang > 0) return NextResponse.json({ ok: true, item: await itemPenawaran(barang) });
  if (sp.get('mode') === 'banding') return NextResponse.json({ ok: true, item: await itemPenawaran() });
  const q = (sp.get('q') ?? '').slice(0, 120);
  const [surat, rekanan] = await Promise.all([listPenawaran(q), saranRekanan()]);
  return NextResponse.json({ ok: true, surat, rekanan });
}

const galat = (err: unknown) => {
  if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: 'Surat ini baru saja diubah orang lain — dimuat ulang.' }, { status: 409 });
  if (err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: 'Surat penawaran tidak ditemukan.' }, { status: 404 });
  if (err instanceof BbaBerkasTidakDikenalError || err instanceof BbaBarangTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
  throw err;
};

async function simpan(req: NextRequest, s: GuardedSession, ubah: boolean) {
  const limited = await bbaRateLimit(s.userId, 'penawaran', 60); if (limited) return limited;
  const p = PenawaranSimpanSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  if (ubah !== !!p.data.id) return NextResponse.json({ ok: false, message: ubah ? 'Id surat wajib saat mengubah.' : 'Surat baru tidak membawa id.' }, { status: 400 });
  try {
    const h = await simpanPenawaran(p.data, s.userId);
    await writeAuditLog({ req, eventType: 'BBA_PENAWARAN_SIMPAN', userId: s.userId, username: s.username,
      detail: `BBA penawaran ${h.baru ? 'baru' : 'ubah'} id=${h.id} rekanan="${p.data.kepala.rekanan.slice(0, 80)}" ${h.item} item` });
    return NextResponse.json({ ok: true, ...h });
  } catch (err) { return galat(err); }
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  return simpan(req, g.session, false);
}

export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  return simpan(req, g.session, true);
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana', 'pengadaan'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const p = PenawaranHapusSchema.safeParse({ id: sp.get('id'), v: sp.get('v') });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Id/angka kunci tidak valid' }, { status: 400 });
  try {
    const h = await hapusPenawaran(p.data.id, p.data.v);
    await writeAuditLog({ req, eventType: 'BBA_PENAWARAN_HAPUS', userId: g.session.userId, username: g.session.username,
      detail: `BBA hapus penawaran id=${p.data.id} rekanan="${h.rekanan.slice(0, 80)}" ${h.item} item (referensi rencana tetap — salinan)` });
    return NextResponse.json({ ok: true });
  } catch (err) { return galat(err); }
}
