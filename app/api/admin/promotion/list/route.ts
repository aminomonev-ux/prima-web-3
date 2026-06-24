// GET /api/admin/promotion/list
// SUPER_ADMIN list req untuk review panel. Filter optional status + paging.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9D.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { PromotionListQuerySchema, promotionRateLimit } from '@/lib/data/promotion-schemas';
import { listPromotionRequests } from '@/lib/data/promotion';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN.' }, { status: 403 });
    }
    const limited = await promotionRateLimit(session.userId, 'list', 60);
    if (limited) return limited;

    const { searchParams: p } = req.nextUrl;
    const parsed = PromotionListQuerySchema.safeParse({
      status: p.get('status') ?? undefined,
      limit:  p.get('limit')  ?? undefined,
      offset: p.get('offset') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'Query tidak valid.' },
        { status: 400 },
      );
    }
    const rows = await listPromotionRequests(parsed.data);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[Promotion List Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
