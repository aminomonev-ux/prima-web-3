// POST /api/admin/users/[id]/revoke-probation
// SA revoke probationary role user. Rollback role ke probationary_from_role,
// clear flag, invalidate semua session aktif user. Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 probation.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { safeInt } from '@/lib/data/db';
import { revokeProbation } from '@/lib/data/promotion';
import { promotionRateLimit } from '@/lib/data/promotion-schemas';
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
    const limited = await promotionRateLimit(session.userId, 'revoke-probation', 10);
    if (limited) return limited;

    const { id: idStr } = await ctx.params;
    const id = safeInt(idStr, 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    if (id === session.userId) {
      return NextResponse.json(
        { ok: false, message: 'Tidak dapat revoke probation diri sendiri.' },
        { status: 403 },
      );
    }

    const result = await revokeProbation(id);
    if (!result) {
      return NextResponse.json(
        { ok: false, message: 'User tidak dalam masa probation, atau probation sudah expired.' },
        { status: 409 },
      );
    }
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_PROBATION_REVOKED',
      userId: session.userId,
      username: session.username,
      detail: `Revoke probation user=${result.username} (id=${id}) rolledBackTo=${result.rolledBackTo}`,
    });
    void addPromotionNotif(
      result.username,
      'PROMOTION_PROBATION_REVOKED',
      `Probationary role kamu di-revoke. Role dikembalikan ke <b>${result.rolledBackTo}</b>. Silakan login ulang.`,
    );
    return NextResponse.json({
      ok: true,
      message: `Probation user ${result.username} di-revoke. Role kembali ke ${result.rolledBackTo}.`,
    });
  } catch (err) {
    console.error('[Promotion RevokeProbation Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
