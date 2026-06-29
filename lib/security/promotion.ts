// ═══ PRIMA — Promotion Security Helpers (Role Promotion Ladder) ═════════════
// 5-layer security: L1 re-auth, L2 secret, L3 turnstile (di handler), L4 lock,
// L5 dual-control (di lib/data/promotion.ts). Plus bootstrap detection + quota.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md §3-§4

import { timingSafeEqual } from 'crypto';
import { sql, sqlInt, toMysqlDatetime, type TxSql } from '@/lib/data/db';
import { verifyPassword } from '@/lib/security/auth';
import {
  ADMIN_QUOTA,
  ROLE_QUOTA,
  SUPER_ADMIN_QUOTA,
  PROMOTION_LOCK_HOURS,
  PROMOTION_MAX_ATTEMPTS,
  BIDANG_ROLES,
} from '@/lib/constants';

// ─── L2 Secret env validation (fail-fast, mirror JWT_SECRET pattern) ────────

const _rawPromotionSecret = process.env.PROMOTION_SECRET ?? '';
if (!_rawPromotionSecret || _rawPromotionSecret.length < 8) {
  throw new Error(
    '[FATAL] PROMOTION_SECRET env var is required (min 8 chars). ' +
    'Set memorable 12-16 char value, contoh "Prima-XXXX-2026". ' +
    'Lihat docs/session/ROLE_PROMOTION_CONCEPT.md §3.',
  );
}
const PROMOTION_SECRET_BUFFER = Buffer.from(_rawPromotionSecret, 'utf8');

// P-SEC-1: validate PROMOTION_OWNER_EMAILS at module load. Concept doc treats
// as required — bootstrap alert + L5 review queue depend on it. Mirror L1
// JWT_SECRET fail-fast pattern.
const _rawOwnerEmails = process.env.PROMOTION_OWNER_EMAILS ?? '';
const _parsedOwnerEmails = _rawOwnerEmails
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
const _dedupedOwnerEmails = Array.from(new Set(_parsedOwnerEmails)).slice(0, 3);
if (_dedupedOwnerEmails.length === 0) {
  throw new Error(
    '[FATAL] PROMOTION_OWNER_EMAILS env var is required (min 1 valid email, max 3 comma-separated). ' +
    'Contoh: "owner@example.com". Dipakai untuk alert bootstrap + emergency. ' +
    'Lihat docs/session/ROLE_PROMOTION_CONCEPT.md §6.',
  );
}

/**
 * L2 — Timing-safe compare secret code dari user input dengan env.
 * Beda panjang langsung false (timingSafeEqual throw kalau length mismatch).
 */
export function verifyPromotionSecret(input: string): boolean {
  const inputBuf = Buffer.from(input, 'utf8');
  if (inputBuf.length !== PROMOTION_SECRET_BUFFER.length) return false;
  try {
    return timingSafeEqual(inputBuf, PROMOTION_SECRET_BUFFER);
  } catch {
    return false;
  }
}

// ─── L1 Password re-auth ─────────────────────────────────────────────────────

/**
 * L1 — Verify password user untuk re-auth saat submit promotion.
 * Return false kalau user tidak ada atau password salah.
 */
export async function verifyPromotionPassword(userId: number, plain: string): Promise<boolean> {
  const rows = await sql`
    SELECT password_hash FROM users WHERE id = ${sqlInt(userId)} AND status = 'AKTIF'
    LIMIT 1
  ` as Array<{ password_hash: string }>;
  if (rows.length === 0) return false;
  return verifyPassword(plain, rows[0].password_hash);
}

// ─── L4 Lock + attempt counter ──────────────────────────────────────────────

export type PromotionLockStatus =
  | { locked: false }
  | { locked: true; until: Date };

/**
 * Cek apakah user lagi locked dari submit promotion. Otomatis clear lock
 * yang sudah expired (lazy).
 */
export async function checkPromotionLock(userId: number): Promise<PromotionLockStatus> {
  const rows = await sql`
    SELECT promotion_locked_until FROM users WHERE id = ${sqlInt(userId)} LIMIT 1
  ` as Array<{ promotion_locked_until: Date | null }>;
  const until = rows[0]?.promotion_locked_until ?? null;
  if (!until) return { locked: false };
  if (until.getTime() <= Date.now()) {
    await sql`
      UPDATE users
      SET promotion_locked_until = NULL,
          promotion_failed_count = 0,
          promotion_failed_at    = NULL
      WHERE id = ${sqlInt(userId)}
    `;
    return { locked: false };
  }
  return { locked: true, until };
}

