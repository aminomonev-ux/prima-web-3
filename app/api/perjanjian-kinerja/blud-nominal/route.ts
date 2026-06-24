// app/api/perjanjian-kinerja/blud-nominal/route.ts
// Auto-fill nominal Anggaran BLUD dari rekap_pk (Q1).
// Strategy detail: lib/data/pk.ts:getBludNominalByUnit().
//
// GET /api/perjanjian-kinerja/blud-nominal?unit=Kasubbag%20Akuntansi
//   → { ok: true, nominal: 1271998, versi_dpa: '2026-05-23', matched_labels: ['Kasubbag Akuntansi'] }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { isPkRole, pkRateLimit, BludNominalQuerySchema } from '@/lib/data/pk-schemas';
import { hasAppAccess } from '@/lib/security/guard';
import { getBludNominalByUnit } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  if (!(await hasAppAccess(session.userId, session.role, isPkRole))) return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 });

  const limited = await pkRateLimit(session.userId, 'blud-nominal', 30);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const q = BludNominalQuerySchema.safeParse({ unit: searchParams.get('unit') ?? undefined });
  if (!q.success) {
    return NextResponse.json({ ok: false, message: 'Parameter tidak valid: ' + q.error.issues[0].message }, { status: 400 });
  }

  const result = await getBludNominalByUnit(q.data.unit);
  return NextResponse.json({ ok: true, ...result });
}
