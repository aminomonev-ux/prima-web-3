// POST /api/cron/promotion-complete
// Cron job: proses req status COOLDOWN yang cooldown_until < NOW(),
// finalize jadi role aktif + set probationary_until 7 hari.
// Frekuensi: tiap 1 menit (MySQL EVENT / crontab — bukan Vercel).
// Auth: header Authorization: Bearer ${CRON_SECRET}.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3 (cooldown) + §11.

import { NextRequest, NextResponse } from 'next/server';
import { sql, sqlInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { completeRequest } from '@/lib/data/promotion';
import { addPromotionNotif } from '@/lib/services/notifications';
import { verifyCronSecret } from '@/lib/security/cron-auth';

export async function POST(req: NextRequest) {
  // V4K-1: cron secret guard constant-time.
  const auth = verifyCronSecret(req.headers.get('authorization'));
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const startedAt = Date.now();
  const result = { processed: 0, completed: 0, failed: 0, errors: [] as string[] };

  try {
    const rows = await sql`
      SELECT id FROM role_promotion_requests
      WHERE status = 'COOLDOWN' AND cooldown_until <= NOW()
      ORDER BY cooldown_until ASC
      LIMIT 100
    ` as Array<{ id: number }>;

    result.processed = rows.length;

    for (const row of rows) {
      try {
        const r = await completeRequest(row.id);
        if (r) {
          result.completed++;
          // Cari username untuk notif.
          const userRows = await sql`
            SELECT username FROM users WHERE id = ${sqlInt(r.userId)} LIMIT 1
          ` as Array<{ username: string }>;
          if (userRows[0]?.username) {
            void addPromotionNotif(
              userRows[0].username,
              'PROMOTION_COMPLETED',
              `Role kamu sekarang aktif sebagai <b>${r.toRole}</b>. Masa probation 7 hari berjalan.`,
            );
          }
        } else {
          // Race — sudah di-handle SA lain (cancel-cooldown).
          result.failed++;
        }
      } catch (e) {
        result.failed++;
        result.errors.push(`reqId=${row.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await writeAuditLog({
      req,
      eventType: 'PROMOTION_COMPLETED',
      detail: JSON.stringify({ ...result, duration_ms: Date.now() - startedAt }),
    });

    return NextResponse.json({
      ok: true,
      ...result,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[CronPromotionComplete Error]', err);
    return NextResponse.json(
      { ok: false, message: 'Gagal menjalankan promotion-complete.' },
      { status: 500 },
    );
  }
}
