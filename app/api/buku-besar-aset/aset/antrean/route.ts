import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { AntreanAksiSchema } from '@/lib/data/bba-penerimaan-schemas';
import { antreanBukuAset, tempatkan, catatRehab, PenerimaanDitolakError } from '@/lib/data/bba-penerimaan';
import { AsetVersiError, AsetTidakAdaError, AsetDitolakError } from '@/lib/data/bba-aset';
import { BbaNotFoundError, BbaLokasiTidakDikenalError, BbaBerkasTidakDikenalError } from '@/lib/data/buku-besar-aset';
import { guard, tolakKecualiEdit, tolakKecualiLihat } from '../../_guard';

// Antrean "barang diterima, belum dicatat" (docs/CONCEPT-bba-buku-aset.md §7.5, §15): dihitung, tidak
// disimpan. POST TEMPATKAN = jadi register "belum teregister"; POST REHAB = rehab selesai, perbarui gedung.
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'aset'); if (ditolak) return ditolak;
  return NextResponse.json({ ok: true, ...(await antreanBukuAset()) });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'aset'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'aset-antrean', 30); if (limited) return limited;
  const p = AntreanAksiSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  try {
    if (p.data.aksi === 'TEMPATKAN') {
      const hasil = await tempatkan(p.data, g.session.userId);
      await writeAuditLog({
        req, eventType: 'BBA_ASET_TEMPATKAN', userId: g.session.userId, username: g.session.username,
        detail: `BBA tempatkan ${hasil.ditempatkan} register dari penerimaan id=${p.data.penerimaan_id} (${hasil.canonical_id}) golongan ${p.data.golongan}`,
      });
      return NextResponse.json({ ok: true, ...hasil });
    }
    const hasil = await catatRehab(p.data, g.session.userId);
    await writeAuditLog({
      req, eventType: 'BBA_ASET_REHAB', userId: g.session.userId, username: g.session.username,
      detail: `BBA rehab selesai aset id=${p.data.aset_id} (${hasil.canonical_id}) kondisi=${p.data.kondisi} tgl=${p.data.tgl}`,
    });
    return NextResponse.json({ ok: true, ...hasil });
  } catch (err) {
    if (err instanceof AsetVersiError) return NextResponse.json({ ok: false, code: 'VERSION_CONFLICT', message: err.message }, { status: 409 });
    if (err instanceof AsetDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message, alasan: err.alasan }, { status: 400 });
    if (err instanceof PenerimaanDitolakError) return NextResponse.json({ ok: false, code: 'DITOLAK', message: err.message }, { status: 400 });
    if (err instanceof BbaLokasiTidakDikenalError || err instanceof BbaBerkasTidakDikenalError) return NextResponse.json({ ok: false, message: err.message }, { status: 400 });
    if (err instanceof AsetTidakAdaError || err instanceof BbaNotFoundError) return NextResponse.json({ ok: false, message: err.message }, { status: 404 });
    throw err;
  }
}
