import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { TahunSchema, PaguPerubahanSchema, rencanaAksiRateLimit } from '@/lib/data/rencana-aksi-schemas';
import { ubahPaguPerubahan } from '@/lib/data/rencana-aksi';
import { RaPaguError, statusPaguPerubahan } from '@/lib/data/renaksi-pagu';
import { sql } from '@/lib/data/db';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

// GET /api/rencana-aksi/pagu-perubahan?tahun= — apakah tahun itu sudah berbabak Pagu Perubahan.
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const parsed = TahunSchema.safeParse(new URL(req.url).searchParams.get('tahun'));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Tahun tidak valid' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, tahun: parsed.data, ...(await statusPaguPerubahan(sql, parsed.data)) });
  } catch (e) {
    console.error('[RA PAGU PERUBAHAN GET]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST /api/rencana-aksi/pagu-perubahan — { tahun, aksi: 'mulai' | 'batal' }. Hak = hak menyimpan
// Rencana Aksi (pola Target Pendapatan Perubahan E-Anggaran); jejaknya audit.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await rencanaAksiRateLimit(g.session.userId, 'pagu-perubahan', 10);
  if (limited) return limited;

  const parsed = PaguPerubahanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  }
  const { tahun, aksi } = parsed.data;
  try {
    const hasil = await ubahPaguPerubahan(tahun, aksi, g.session.userId);
    if (hasil.berubah) {
      await writeAuditLog({
        req, eventType: 'RA_PAGU_PERUBAHAN',
        userId: g.session.userId, username: g.session.username,
        detail: aksi === 'mulai'
          ? `Mulai babak Pagu Perubahan Rencana Aksi ${tahun} — pagu Murni dibekukan`
          : `Batalkan babak Pagu Perubahan Rencana Aksi ${tahun}`,
      });
    }
    return NextResponse.json({ ok: true, tahun, aktif: hasil.aktif, dimulai_pada: hasil.dimulai_pada });
  } catch (e) {
    if (e instanceof RaPaguError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.kode }, { status: 409 });
    }
    console.error('[RA PAGU PERUBAHAN POST]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
