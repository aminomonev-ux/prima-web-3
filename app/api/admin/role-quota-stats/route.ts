// GET /api/admin/role-quota-stats
// Snapshot quota semua role tracked untuk dropdown role di User Management.
// Open ke session valid (info ringan, no PII). Dipakai utk counter "Renbang (1/3)" dst.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9H.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getRoleQuotaStats } from '@/lib/security/promotion';
import { promotionRateLimit } from '@/lib/data/promotion-schemas';

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
    const limited = await promotionRateLimit(session.userId, 'role-quota', 60);
    if (limited) return limited;
    const stats = await getRoleQuotaStats();
    return NextResponse.json({ ok: true, data: stats });
  } catch (err) {
    console.error('[Role Quota Stats Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
