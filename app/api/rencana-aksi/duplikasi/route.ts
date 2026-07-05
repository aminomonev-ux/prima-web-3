import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { DuplikasiTahunSchema, rencanaAksiRateLimit } from '@/lib/data/rencana-aksi-schemas';
import { duplicateYear, RaTahunTujuanBerisiError } from '@/lib/data/rencana-aksi';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

// POST /api/rencana-aksi/duplikasi — salin struktur + target 1 tahun penuh ke
// tahun kosong (realisasi 0 / bulan_realisasi NULL). Khusus ADMIN/SUPER_ADMIN.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  if (g.session.role !== 'ADMIN' && g.session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'Duplikasi tahun khusus Admin' }, { status: 403 });
  }
  const limited = await rencanaAksiRateLimit(g.session.userId, 'duplikasi', 5);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = DuplikasiTahunSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { dari_tahun, ke_tahun } = parsed.data;

  try {
    const { inserted } = await duplicateYear(dari_tahun, ke_tahun, g.session.userId);
    if (inserted === 0) {
      return NextResponse.json({ ok: false, error: `Tahun ${dari_tahun} tidak punya data untuk disalin` }, { status: 400 });
    }
    await writeAuditLog({
      req, eventType: 'RA_DUPLIKASI_TAHUN',
      userId: g.session.userId, username: g.session.username,
      detail: `Duplikasi Rencana Aksi ${dari_tahun} → ${ke_tahun}: ${inserted} indikator (realisasi kosong)`,
    });
    return NextResponse.json({ ok: true, inserted });
  } catch (e) {
    if (e instanceof RaTahunTujuanBerisiError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    console.error('[RA DUPLIKASI]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
