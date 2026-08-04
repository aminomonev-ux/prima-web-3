// app/api/perjanjian-kinerja/blud-nominal/route.ts
// Auto-fill nominal Anggaran BLUD dari rekap_pk (Q1).
// Strategy detail: lib/data/pk.ts:getBludNominalByUnit().
//
// GET /api/perjanjian-kinerja/blud-nominal?unit=Kasubbag%20Akuntansi
//   → { ok: true, nominal: 1271998, versi_dpa: '2026-05-23', matched_labels: ['Kasubbag Akuntansi'] }

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { pkRateLimit, BludNominalQuerySchema } from '@/lib/data/pk-schemas';
import { bolehLihatSalahSatu, forbidden } from '../_guard';
import { getBludNominalByUnit } from '@/lib/data/pk';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  // Angka BLUD untuk lampiran anggaran Form PK. Sengaja TIDAK ikut memeriksa izin menu
  // BLUD: menambah syarat itu terdengar lebih ketat, tapi ia mengubah SIAPA yang bisa
  // menyusun PK — keputusan proses kerja, bukan keputusan teknis. Dicatat di
  // docs/CONCEPT-pk-peran.md §6 supaya tidak terbaca sebagai kelalaian.
  if (!(await bolehLihatSalahSatu(session.userId, session.role, ['form', 'riwayat']))) return forbidden();

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
