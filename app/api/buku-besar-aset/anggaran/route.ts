import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { AnggaranSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { tandaiAnggaran, BbaVersionConflictError, BbaNotFoundError, BbaAnggaranError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../_guard';

// Tanda "masuk anggaran" borongan (docs/CONCEPT-bba-buku-aset.md §7.4): Didanai · Tidak didanai · Belum.
// Ditandai Perencanaan (izin EDIT Rencana); daftar Pengadaan berdiri di atas tanda ini.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'anggaran', 30); if (limited) return limited;
  const p = AnggaranSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await tandaiAnggaran(p.data, g.session.userId);
    if (hasil.ditandai > 0) {
      await writeAuditLog({
        req, eventType: 'BBA_RENCANA_ANGGARAN', userId: g.session.userId, username: g.session.username,
        detail: `BBA tandai ${hasil.ditandai} rencana ${p.data.anggaran} (id ${p.data.item.slice(0, 20).map(x => x.id).join(',')}${p.data.item.length > 20 ? ',…' : ''})`,
      });
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof BbaAnggaranError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
