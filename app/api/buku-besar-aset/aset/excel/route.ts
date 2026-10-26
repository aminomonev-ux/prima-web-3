import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { KibExcelSchema } from '@/lib/data/bba-aset-schemas';
import { asetUntukKib, bacaPengaturanBba } from '@/lib/data/bba-aset';
import { tulisLembarKib, NAMA_BERKAS_KIB } from '@/lib/bba/kib-excel';
import { GOLONGAN, type Golongan } from '@/lib/bba/kib';
import { tanggalHariIniWIB } from '@/lib/shared/waktu-wib';
import { guard, tolakKecualiLihat } from '../../_guard';

// Excel KIB A–F format provinsi persis (docs/CONCEPT-bba-buku-aset.md §9). Disusun di server
// supaya satu penyusun dipakai semua pintu unduh dan tiap unduhan tercatat.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'cetak'); if (ditolak) return ditolak;
  const p = KibExcelSchema.safeParse({ golongan: new URL(req.url).searchParams.get('golongan') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Golongan KIB tidak valid' }, { status: 400 });
  const limited = await bbaRateLimit(g.session.userId, 'aset-excel', 20); if (limited) return limited;

  const daftar: Golongan[] = p.data.golongan === 'SEMUA' ? [...GOLONGAN] : [p.data.golongan];
  const [pengaturan, isi] = await Promise.all([bacaPengaturanBba(), Promise.all(daftar.map(asetUntukKib))]);
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PRIMA';
  const tanggal = tanggalHariIniWIB();
  daftar.forEach((gol, i) => tulisLembarKib(wb, gol, isi[i], pengaturan, tanggal));
  const buf = await wb.xlsx.writeBuffer();
  const nama = NAMA_BERKAS_KIB(p.data.golongan, tanggal);
  await writeAuditLog({ req, eventType: 'BBA_ASET_UNDUH', userId: g.session.userId, username: g.session.username, detail: `BBA unduh ${nama} (${isi.reduce((s, x) => s + x.length, 0)} register)` });
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nama}"`,
      'Cache-Control': 'no-store',
    },
  });
}
