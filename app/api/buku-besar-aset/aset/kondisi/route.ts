import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { CatatKondisiSchema } from '@/lib/data/bba-aset-schemas';
import { catatKondisi, AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { BbaBerkasTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Catat kondisi (docs/CONCEPT-bba-buku-aset.md §7.2): opname ruangan/gedung, laporan rusak, atau
// kartu aset — satu pintu. Semua register yang dikirim ditulis atau tidak sama sekali.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-kondisi', 30); if (limited) return limited;
  const p = CatatKondisiSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await catatKondisi(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_KONDISI', userId: g.session.userId, username: g.session.username,
      detail: `BBA catat kondisi tgl=${hasil.tgl} register=${hasil.dicek} berubah=${hasil.berubah}${p.data.file_id ? ' +foto' : ''}`,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaBerkasTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}
