import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/security/auditlog';
import { bbaRateLimit } from '@/lib/data/buku-besar-aset-schemas';
import { bukuRencanaBuffer } from '@/lib/data/bba-laporan';
import { LEMBAR_BUKU } from '@/lib/bba/laporan-excel';
import { guard, tolakKecualiLihat } from '../_guard';

// "BBA {tahun} — Rencana s.d. Pengadaan.xlsx" (docs/konsep/bba/CONCEPT-bba-revamp-alur.md §5B.1) — penyusun yang SAMA dengan
// salinan Drive. `lembar` = lembar yang aktif saat dibuka (menu tempat tombolnya ditekan). Izin = LIHAT.
export const runtime = 'nodejs';
const Q = z.object({ tahun: z.coerce.number().int().min(2020).max(2100), lembar: z.enum(LEMBAR_BUKU).default('Ringkasan') });

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const ditolak = await tolakKecualiLihat(g.session, 'rencana'); if (ditolak) return ditolak;
  const sp = new URL(req.url).searchParams;
  const p = Q.safeParse({ tahun: sp.get('tahun') ?? undefined, lembar: sp.get('lembar') ?? undefined });
  if (!p.success) return NextResponse.json({ ok: false, message: 'Parameter tidak valid' }, { status: 400 });
  const limited = await bbaRateLimit(g.session.userId, 'unduh', 30); if (limited) return limited;
  const { buffer, nama } = await bukuRencanaBuffer(p.data.tahun, p.data.lembar);
  await writeAuditLog({ req, eventType: 'BBA_UNDUH', userId: g.session.userId, username: g.session.username, detail: `BBA unduh ${nama}` });
  return new NextResponse(new Uint8Array(buffer), { headers: {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="BBA-${p.data.tahun}-Rencana-sd-Pengadaan.xlsx"; filename*=UTF-8''${encodeURIComponent(nama)}`,
  } });
}
