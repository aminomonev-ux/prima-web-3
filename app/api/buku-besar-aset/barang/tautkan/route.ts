import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BarangTautkanSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { tautkanBarang, BbaBarangTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// POST /api/buku-besar-aset/barang/tautkan { pasangan: [{ aset_id, barang_id | barang_baru }] }
// Tautkan sekaligus dari spanduk "belum ditautkan" (§5.1). Hanya item yang MASIH tanpa barang.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'barang-tautkan', 10); if (limited) return limited;
  const parsed = BarangTautkanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const h = await tautkanBarang(parsed.data, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_BARANG_TAUTKAN', userId: g.session.userId, username: g.session.username,
      detail: `BBA tautkan barang item=${h.ditautkan} dilewati=${h.dilewati} barang_baru=${h.barang_baru}` });
    return NextResponse.json({ ok: true, ...h });
  } catch (err) {
    if (err instanceof BbaBarangTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    throw err;
  }
}
