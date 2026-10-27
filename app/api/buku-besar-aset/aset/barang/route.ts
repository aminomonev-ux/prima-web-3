import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { TautkanBarangAsetSchema } from '@/lib/data/bba-aset-schemas';
import { tautkanBarangAset, AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { BbaBarangTidakDikenalError, BbaBarangKembarError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// Tautkan banyak register ke satu barang (Master Barang) — supaya Per Barang & kartu barang tahu
// berapa yang dimiliki (§8). Kolom KIB tidak disentuh.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-ubah', 60); if (limited) return limited;
  const p = TautkanBarangAsetSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await tautkanBarangAset(p.data, g.session.userId);
    if (hasil.ditautkan > 0) {
      await writeAuditLog({
        req, eventType: 'BBA_ASET_UBAH', userId: g.session.userId, username: g.session.username,
        detail: `BBA tautkan ${hasil.ditautkan} register ke barang ${hasil.barang ? `"${hasil.barang.slice(0, 60)}"` : '(dilepas)'}`,
      });
    }
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaBarangTidakDikenalError || err instanceof BbaBarangKembarError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}
