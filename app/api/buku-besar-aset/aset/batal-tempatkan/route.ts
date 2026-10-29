import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { BatalTempatkanSchema } from '@/lib/data/bba-penerimaan-schemas';
import { batalTempatkan } from '@/lib/data/bba-penerimaan';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Batalkan penempatan yang salah (§20.1): register belum teregister yang lahir dari Tempatkan dibuang,
// unitnya kembali ke antrean. Izin sama dengan Tempatkan; yang menjaga adalah syarat "belum teregister".
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-batal-tempatkan', 30); if (limited) return limited;
  const p = BatalTempatkanSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await batalTempatkan(p.data);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_BATAL_TEMPATKAN', userId: g.session.userId, username: g.session.username,
      detail: `BBA batalkan penempatan ${hasil.dibatalkan} register (${hasil.rincian}) — alasan: ${p.data.alasan}`.slice(0, 1000),
    });
    return NextResponse.json({ ok: true, dibatalkan: hasil.dibatalkan });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
