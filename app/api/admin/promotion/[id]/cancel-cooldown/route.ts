// POST /api/admin/promotion/[id]/cancel-cooldown
// SA cancel saat req berstatus COOLDOWN — anti-phishing/social-engineering window.
// COOLDOWN → CANCELLED. Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sql, safeInt } from '@/lib/data/db';
import {
  PromotionCancelCooldownBodySchema,
  promotionRateLimit,
} from '@/lib/data/promotion-schemas';
import { getRequestById, cancelCooldownBySa } from '@/lib/data/promotion';
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
    const limited = await promotionRateLimit(session.userId, 'cancel-cooldown', 10);
    if (limited) return limited;

    const { id: idStr } = await ctx.params;
    const id = safeInt(idStr, 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const raw = await req.json().catch(() => ({}));
    const parsed = PromotionCancelCooldownBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'Body tidak valid.' },
        { status: 400 },
      );
    }
    const reason = parsed.data.reason ?? '';

    const reqRow = await getRequestById(id);
    if (!reqRow) {
      return NextResponse.json({ ok: false, message: 'Permohonan tidak ditemukan.' }, { status: 404 });
    }
    if (reqRow.status !== 'COOLDOWN') {
      return NextResponse.json(
        { ok: false, message: `Permohonan tidak dalam cooldown (status=${reqRow.status}).` },
        { status: 409 },
      );
    }
    const ok = await cancelCooldownBySa(id, session.userId, reason);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: 'Race condition — status berubah.' },
        { status: 409 },
      );
    }
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_CANCELLED',
      userId: session.userId,
      username: session.username,
      detail: `Cancel-cooldown reqId=${id} reason="${reason.slice(0, 200)}"`,
    });

    const userRows = await sql`SELECT username FROM users WHERE id = ${reqRow.user_id} LIMIT 1` as Array<{ username: string }>;
    if (userRows[0]?.username) {
      void addPromotionNotif(
        userRows[0].username,
        'PROMOTION_CANCELLED',
        `Permohonan upgrade dibatalkan SA saat cooldown.${reason ? ` Alasan: ${reason}` : ''}`,
      );
    }
    return NextResponse.json({ ok: true, message: 'Cooldown dibatalkan.' });
  } catch (err) {
    console.error('[Promotion CancelCooldown Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
