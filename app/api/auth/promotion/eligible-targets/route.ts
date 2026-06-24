// GET /api/auth/promotion/eligible-targets
// Return target role yang user saat ini boleh apply upgrade ke-nya, plus
// active request kalau ada (untuk UI conditional render).
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §1+§9A.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { getEligibleTargets } from '@/lib/data/promotion-schemas';
import { getActiveRequestByUser } from '@/lib/data/promotion';
import { checkPromotionLock } from '@/lib/security/promotion';

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
    const targets = getEligibleTargets(session.role);
    const active = await getActiveRequestByUser(session.userId);
    const lock = await checkPromotionLock(session.userId);
    return NextResponse.json({
      ok: true,
      data: {
        currentRole: session.role,
        eligibleTargets: targets,
        activeRequest: active ? {
          id: active.id,
          toRole: active.to_role,
          status: active.status,
          createdAt: active.created_at,
          cooldownUntil: active.cooldown_until,
        } : null,
        lockedUntil: lock.locked ? lock.until : null,
      },
    });
  } catch (err) {
    console.error('[Promotion EligibleTargets Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