/**
 * Increment counter L1/L2 fail. Kalau hit max → set lock 24h.
 * Return status setelah increment.
 */
export async function incrementPromotionFailCount(userId: number): Promise<{
  count: number;
  nowLocked: boolean;
  lockedUntil: Date | null;
}> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + PROMOTION_LOCK_HOURS * 60 * 60 * 1000);
  await sql`
    UPDATE users
    SET promotion_failed_count = promotion_failed_count + 1,
        promotion_failed_at    = ${toMysqlDatetime(now)},
        promotion_locked_until = CASE
          WHEN promotion_failed_count + 1 >= ${sqlInt(PROMOTION_MAX_ATTEMPTS)}
          THEN ${toMysqlDatetime(lockUntil)}
          ELSE promotion_locked_until
        END
    WHERE id = ${sqlInt(userId)}
  `;
  const rows = await sql`
    SELECT promotion_failed_count, promotion_locked_until
    FROM users WHERE id = ${sqlInt(userId)} LIMIT 1
  ` as Array<{ promotion_failed_count: number; promotion_locked_until: Date | null }>;
  const count = rows[0]?.promotion_failed_count ?? 0;
  const lockedUntil = rows[0]?.promotion_locked_until ?? null;
  return {
    count,
    nowLocked: lockedUntil !== null && lockedUntil.getTime() > Date.now(),
    lockedUntil,
  };
}

/** Reset counter saat success — dipanggil setelah submit valid. */
export async function clearPromotionFailCount(userId: number): Promise<void> {
  await sql`
    UPDATE users
    SET promotion_failed_count = 0,
        promotion_failed_at    = NULL
    WHERE id = ${sqlInt(userId)}
  `;
}

/** SA reset lock manual via Admin Panel. */
export async function clearPromotionLock(userId: number): Promise<void> {
  await sql`
    UPDATE users
    SET promotion_locked_until = NULL,
        promotion_failed_count = 0,
        promotion_failed_at    = NULL
    WHERE id = ${sqlInt(userId)}
  `;
}

// ─── Quota enforcement ──────────────────────────────────────────────────────

/** Quota max akun per role (lihat lib/constants.ts). */
export function getRoleQuota(role: string): number | null {
  if (role === 'SUPER_ADMIN') return SUPER_ADMIN_QUOTA;
  if (role === 'ADMIN')       return ADMIN_QUOTA;
  if ((BIDANG_ROLES as readonly string[]).includes(role)) return ROLE_QUOTA;
  return null;
}

