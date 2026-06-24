// POST /api/admin/promotion/[id]/approve
// SA approve req. Optimistic lock via WHERE status='PENDING' di approveRequest.
// PENDING → COOLDOWN (5 menit), cron promotion-complete yang finalize jadi role.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 (cooldown 5 menit) + §9D.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { safeInt } from '@/lib/data/db';
import { promotionRateLimit } from '@/lib/data/promotion-schemas';
import {
  getRequestById,
  approveRequest,
} from '@/lib/data/promotion';
import { assertQuotaAvailable } from '@/lib/security/promotion';
import { sendPromotionApprovedEmail } from '@/lib/services/email';
import { addPromotionNotif } from '@/lib/services/notifications';
import { sql } from '@/lib/data/db';
import { PROMOTION_COOLDOWN_MINUTES } from '@/lib/constants';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ ok: false, message: 'Hanya SUPER_ADMIN.' }, { status: 403 });
    }
    const limited = await promotionRateLimit(session.userId, 'approve', 10);
    if (limited) return limited;

    const { id: idStr } = await ctx.params;
    const id = safeInt(idStr, 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const reqRow = await getRequestById(id);
    if (!reqRow) {
      return NextResponse.json({ ok: false, message: 'Permohonan tidak ditemukan.' }, { status: 404 });
    }
    if (reqRow.status !== 'PENDING') {
      return NextResponse.json(
        { ok: false, message: `Permohonan sudah berstatus ${reqRow.status}.` },
        { status: 409 },
      );
    }

    // Re-check quota — bisa berubah sejak submit (SA lain mungkin baru approve).
    try {
      await assertQuotaAvailable(reqRow.to_role);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Quota role penuh.';
      return NextResponse.json({ ok: false, message: msg }, { status: 409 });
    }

    const ok = await approveRequest(id, session.userId);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: 'Permohonan sudah di-approve/reject oleh SA lain.' },
        { status: 409 },
      );
    }
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_APPROVED',
      userId: session.userId,
      username: session.username,
      detail: `Approved reqId=${id} target=${reqRow.to_role}`,
    });

    // Notify requester (in-app + email).
    const userRows = await sql`
      SELECT username, email, nama_lengkap FROM users WHERE id = ${reqRow.user_id} LIMIT 1
    ` as Array<{ username: string; email: string | null; nama_lengkap: string | null }>;
    const u = userRows[0];
    if (u) {
      void addPromotionNotif(
        u.username,
        'PROMOTION_APPROVED',
        `Permohonan upgrade ${reqRow.from_role} → ${reqRow.to_role} di-approve. Role aktif dalam ${PROMOTION_COOLDOWN_MINUTES} menit.`,
      );
      if (u.email) {
        void sendPromotionApprovedEmail(u.email, {
          requesterName: u.nama_lengkap ?? u.username,
          fromRole: reqRow.from_role,
          toRole: reqRow.to_role,
          cooldownMinutes: PROMOTION_COOLDOWN_MINUTES,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Permohonan di-approve. Cooldown ${PROMOTION_COOLDOWN_MINUTES} menit.`,
    });
  } catch (err) {
    console.error('[Promotion Approve Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
