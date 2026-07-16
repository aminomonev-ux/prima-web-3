// app/api/iki/[id]/versi/route.ts — GET riwayat versi (metadata-only)
import { NextRequest, NextResponse } from 'next/server';
import { safeInt } from '@/lib/data/db';
import { ikiRateLimit } from '@/lib/data/iki-schemas';
import { listVersi } from '@/lib/data/iki';
import { guard } from '../../_guard';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if (!g.ok) return g.res;
  const limited = await ikiRateLimit(g.session.userId, 'versi-list', 30);
  if (limited) return limited;

  const id = safeInt((await params).id, 0);
  if (id <= 0) return NextResponse.json({ ok: false, message: 'ID tidak valid' }, { status: 400 });

  try {
    const rows = await listVersi(id);
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error('[IKI Versi List Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
