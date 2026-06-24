// POST /api/cron/promotion-expire
// Cron job (2-in-1):
//   (a) Expire PENDING > PROMOTION_APPROVAL_TIMEOUT_HOURS (48 jam default).
//   (b) Clear probationary_until + probationary_from_role di users yg expired
//       (>7 hari sejak role aktif).
// Frekuensi: tiap 6 jam (MySQL EVENT / crontab — bukan Vercel).
// Auth: header Authorization: Bearer ${CRON_SECRET}.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §11.

import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/security/auditlog';
import {
  expirePendingRequests,
  clearExpiredProbations,
} from '@/lib/data/promotion';
import { addPromotionNotif } from '@/lib/services/notifications';
import { PROMOTION_APPROVAL_TIMEOUT_HOURS } from '@/lib/constants';
import { verifyCronSecret } from '@/lib/security/cron-auth';

export async function POST(req: NextRequest) {
  // V4K-1: cron secret guard constant-time.
  const auth = verifyCronSecret(req.headers.get('authorization'));
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const startedAt = Date.now();
  const result = {
    expired_requests: 0,
    cleared_probations: 0,
    errors: [] as string[],
  };

  try {
    const expired = await expirePendingRequests(PROMOTION_APPROVAL_TIMEOUT_HOURS);
    result.expired_requests = expired.length;

    // Notif tiap requester (best-effort).
    for (const r of expired) {
      try {
        if (r.username) {
          void addPromotionNotif(
            r.username,
            'PROMOTION_EXPIRED',
            `Permohonan upgrade ${r.from_role} → ${r.to_role} expired (lewat ${PROMOTION_APPROVAL_TIMEOUT_HOURS} jam tanpa review SA).`,
          );
        }
      } catch (e) {
        result.errors.push(`notif reqId=${r.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    result.cleared_probations = await clearExpiredProbations();

    await writeAuditLog({
      req,
      eventType: 'PROMOTION_EXPIRED',
      detail: JSON.stringify({ ...result, duration_ms: Date.now() - startedAt }),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[CronPromotionExpire Error]', err);
    return NextResponse.json(
      { ok: false, message: 'Gagal menjalankan promotion-expire.' },
      { status: 500 },
    );
  }
}