/** Count user aktif di role (real-time, bukan counter terpisah). */
export async function getActiveRoleCount(role: string): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*) AS n FROM users WHERE role = ${role} AND status = 'AKTIF'
  ` as Array<{ n: number | string }>;
  return Number(rows[0]?.n ?? 0);
}

/** Error kuota — caller bisa narrow `instanceof` untuk map ke HTTP 409. */
export class QuotaFullError extends Error {
  constructor(public readonly role: string, public readonly count: number, public readonly quota: number) {
    super(`Quota role ${role} sudah penuh (${count}/${quota}).`);
    this.name = 'QuotaFullError';
  }
}

/** Throw kalau target role sudah penuh (untuk dipakai sebelum approve). */
export async function assertQuotaAvailable(role: string): Promise<void> {
  const quota = getRoleQuota(role);
  if (quota === null) return;
  const count = await getActiveRoleCount(role);
  if (count >= quota) throw new QuotaFullError(role, count, quota);
}

/**
 * Versi transaksional (V3-4 / L-1): COUNT ... FOR UPDATE di dalam withTransaction
 * supaya create-user & ubah-role tidak race melewati cap. Lock baris AKTIF role
 * target (+ gap lock RR) menyerialisasi dua admin yang menulis role sama barengan.
 * WAJIB dipanggil dengan `tx` dari withTransaction, dan INSERT/UPDATE-nya di tx yang sama.
 */
export async function assertQuotaAvailableTx(role: string, tx: TxSql): Promise<void> {
  const quota = getRoleQuota(role);
  if (quota === null) return;
  const rows = await tx`
    SELECT COUNT(*) AS n FROM users WHERE role = ${role} AND status = 'AKTIF' FOR UPDATE
  ` as Array<{ n: number | string }>;
  const count = Number(rows[0]?.n ?? 0);
  if (count >= quota) throw new QuotaFullError(role, count, quota);
}

/** Snapshot semua quota — untuk GET /api/admin/role-quota-stats. */
export async function getRoleQuotaStats(): Promise<Array<{
  role: string;
  count: number;
  quota: number;
  full: boolean;
}>> {
  const tracked: string[] = ['SUPER_ADMIN', 'ADMIN', ...BIDANG_ROLES];
  // Single GROUP BY query — semua role AKTIF di tracked list (filter di JS).
  const rows = await sql`
    SELECT role, COUNT(*) AS n
    FROM users
    WHERE status = 'AKTIF'
    GROUP BY role
  ` as Array<{ role: string; n: number | string }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.role] = Number(r.n);
  return tracked.map((role) => {
    const quota = getRoleQuota(role) ?? 0;
    const count = counts[role] ?? 0;
    return { role, count, quota, full: count >= quota };
  });
}

// ─── Bootstrap detection (chain ADMIN → SUPER_ADMIN khusus) ─────────────────

/**
 * Bootstrap aktif kalau:
 *   (a) tidak ada satu pun SUPER_ADMIN AKTIF di users, DAN
 *   (b) flag system_settings.bootstrap_super_admin_used_at masih NULL
 * Detail: docs/session/ROLE_PROMOTION_CONCEPT.md §4.
 */
export async function isBootstrapMode(): Promise<boolean> {
  const saCount = await getActiveRoleCount('SUPER_ADMIN');
  if (saCount > 0) return false;
  const rows = await sql`
    SELECT val FROM system_settings
    WHERE \`key\` = 'bootstrap_super_admin_used_at' LIMIT 1
  ` as Array<{ val: string | null }>;
  if (rows.length === 0) return true; // row belum exist → treat bootstrap available
  return rows[0].val === null;
}

/**
 * Atomic claim bootstrap (L52 race protection). Set flag dari NULL → NOW().
 * Return false kalau race lost (val sudah di-set requester lain).
 * Caller WAJIB cek return value sebelum lanjut auto-approve.
 */
export async function claimBootstrap(): Promise<boolean> {
  const now = toMysqlDatetime(new Date());
  // Ensure row exists (idempotent — match migration 037 INSERT IGNORE).
  await sql`
    INSERT IGNORE INTO system_settings (\`key\`, \`val\`)
    VALUES ('bootstrap_super_admin_used_at', NULL)
  `;
  // Atomic claim — affectedRows=1 berarti race menang.
  // NB: sql wrapper (lib/data/db.ts:59) return UPDATE sebagai array [{insertId, affectedRows}],
  // BUKAN object. Akses lewat r[0].
  const r = await sql`
    UPDATE system_settings
    SET \`val\` = ${now}
    WHERE \`key\` = 'bootstrap_super_admin_used_at' AND \`val\` IS NULL
  ` as unknown as Array<{ affectedRows: number }>;
  return (r[0]?.affectedRows ?? 0) > 0;
}

/** @deprecated Pakai claimBootstrap() — atomic. */
export async function markBootstrapUsed(): Promise<void> {
  await claimBootstrap();
}

// ─── Owner emails (PROMOTION_OWNER_EMAILS env) ──────────────────────────────

/**
 * Return parsed owner emails (max 3, deduped). Module load throws kalau env
 * kosong — di sini safe untuk return langsung tanpa cek lagi.
 */
export function getOwnerEmails(): string[] {
  return [..._dedupedOwnerEmails];
}

/** Email semua SA AKTIF — untuk notifikasi L5 review queue. */
export async function getActiveSuperAdminEmails(): Promise<string[]> {
  const rows = await sql`
    SELECT email FROM users
    WHERE role = 'SUPER_ADMIN' AND status = 'AKTIF' AND email IS NOT NULL
  ` as Array<{ email: string }>;
  return rows.map((r) => r.email).filter(Boolean);
}

/** Username semua SA AKTIF — untuk in-app notif recipient. */
export async function getActiveSuperAdminUsernames(): Promise<string[]> {
  const rows = await sql`
    SELECT username FROM users
    WHERE role = 'SUPER_ADMIN' AND status = 'AKTIF' AND username IS NOT NULL
  ` as Array<{ username: string }>;
  return rows.map((r) => r.username).filter(Boolean);
}
