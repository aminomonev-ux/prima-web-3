// ═══ PRIMA — Promotion Data Layer (Role Promotion Ladder) ═══════════════════
// CRUD role_promotion_requests + lifecycle (submit, approve, reject, cancel,
// complete, expire, revoke probation). Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md
//
// Lifecycle: PENDING → COOLDOWN → COMPLETED (atau REJECTED / EXPIRED / CANCELLED).

import { sql, sqlInt, toMysqlDatetime, withTransaction } from '@/lib/data/db';
import {
  PROMOTION_COOLDOWN_MINUTES,
  PROMOTION_PROBATION_DAYS,
} from '@/lib/constants';

// ─── Types ──────────────────────────────────────────────────────────────────

export type PromotionStatus =
  | 'PENDING' | 'COOLDOWN' | 'COMPLETED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface PromotionRequest {
  id: number;
  user_id: number;
  from_role: string;
  to_role: string;
  reason: string;
  status: PromotionStatus;
  approved_by: number | null;
  approved_at: Date | null;
  cooldown_until: Date | null;
  completed_at: Date | null;
  rejected_reason: string | null;
  is_bootstrap: number; // TINYINT(1)
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

export interface PromotionRequestWithUser extends PromotionRequest {
  username: string;
  email: string | null;
  nama_lengkap: string | null;
  approver_username: string | null;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/** Active req (PENDING or COOLDOWN) untuk user — max 1 by design. */
export async function getActiveRequestByUser(userId: number): Promise<PromotionRequest | null> {
  const rows = await sql`
    SELECT * FROM role_promotion_requests
    WHERE user_id = ${sqlInt(userId)}
      AND status IN ('PENDING', 'COOLDOWN')
    ORDER BY created_at DESC LIMIT 1
  ` as PromotionRequest[];
  return rows[0] ?? null;
}

export async function getRequestById(id: number): Promise<PromotionRequest | null> {
  const rows = await sql`
    SELECT * FROM role_promotion_requests WHERE id = ${sqlInt(id)} LIMIT 1
  ` as PromotionRequest[];
  return rows[0] ?? null;
}

/** List untuk SA review panel. */
export async function listPromotionRequests(opts: {
  status?: PromotionStatus;
  limit: number;
  offset: number;
}): Promise<PromotionRequestWithUser[]> {
  const status = opts.status ?? null;
  const rows = await sql`
    SELECT
      r.*,
      u.username,
      u.email,
      u.nama_lengkap,
      a.username AS approver_username
    FROM role_promotion_requests r
    INNER JOIN users u ON u.id = r.user_id
    LEFT  JOIN users a ON a.id = r.approved_by
    WHERE (${status} IS NULL OR r.status = ${status})
    ORDER BY r.created_at DESC
    LIMIT ${sqlInt(opts.limit)} OFFSET ${sqlInt(opts.offset)}
  ` as PromotionRequestWithUser[];
  return rows;
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createPromotionRequest(params: {
  userId: number;
  fromRole: string;
  toRole: string;
  reason: string;
  isBootstrap: boolean;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<number> {
  const r = await sql`
    INSERT INTO role_promotion_requests
      (user_id, from_role, to_role, reason, status, is_bootstrap, ip_address, user_agent)
    VALUES (
      ${sqlInt(params.userId)},
      ${params.fromRole},
      ${params.toRole},
      ${params.reason},
      'PENDING',
      ${params.isBootstrap ? 1 : 0},
      ${params.ipAddress},
      ${params.userAgent}
    )
  ` as unknown as Array<{ insertId: number }>;
  return r[0]?.insertId ?? 0;
}

// ─── Approve (PENDING → COOLDOWN) — optimistic lock ─────────────────────────

/**
 * Approve req. Pakai `WHERE status='PENDING'` (optimistic lock) — kalau
 * affectedRows=0 = req sudah di-approve/reject/cancel oleh SA lain atau
 * status berubah lagi (race). Caller wajib cek return value.
 */
export async function approveRequest(id: number, approverId: number): Promise<boolean> {
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + PROMOTION_COOLDOWN_MINUTES * 60 * 1000);
  const r = await sql`
    UPDATE role_promotion_requests
    SET status         = 'COOLDOWN',
        approved_by    = ${sqlInt(approverId)},
        approved_at    = ${toMysqlDatetime(now)},
        cooldown_until = ${toMysqlDatetime(cooldownUntil)}
    WHERE id = ${sqlInt(id)} AND status = 'PENDING'
  ` as unknown as Array<{ affectedRows: number }>;
  return (r[0]?.affectedRows ?? 0) > 0;
}

// ─── Reject (PENDING → REJECTED) ────────────────────────────────────────────

export async function rejectRequest(
  id: number,
  approverId: number,
  reason: string,
): Promise<boolean> {
  const r = await sql`
    UPDATE role_promotion_requests
    SET status          = 'REJECTED',
        approved_by     = ${sqlInt(approverId)},
        approved_at     = ${toMysqlDatetime(new Date())},
        rejected_reason = ${reason}
    WHERE id = ${sqlInt(id)} AND status = 'PENDING'
  ` as unknown as Array<{ affectedRows: number }>;
  return (r[0]?.affectedRows ?? 0) > 0;
}

// ─── Cancel (PENDING → CANCELLED by requester self) ─────────────────────────

export async function cancelRequestByRequester(
  id: number,
  userId: number,
): Promise<boolean> {
  // Ownership di WHERE clause (SEC-C4 IDOR pattern).
  const r = await sql`
    UPDATE role_promotion_requests
    SET status = 'CANCELLED'
    WHERE id = ${sqlInt(id)}
      AND user_id = ${sqlInt(userId)}
      AND status IN ('PENDING', 'COOLDOWN')
  ` as unknown as Array<{ affectedRows: number }>;
  return (r[0]?.affectedRows ?? 0) > 0;
}

// ─── Cancel during cooldown (COOLDOWN → CANCELLED by SA) ────────────────────

export async function cancelCooldownBySa(
  id: number,
  approverId: number,
  reason: string,
): Promise<boolean> {
  const r = await sql`
    UPDATE role_promotion_requests
    SET status          = 'CANCELLED',
        approved_by     = ${sqlInt(approverId)},
        rejected_reason = ${reason ?? ''}
    WHERE id = ${sqlInt(id)} AND status = 'COOLDOWN'
  ` as unknown as Array<{ affectedRows: number }>;
  return (r[0]?.affectedRows ?? 0) > 0;
}

// ─── Complete (COOLDOWN → COMPLETED + role aktif) — atomic ──────────────────

/**
 * Dipanggil cron promotion-complete saat cooldown_until < NOW().
 * Atomic via withTransaction:
 *   1. UPDATE req status COOLDOWN→COMPLETED (lock baris dulu)
 *   2. UPDATE users: role = to_role, probationary_until = NOW()+7d,
 *      probationary_from_role = from_role
 *
 * Return null kalau req tidak found atau status sudah bukan COOLDOWN.
 */
export async function completeRequest(id: number): Promise<{
  userId: number;
  fromRole: string;
  toRole: string;
} | null> {
  return withTransaction(async ({ tx }) => {
    const rows = await tx`
      SELECT user_id, from_role, to_role
      FROM role_promotion_requests
      WHERE id = ${sqlInt(id)} AND status = 'COOLDOWN'
      FOR UPDATE
    ` as Array<{ user_id: number; from_role: string; to_role: string }>;
    if (rows.length === 0) return null;
    const { user_id, from_role, to_role } = rows[0];

    const now = new Date();
    const probationUntil = new Date(now.getTime() + PROMOTION_PROBATION_DAYS * 24 * 60 * 60 * 1000);

    await tx`
      UPDATE role_promotion_requests
      SET status       = 'COMPLETED',
          completed_at = ${toMysqlDatetime(now)}
      WHERE id = ${sqlInt(id)}
    `;
    await tx`
      UPDATE users
      SET role                   = ${to_role},
          probationary_until     = ${toMysqlDatetime(probationUntil)},
          probationary_from_role = ${from_role}
      WHERE id = ${sqlInt(user_id)}
    `;
    return { userId: user_id, fromRole: from_role, toRole: to_role };
  });
}

// ─── Expire (PENDING > 48h → EXPIRED) — cron ────────────────────────────────

/**
 * Return semua req yang baru saja expired (untuk kirim email batch).
 *
 * P-PERF-1 fix: SELECT + 1 batch UPDATE pakai filter WHERE identik (race-safe
 * karena created_at < X tidak akan match req yg baru di-submit). Replaces
 * N+1 loop UPDATE pattern.
 */
export async function expirePendingRequests(thresholdHours: number): Promise<PromotionRequestWithUser[]> {
  const expired = await sql`
    SELECT r.*, u.username, u.email, u.nama_lengkap, NULL AS approver_username
    FROM role_promotion_requests r
    INNER JOIN users u ON u.id = r.user_id
    WHERE r.status = 'PENDING'
      AND r.created_at < NOW() - INTERVAL ${sqlInt(thresholdHours)} HOUR
  ` as PromotionRequestWithUser[];
  if (expired.length === 0) return [];
  await sql`
    UPDATE role_promotion_requests
    SET status = 'EXPIRED'
    WHERE status = 'PENDING'
      AND created_at < NOW() - INTERVAL ${sqlInt(thresholdHours)} HOUR
  `;
  return expired;
}

// ─── Probation revoke (rollback role) ───────────────────────────────────────

/**
 * SA revoke probation user. Rollback role ke probationary_from_role,
 * clear flag. Atomic + invalidate session user supaya role baru effective.
 */
export async function revokeProbation(userId: number): Promise<{
  rolledBackTo: string;
  username: string;
} | null> {
  return withTransaction(async ({ tx }) => {
    const rows = await tx`
      SELECT username, probationary_from_role, probationary_until
      FROM users WHERE id = ${sqlInt(userId)} FOR UPDATE
    ` as Array<{
      username: string;
      probationary_from_role: string | null;
      probationary_until: Date | null;
    }>;
    if (rows.length === 0) return null;
    const { username, probationary_from_role, probationary_until } = rows[0];
    if (!probationary_until || !probationary_from_role) return null;
    if (probationary_until.getTime() <= Date.now()) return null; // sudah expired

    await tx`
      UPDATE users
      SET role                   = ${probationary_from_role},
          probationary_until     = NULL,
          probationary_from_role = NULL
      WHERE id = ${sqlInt(userId)}
    `;
    // Invalidate semua session aktif user (force re-login dengan role baru).
    await tx`
      UPDATE user_sessions
      SET invalidated_at = NOW()
      WHERE user_id = ${sqlInt(userId)} AND invalidated_at IS NULL
    `;
    return { rolledBackTo: probationary_from_role, username };
  });
}

/** Clear flag probation user yang sudah lewat 7 hari — cron. */
export async function clearExpiredProbations(): Promise<number> {
  const r = await sql`
    UPDATE users
    SET probationary_until     = NULL,
        probationary_from_role = NULL
    WHERE probationary_until IS NOT NULL
      AND probationary_until < NOW()
  ` as unknown as Array<{ affectedRows: number }>;
  return r[0]?.affectedRows ?? 0;
}
