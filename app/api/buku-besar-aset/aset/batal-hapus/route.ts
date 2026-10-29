import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { BatalHapusSchema } from '@/lib/data/bba-penerimaan-schemas';
import { batalHapus } from '@/lib/data/bba-penerimaan';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { bolehBatalkanFinal } from '@/lib/constants';
import { guard, tolakKecualiEdit } from '../../_guard';

// Batalkan penghapusan aset yang salah ditandai (§20.3) — khusus Admin (pola koreksi mundur penerimaan).
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  if (!bolehBatalkanFinal(g.session.role))
    return NextResponse.json({ ok: false, code: 'KHUSUS_ADMIN', message: 'Membatalkan penghapusan hanya oleh Admin — mintakan ke Admin bila aset ini memang tidak termasuk SK.' }, { status: 403 });
  const limited = await bbaRateLimit(g.session.userId, 'aset-batal-hapus', 30); if (limited) return limited;
  const p = BatalHapusSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await batalHapus(p.data, g.session.userId, true);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_BATAL_HAPUS', userId: g.session.userId, username: g.session.username,
      detail: `BBA batalkan penghapusan aset id=${p.data.id} (SK ${hasil.sk}) — alasan: ${p.data.alasan}`.slice(0, 1000),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
