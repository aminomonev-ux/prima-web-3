// POST /api/admin/users/[id]/unlock-promotion
// SA reset lock + counter promotion user. Dipakai saat user tidak sengaja
// kena lock 24 jam karena salah ketik. Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 L4.

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/security/auth';
import { writeAuditLog } from '@/lib/security/auditlog';
import { sql, safeInt } from '@/lib/data/db';
import { clearPromotionLock } from '@/lib/security/promotion';
import { promotionRateLimit } from '@/lib/data/promotion-schemas';

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
    const limited = await promotionRateLimit(session.userId, 'unlock', 10);
    if (limited) return limited;

    const { id: idStr } = await ctx.params;
    const id = safeInt(idStr, 0);
    if (!id) return NextResponse.json({ ok: false, message: 'ID tidak valid.' }, { status: 400 });

    const rows = await sql`
      SELECT username, promotion_locked_until FROM users WHERE id = ${id} LIMIT 1
    ` as Array<{ username: string; promotion_locked_until: Date | null }>;
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: 'User tidak ditemukan.' }, { status: 404 });
    }
    await clearPromotionLock(id);
    await writeAuditLog({
      req,
      eventType: 'PROMOTION_LOCK_RESET',
      userId: session.userId,
      username: session.username,
      detail: `Unlock promotion user=${rows[0].username} (id=${id})`,
    });
    return NextResponse.json({
      ok: true,
      message: `Lock promotion user ${rows[0].username} di-reset.`,
    });
  } catch (err) {
    console.error('[Promotion Unlock Error]', err);
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan server.' }, { status: 500 });
  }
}
