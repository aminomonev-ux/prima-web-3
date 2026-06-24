// SDL-L5: Cron endpoint untuk retention purge — UU PDP Pasal 16 + ISO 27001 A.5.34.
// Dipanggil mingguan via MySQL EVENT / crontab on-prem (bukan Vercel).
// Auth: header `Authorization: Bearer <CRON_SECRET>` (env var).

import { NextRequest, NextResponse } from 'next/server';
import { withTransaction, sqlInt } from '@/lib/data/db';
import { writeAuditLog } from '@/lib/security/auditlog';
import { verifyCronSecret } from '@/lib/security/cron-auth';
import { SESSION_DURATION_HOURS } from '@/lib/constants';

export async function POST(req: NextRequest) {
  // V4K-1: cron secret guard constant-time.
  const auth = verifyCronSecret(req.headers.get('authorization'));
  if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });

  const startedAt = Date.now();
  const result = {
    audit_log_deleted: 0,
    user_sessions_ghost_invalidated: 0,
    user_sessions_deleted: 0,
    notifications_read_deleted: 0,
    notifications_unread_deleted: 0,
    users_anonymized: 0,
  };

  try {
    await withTransaction(async ({ tx }) => {
      // L53: sql/tx wrapper return non-SELECT result sebagai array [{affectedRows}],
      // bukan object. Cast hati-hati. Lihat docs/audit/AUDIT_LESSONS_LEARNED.md L53.

      // N-2: ghost-session invalidate dipindah ke sini dari GET /api/admin/sessions
      // (sebelumnya write-on-read tiap request). Row aktif yg JWT-nya sudah lewat
      // SESSION_DURATION_HOURS ditandai invalidated; deletion final oleh r2 (90 hari).
      const r0 = await tx`
        UPDATE user_sessions SET invalidated_at = NOW()
        WHERE invalidated_at IS NULL
          AND last_active < NOW() - INTERVAL ${sqlInt(SESSION_DURATION_HOURS)} HOUR
      ` as unknown as Array<{ affectedRows: number }>;
      result.user_sessions_ghost_invalidated = r0[0]?.affectedRows ?? 0;

      const r1 = await tx`DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL 12 MONTH` as unknown as Array<{ affectedRows: number }>;
      result.audit_log_deleted = r1[0]?.affectedRows ?? 0;

      const r2 = await tx`DELETE FROM user_sessions WHERE invalidated_at IS NOT NULL AND invalidated_at < NOW() - INTERVAL 90 DAY` as unknown as Array<{ affectedRows: number }>;
      result.user_sessions_deleted = r2[0]?.affectedRows ?? 0;

      const r3 = await tx`DELETE FROM notifications WHERE dibaca = TRUE AND created_at < NOW() - INTERVAL 6 MONTH` as unknown as Array<{ affectedRows: number }>;
      result.notifications_read_deleted = r3[0]?.affectedRows ?? 0;

      const r4 = await tx`DELETE FROM notifications WHERE dibaca = FALSE AND created_at < NOW() - INTERVAL 12 MONTH` as unknown as Array<{ affectedRows: number }>;
      result.notifications_unread_deleted = r4[0]?.affectedRows ?? 0;

      // Anonimisasi users NONAKTIF >5 tahun (preserve FK, hapus PII).
      const r5 = await tx`
        UPDATE users SET
          email = CONCAT('deleted-', id, '@anonymized.local'),
          nama_lengkap = NULL,
          reset_token = NULL,
          email_verify_token = NULL,
          deleted_at = NOW()
        WHERE status = 'NONAKTIF'
          AND deleted_at IS NULL
          AND updated_at < NOW() - INTERVAL 5 YEAR
      ` as unknown as Array<{ affectedRows: number }>;
      result.users_anonymized = r5[0]?.affectedRows ?? 0;
    });

    await writeAuditLog({
      req,
      eventType: 'CRON_PURGE_RETENTION',
      detail: JSON.stringify(result),
    });

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      ...result,
    });
  } catch (error) {
    console.error('[CronPurgeRetention Error]', error);
    return NextResponse.json({ ok: false, message: 'Gagal menjalankan purge retention.' }, { status: 500 });
  }
}
