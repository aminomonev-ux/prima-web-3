// POST /api/auth/promotion/cancel
// Requester batalkan req PENDING atau COOLDOWN miliknya sendiri.
// Ownership di WHERE (SEC-C4 IDOR). Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { promotionRateLimit } from '@/lib/data/promotion-schemas';
import { cancelRequestByRequester, getActiveRequestByUser } from '@/lib/data/promotion';
import { addPromotionNotif } from '@/lib/services/notifications';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
    const limited = await promotionRateLimit(session.userId, 'cancel', 10);
    if (limited) return limited;

    const active = await getActiveRequestByUser(session.userId);
    if (!active) {
      return NextResponse.json(
        { ok: false, message: 'Tidak ada permohonan aktif.' },
        { status: 404 },
      );
    }
    const ok = await cancelRequestByRequester(active.id, session.userId);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: 'Permohonan sudah berubah status (race condition).' },
        { status: 409 },
      );
    }
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_CANCELLED',
      userId: session.userId,
      username: session.username,
      detail: `Self-cancel reqId=${active.id}`,
    });
    void addPromotionNotif(
      session.username,
      'PROMOTION_CANCELLED',
      `Permohonan upgrade ${active.from_role} → ${active.to_role} dibatalkan.`,
    );
    return NextResponse.json({ ok: true, message: 'Permohonan dibatalkan.' });
  } catch (err) {
    console.error('[Promotion Cancel Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
