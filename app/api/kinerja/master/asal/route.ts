// POST /api/kinerja/master/asal — "Jadikan manual" / "Tandai dari Renaksi" dari dialog
// Perbarui dari Rencana Aksi (docs/CONCEPT-renaksi-terhubung.md §5.5). Hak = hak mengubah
// Master. Hanya label asal; nama, induk, dan salinannya tidak disentuh.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { ubahAsalMaster } from '@/lib/data/kinerja-master-ubah';
import { writeAuditLog } from '@/lib/security/auditlog';
import { isKinerjaRole, kinerjaRateLimit, MasterAsalBodySchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'asal-master', 20); if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = MasterAsalBodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'Data tidak valid: ' + parsed.error.issues[0].message }, { status: 400 });
  const { tahun, ids, asal } = parsed.data;

  const diubah = await ubahAsalMaster(tahun, ids, asal);
  if (diubah > 0) {
    await writeAuditLog({
      req,
      eventType: 'KINERJA_MASTER_SELARAS_RENAKSI',
      userId:    session.userId,
      username:  session.username,
      detail:    `${asal === 'RENAKSI' ? 'Tandai dari Rencana Aksi' : 'Jadikan manual'} tahun ${tahun}: ${diubah} entri Master (id ${ids.slice(0, 50).join(', ')}${ids.length > 50 ? ', …' : ''})`,
    });
  }
  return NextResponse.json({ ok: true, diubah });
}
