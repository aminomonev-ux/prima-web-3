// POST /api/admin/promotion/[id]/reject
// SA reject req PENDING dengan alasan minimal 10 char.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §9D.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sql, safeInt } from '@/lib/data/db';
import {
  PromotionRejectBodySchema,
  promotionRateLimit,
} from '@/lib/data/promotion-schemas';
import { getRequestById, rejectRequest } from '@/lib/data/promotion';
import { sendPromotionRejectedEmail } from '@/lib/services/email';
import { addPromotionNotif } from '@/lib/services/notifications';

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
    const limited = await promotionRateLimit(session.userId, 'reject', 10);
    if (limited) return limited;

    const { id: idStr } = await ctx.params;
    const id = safeInt(idStr, 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const raw = await req.json().catch(() => null);
    const parsed = PromotionRejectBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'Alasan tidak valid.' },
        { status: 400 },
      );
    }
    const { reason } = parsed.data;

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

    const ok = await rejectRequest(id, session.userId, reason);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: 'Race condition — permohonan sudah berubah status.' },
        { status: 409 },
      );
    }
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_REJECTED',
      userId: session.userId,
      username: session.username,
      detail: `Rejected reqId=${id} reason="${reason.slice(0, 200)}"`,
    });

    const userRows = await sql`
      SELECT username, email, nama_lengkap FROM users WHERE id = ${reqRow.user_id} LIMIT 1
    ` as Array<{ username: string; email: string | null; nama_lengkap: string | null }>;
    const u = userRows[0];
    if (u) {
      void addPromotionNotif(
        u.username,
        'PROMOTION_REJECTED',
        `Permohonan upgrade ${reqRow.from_role} → ${reqRow.to_role} ditolak. Alasan: ${reason}`,
      );
      if (u.email) {
        void sendPromotionRejectedEmail(u.email, {
          requesterName: u.nama_lengkap ?? u.username,
          fromRole: reqRow.from_role,
          toRole: reqRow.to_role,
          reason,
        });
      }
    }
    return NextResponse.json({ ok: true, message: 'Permohonan ditolak.' });
  } catch (err) {
    console.error('[Promotion Reject Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
