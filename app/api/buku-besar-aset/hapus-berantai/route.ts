import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { HapusBerantaiSchema } from '@/lib/data/bba-penerimaan-schemas';
import { hapusBerantai, HapusBerantaiError } from '@/lib/data/bba-penerimaan';
import { BbaVersionConflictError, BbaNotFoundError } from '@/lib/data/buku-besar-aset';
import { bolehBatalkanFinal } from '@/lib/constants';
import { guard, tolakKecualiEdit } from '../_guard';

// Hapus data salah input sekali jalan (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5.2) — item + penerimaan + register
// hasil Tempatkan, satu transaksi. Khusus Admin (`bolehBatalkanFinal`), diperiksa di sini DAN di data layer.
// Jejaknya potret lengkap di audit log, karena barisnya sudah tiada.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana'); if (ditolak) return ditolak;
  if (!bolehBatalkanFinal(g.session.role))
    return NextResponse.json({ ok: false, code: 'KHUSUS_ADMIN', message: 'Hapus berantai hanya oleh Admin. Pakai "Riwayat dan batalkan" untuk membatalkan langkah satu per satu.' }, { status: 403 });
  const limited = await bbaRateLimit(g.session.userId, 'hapus-berantai', 10); if (limited) return limited;
  const p = HapusBerantaiSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const potret = await hapusBerantai(p.data, g.session.userId, true);
    await writeAuditLog({
      req, eventType: 'BBA_RENCANA_HAPUS_BERANTAI', userId: g.session.userId, username: g.session.username,
      detail: `BBA hapus berantai ${potret.item.canonical_id} — alasan: ${p.data.alasan} · potret: ${JSON.stringify(potret)}`.slice(0, 4000),
    });
    return NextResponse.json({ ok: true, ...potret });
  } catch (err) {
    if (err instanceof BbaVersionConflictError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof HapusBerantaiError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
