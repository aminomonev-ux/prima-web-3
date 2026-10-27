import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { PengadaanQuerySchema, PenerimaanSchema, HapusPenerimaanSchema } from '@/lib/data/bba-penerimaan-schemas';
import { pengadaanTahun, penerimaanUntuk, catatPenerimaan, hapusPenerimaan, PenerimaanDitolakError } from '@/lib/data/bba-penerimaan';
import { getAsetById, listReferensi, BbaVersionConflictError, BbaNotFoundError } from '@/lib/data/buku-besar-aset';
import { bolehBatalkanFinal } from '@/lib/constants';
import { guard, tolakKecualiEdit, tolakKecualiLihat } from '../_guard';

// Pengadaan & penerimaan (docs/CONCEPT-bba-buku-aset.md §7.4, §14). Realisasi rencana = Σ penerimaan,
// ditulis HANYA lewat POST/DELETE di sini.
//   GET ?tahun=   → rencana DIDANAI tahun itu + penerimaannya (halaman Pengadaan)
//   GET ?rencana= → satu rencana + referensi + penerimaannya (modal Proses & Penerimaan)
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'pengadaan'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const rencana = Number(sp.get('rencana'));
  if (Number.isInteger(rencana) && rencana > 0) {
    const item = await getAsetById(rencana);
    if (!item) return NextResponse.json({ ok: false, message: 'Rencana tidak ditemukan' }, { status: 404 });
    const [referensi, per] = await Promise.all([listReferensi(rencana), penerimaanUntuk([rencana])]);
    return NextResponse.json({ ok: true, item, referensi, penerimaan: per[rencana] ?? [] });
  }
  const p = PengadaanQuerySchema.safeParse({ tahun: sp.get('tahun') });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });
  return NextResponse.json({ ok: true, ...(await pengadaanTahun(p.data.tahun)) });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'pengadaan'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'penerimaan', 30); if (limited) return limited;
  const p = PenerimaanSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await catatPenerimaan(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_PENERIMAAN_CATAT', userId: g.session.userId, username: g.session.username,
      detail: `BBA penerimaan ${hasil.canonical_id} tgl=${p.data.tgl} vol=${p.data.vol} harga=${p.data.harga_satuan} ref=${p.data.referensi_urutan ?? '-'} → ${hasil.status}${hasil.siapDihapus ? ` · ${hasil.siapDihapus} aset siap dihapus` : ''}`,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof PenerimaanDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message }, { status: 400 });
    if (err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'pengadaan'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'penerimaan', 30); if (limited) return limited;
  const p = HapusPenerimaanSchema.safeParse({ id: new URL(req.url).searchParams.get('id') });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Id tidak valid' }, { status: 400 });
  try {
    const hasil = await hapusPenerimaan(p.data.id, g.session.userId, bolehBatalkanFinal(g.session.role));
    if (!hasil) return NextResponse.json({ ok: false, message: 'Penerimaan tidak ditemukan' }, { status: 404 });
    await writeAuditLog({
      req, eventType: 'BBA_PENERIMAAN_HAPUS', userId: g.session.userId, username: g.session.username,
      detail: `BBA hapus penerimaan id=${p.data.id} ${hasil.canonical_id}${hasil.dariPenuh ? ' (koreksi mundur dari Diterima penuh)' : ''}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PenerimaanDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message }, { status: 400 });
    throw err;
  }
}
