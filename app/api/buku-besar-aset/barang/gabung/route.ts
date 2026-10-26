import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { BarangGabungSchema, bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { gabungBarang, BbaBarangTidakDikenalError, BbaGabungBentrokError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit } from '../../_guard';

// POST /api/buku-besar-aset/barang/gabung { dari, ke } — semua item barang `dari` pindah ke `ke`,
// lalu `dari` dihapus. Satu transaksi (§5.1); versi item yang dipindah ikut naik.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'barang-gabung', 10); if (limited) return limited;
  const parsed = BarangGabungSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  try {
    const h = await gabungBarang(parsed.data.dari, parsed.data.ke, g.session.userId);
    await writeAuditLog({ req, eventType: 'BBA_BARANG_GABUNG', userId: g.session.userId, username: g.session.username,
      detail: `BBA barang gabung id=${parsed.data.dari} "${h.nama_dari}" → id=${parsed.data.ke} "${h.nama_ke}" item=${h.dipindah} pendataan=${h.pendataan}` });
    return NextResponse.json({ ok: true, dipindah: h.dipindah, pendataan: h.pendataan });
  } catch (err) {
    if (err instanceof BbaBarangTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    if (err instanceof BbaGabungBentrokError) return NextResponse.json({ ok: false, code: 'GABUNG_BENTROK', message: err.message }, { status: 409 });
    throw err;
  }
}
