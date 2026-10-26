import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { PengaturanBbaSchema } from '@/lib/bba/pengaturan';
import { bacaPengaturanBba, simpanPengaturanBba } from '@/lib/data/bba-aset';
import { guard, tolakKecualiEdit } from '../_guard';

// Pengaturan BBA: kop & penanda tangan Excel, jarak opname (docs/CONCEPT-bba-buku-aset.md §14).
// Satu kunci app_config `bba_pengaturan`, ditulis di sini dengan izin Master — bukan panel Config admin.
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  return NextResponse.json({ ok: true, pengaturan: await bacaPengaturanBba() });
}

export async function PUT(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'master'); if (ditolak) return ditolak;
  const limited = await bbaRateLimit(g.session.userId, 'pengaturan', 20); if (limited) return limited;
  const raw = await req.json().catch(() => null);
  const p = PengaturanBbaSchema.safeParse(raw);
  if (!p.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + p.error.issues[0].message }, { status: 400 });
  await simpanPengaturanBba(p.data);
  await writeAuditLog({ req, eventType: 'BBA_PENGATURAN', userId: g.session.userId, username: g.session.username, detail: `BBA pengaturan: opname ${p.data.opname_bulan} bln · kop "${p.data.kop.satuan_kerja.slice(0, 40)}" · ttd ${p.data.ttd.kota}` });
  return NextResponse.json({ ok: true, pengaturan: p.data });
}
