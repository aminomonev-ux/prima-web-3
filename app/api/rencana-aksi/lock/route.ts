import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import { TahunSchema, RaLockSchema, rencanaAksiRateLimit } from '@/lib/data/rencana-aksi-schemas';
import { getRaLock, setRaLock } from '@/lib/data/rencana-aksi';
import { guard } from '../_guard';

export const dynamic = 'force-dynamic';

// GET /api/rencana-aksi/lock?tahun= — status kunci periode (0 = terbuka).
export async function GET(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  const u = new URL(req.url);
  const parsed = TahunSchema.safeParse(u.searchParams.get('tahun'));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Tahun tidak valid' }, { status: 400 });
  }
  try {
    const bulan = await getRaLock(parsed.data);
    return NextResponse.json({ ok: true, tahun: parsed.data, bulan });
  } catch (e) {
    console.error('[RA LOCK GET]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

// POST /api/rencana-aksi/lock — set kunci periode (bulan 0 = buka semua).
// Khusus ADMIN/SUPER_ADMIN; kunci & buka sama-sama tercatat audit log.
export async function POST(req: NextRequest) {
  const g = await guard();
  if (!g.ok) return g.response;
  if (g.session.role !== 'ADMIN' && g.session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ ok: false, error: 'Kunci periode khusus Admin' }, { status: 403 });
  }
  const limited = await rencanaAksiRateLimit(g.session.userId, 'lock', 10);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = RaLockSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Data tidak valid: ' + parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { tahun, bulan } = parsed.data;

  try {
    const sebelum = await getRaLock(tahun);
    await setRaLock(tahun, bulan);
    await writeAuditLog({
      req, eventType: 'RA_KUNCI_PERIODE',
      userId: g.session.userId, username: g.session.username,
      detail: bulan === 0
        ? `Buka kunci periode Rencana Aksi ${tahun} (sebelumnya s.d. bulan ${sebelum})`
        : `Kunci periode Rencana Aksi ${tahun} s.d. bulan ${bulan} (sebelumnya ${sebelum})`,
    });
    return NextResponse.json({ ok: true, tahun, bulan });
  } catch (e) {
    console.error('[RA LOCK POST]', e);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}
