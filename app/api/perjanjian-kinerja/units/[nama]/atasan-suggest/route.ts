// app/api/perjanjian-kinerja/units/[nama]/atasan-suggest/route.ts
// Auto-suggest atasan untuk Pihak Kedua (Q3 user — override-able).
// GET /api/perjanjian-kinerja/units/Kasubbag%20Akuntansi/atasan-suggest
//   → { ok: true, atasan: 'Kabag Keuangan' | null }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit } from '@/lib/data/pk-schemas';
import { bolehModulPk, forbidden } from '../../../_guard';
import { getAtasanDefault } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ nama: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // Satu nama atasan bawaan untuk sebuah unit — metadata isian Form PK, sekelas dengan
  // daftar unit di `units/route.ts`. Tidak diikat menu mana pun, alasan yang sama.
  if (!(await bolehModulPk(session.userId, session.role))) return forbidden();

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
