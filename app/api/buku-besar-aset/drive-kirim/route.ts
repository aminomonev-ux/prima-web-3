import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { kirimLaporanKeDrive, bacaStatusDrive } from '@/lib/data/bba-laporan';
import { tujuanTerkonfigurasi } from '@/lib/services/drive-tujuan';
import { bolehBatalkanFinal } from '@/lib/constants';
import { guard, tolakKecualiEdit } from '../_guard';

// Status salinan laporan BBA di Drive (GET, semua pemegang BBA) + "Kirim ke Drive sekarang" (POST, Admin) —
// docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.3. Tanda hidup yang terlihat: "Terakhir terkirim …".
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.res;
  const [st, diatur] = await Promise.all([bacaStatusDrive(), tujuanTerkonfigurasi('bba_laporan')]);
  return NextResponse.json({ ok: true, diatur, terakhir: st.terakhir ?? null,
    berkas: Object.entries(st.berkas).map(([kunci, s]) => ({ kunci, terkirim_pada: s.terkirim_pada ?? null, galat: s.galat ?? null, menunggu: s.sidik_terlihat !== s.sidik_terkirim })) });
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiEdit(g.session, 'rencana'); if (ditolak) return ditolak;
  if (!bolehBatalkanFinal(g.session.role)) return NextResponse.json({ ok: false, code: 'KHUSUS_ADMIN', message: 'Kirim ke Drive sekarang hanya oleh Admin — salinan otomatis tetap jalan tiap 5 menit.' }, { status: 403 });
  const limited = await bbaRateLimit(g.session.userId, 'drive-kirim', 6); if (limited) return limited;
  const h = await kirimLaporanKeDrive(true);
  if (h.status === 'belum-diatur') return NextResponse.json({ ok: false, code: 'BELUM_DIATUR', message: 'Folder induk Drive belum diatur — atur di Admin Panel → Drive & Backup.' }, { status: 409 });
  if (h.status === 'sibuk') return NextResponse.json({ ok: false, code: 'SEDANG_MENGIRIM', message: 'Salinan ke Drive sedang dikirim (otomatis atau oleh Admin lain). Tunggu sebentar, lalu lihat "Terakhir terkirim".' }, { status: 409 });
  await writeAuditLog({ req, eventType: 'BBA_DRIVE_KIRIM', userId: g.session.userId, username: g.session.username,
    detail: `BBA laporan ke Drive (tombol): ${h.dikirim.length} terkirim${h.gagal.length ? `, ${h.gagal.length} gagal — ${h.gagal.join(' · ')}` : ''}`.slice(0, 1000) });
  return NextResponse.json({ ok: true, ...h });
}
