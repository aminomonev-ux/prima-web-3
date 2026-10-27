import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { PindahAsetSchema } from '@/lib/data/bba-aset-schemas';
import { pindahkanAset, AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { BbaLokasiTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Pindah ruangan (docs/CONCEPT-bba-buku-aset.md §7.3): banyak register sekaligus, peralatan & aset
// tetap lainnya saja. Register yang sudah di ruangan tujuan dilewati, tidak dicatat sebagai pindah.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-pindah', 30); if (limited) return limited;
  const p = PindahAsetSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await pindahkanAset(p.data, g.session.userId);
    if (hasil.dipindah > 0) {
      await writeAuditLog({
        req, eventType: 'BBA_ASET_PINDAH', userId: g.session.userId, username: g.session.username,
        detail: `BBA pindah ${hasil.dipindah} register ke ${hasil.ruangan ? `"${hasil.ruangan.slice(0, 60)}"` : 'tanpa ruangan'}`,
      });
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaLokasiTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}
