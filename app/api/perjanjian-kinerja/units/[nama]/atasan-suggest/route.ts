// app/api/perjanjian-kinerja/units/[nama]/atasan-suggest/route.ts
// Auto-suggest atasan untuk Pihak Kedua (Q3 user — override-able).
// GET /api/perjanjian-kinerja/units/Kasubbag%20Akuntansi/atasan-suggest
//   → { ok: true, atasan: 'Kabag Keuangan' | null }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { isPkRole, pkRateLimit } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { getAtasanDefault } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nama: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'atasan-suggest', 60);
  if (limited) return limited;

  const { nama } = await params;
  const decoded = decodeURIComponent(nama).trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, message: 'Nama unit kosong' }, { status: 400 });
  }

  const atasan = await getAtasanDefault(decoded);
  return NextResponse.json({ ok: true, atasan });
}
