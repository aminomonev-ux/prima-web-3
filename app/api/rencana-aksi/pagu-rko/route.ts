// GET /api/rencana-aksi/pagu-rko?tahun= — "Terpakai di RKO" per sub kegiatan untuk Data Entry Renaksi
// (docs/CONCEPT-renaksi-pagu-rko.md Tahap B). Hanya angka agregat per sub kegiatan × sumber dana, tanpa
// rincian rekening. Hanya membaca.
import { NextRequest, NextResponse } from 'next/server';
import { TahunSchema, rencanaAksiRateLimit } from '@/lib/data/rencana-aksi-schemas';
import { bandingPaguTahun } from '@/lib/data/pagu-renaksi-rko';
import { sql } from '@/lib/data/db';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await rencanaAksiRateLimit(g.session.userId, 'pagu-rko', 60);
  if (limited) return limited;
  const parsed = TahunSchema.safeParse(new URL(req.url).searchParams.get('tahun'));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Tahun tidak valid' }, { status: 400 });
  try {
    const h = await bandingPaguTahun(sql, parsed.data);
    return NextResponse.json({ ok: true, sub: h.sub });
  } catch (e) {
    console.error('[RA PAGU RKO GET]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
