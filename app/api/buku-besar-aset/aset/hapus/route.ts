import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { HapusAsetSchema } from '@/lib/data/bba-penerimaan-schemas';
import { hapusAset } from '@/lib/data/bba-penerimaan';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { BbaBerkasTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Penghapusan aset dengan SK (§7.6): status DIHAPUS + nomor/tanggal SK, catatannya tetap ada.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-hapus', 30); if (limited) return limited;
  const p = HapusAsetSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    await hapusAset(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_HAPUS', userId: g.session.userId, username: g.session.username,
      detail: `BBA hapus aset id=${p.data.id} SK ${p.data.sk_nomor} tgl ${p.data.sk_tgl}${p.data.file_id ? ' +berkas' : ''}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof BbaBerkasTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
