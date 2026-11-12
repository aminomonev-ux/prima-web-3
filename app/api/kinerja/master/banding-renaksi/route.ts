// GET /api/kinerja/master/banding-renaksi?tahun= — Master E-Anggaran dibandingkan dengan
// Rencana Aksi tahun yang sama (docs/CONCEPT-renaksi-terhubung.md §5.3). Hanya membaca.
// Pagar sama dengan Init Renaksi, yang juga membaca Renaksi dengan hak E-Anggaran.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { bandingMasterRenaksi } from '@/lib/data/kinerja-master-ubah';
import { isKinerjaRole, kinerjaRateLimit, TahunSchema } from '@/lib/data/kinerja-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { kinerjaMati } from '../../_guard';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // T1: sakelar maintenance — 503 kalau modul dimatikan admin (SUPER_ADMIN tembus).
  const mati = await kinerjaMati(session.role); if (mati) return mati;
  if (!(await hasAppAccess(session.userId, session.role, isKinerjaRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });
  const limited = await kinerjaRateLimit(session.userId, 'banding-renaksi', 60); if (limited) return limited;

  const tahun = TahunSchema.safeParse(req.nextUrl.searchParams.get('tahun'));
  if (!tahun.success) return NextResponse.json({ ok: false, message: 'Tahun tidak valid' }, { status: 400 });

  const hasil = await bandingMasterRenaksi(tahun.data);
  return NextResponse.json({ ok: true, ...hasil });
}
