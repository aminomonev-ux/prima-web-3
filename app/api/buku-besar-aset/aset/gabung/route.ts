import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { GabungKembarSchema, KembarCariSchema } from '@/lib/data/bba-aset-schemas';
import { calonKembar, gabungKembar, AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { guard, tolakKecualiEdit, tolakKecualiLihat } from '../../_guard';

// Gabungkan dengan kembarannya (docs/CONCEPT-bba-buku-aset.md §23.2): GET ?id= saran kembaran (&register= cari nomor) ·
// POST = catatan yang kartunya dibuka mengambil nomor & kolom KIB kembarannya, kembarannya dibuang.
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'aset'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const p = KembarCariSchema.safeParse({ id: sp.get('id'), register: sp.get('register') || undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Pencarian tidak valid' }, { status: 400 });
  const hasil = await calonKembar(p.data.id, p.data.register);
  if (!hasil) return NextResponse.json({ ok: false, message: 'Aset tidak ditemukan.' }, { status: 404 });
  const { ini } = hasil;
  return NextResponse.json({
    ok: true, calon: hasil.calon,
    ini: { id: ini.id, version: ini.version ?? 0, nama_resmi: ini.nama_resmi, kode_barang: ini.kode_barang, register: ini.register },
  });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-gabung', 30); if (limited) return limited;
  const p = GabungKembarSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    const hasil = await gabungKembar(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_GABUNG', userId: g.session.userId, username: g.session.username,
      detail: `BBA gabungkan kembar: aset id=${p.data.id} ${hasil.nomorLama} → ${hasil.nomorBaru}, kembaran id=${p.data.kembar_id} dibuang — alasan: ${p.data.alasan}`.slice(0, 1000),
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof AsetTidakAdaError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
