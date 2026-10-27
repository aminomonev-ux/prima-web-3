import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BbaProsesSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { ubahStatusProses, BbaVersionConflictError, BbaNotFoundError, BbaStatusMismatchError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

// PATCH /api/buku-besar-aset/proses — Direncanakan ⇄ Dalam Proses ⇄ Tidak Terealisasi (§7.4).
// Angka realisasi & status diterima TIDAK lewat sini: turunan penerimaan (route pengadaan, Tahap E).
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'pengadaan'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'proses', 60); if (limited) return limited;
  const parsed = BbaProsesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    await ubahStatusProses(parsed.data, g.session.userId);
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof BbaStatusMismatchError)  return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof BbaNotFoundError)        return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
  const d = parsed.data;
  await writeAuditLog({ req, eventType: 'BBA_REALISASI', userId: g.session.userId, username: g.session.username,
    detail: `BBA proses id=${d.id} status=${d.status}${d.status === 'DIPROSES' && d.tgl_proses ? ` tgl_proses=${d.tgl_proses}` : ''}` });
  return NextResponse.json({ ok: true });
}
