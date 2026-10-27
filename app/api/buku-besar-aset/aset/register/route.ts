import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { RegisterSchema } from '@/lib/data/bba-penerimaan-schemas';
import { isiRegister } from '@/lib/data/bba-penerimaan';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Isi kode barang + register dari sistem provinsi untuk aset "belum teregister" (§7.5 butir 3).
export async function PATCH(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-register', 60); if (limited) return limited;
  const p = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await isiRegister(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_REGISTER', userId: g.session.userId, username: g.session.username,
      detail: `BBA isi register aset id=${p.data.id} → ${hasil.kunci_impor}`,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
