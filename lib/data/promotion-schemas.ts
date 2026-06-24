// ═══ PRIMA — Promotion API Schemas (Role Promotion Ladder) ══════════════════
// Centralized Zod schemas + role helpers + rate-limit untuk endpoint promotion.
// Konsep: docs/session/ROLE_PROMOTION_CONCEPT.md
// Pattern mirror: lib/data/pk-schemas.ts (L36 + L34 compliance).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { PROMOTION_CHAINS } from '@/lib/constants';

// ─── Rate Limit ─────────────────────────────────────────────────────────────

/**
 * Rate-limit helper untuk endpoint promotion. Key: `promotion-<action>:<userId>`.
 *
 * Default budget:
 *   - submit      : 5  / menit (L4 lock terpisah hitung attempt salah saja)
 *   - approve     : 10 / menit
 *   - reject      : 10 / menit
 *   - cancel      : 10 / menit
 *   - list (SA)   : 60 / menit (polling tab Promotion Requests)
 *
 * Pakai sebagai early-return:
 *   const limited = await promotionRateLimit(session.userId, 'submit', 5);
 *   if (limited) return limited;
 */
export async function promotionRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`promotion-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

// ─── Role helpers ───────────────────────────────────────────────────────────

/** Source role yang bisa initiate promotion (key dari PROMOTION_CHAINS). */
export const PROMOTION_SOURCE_ROLES = Object.keys(PROMOTION_CHAINS) as readonly string[];

/** Semua target role yang valid sebagai tujuan promotion (union semua chain). */
export const PROMOTION_TARGET_ROLES = Array.from(
  new Set(Object.values(PROMOTION_CHAINS).flat()),
) as readonly string[];

/** Source role bisa upgrade kah? */
export function isPromotableRole(role: string): boolean {
  return PROMOTION_SOURCE_ROLES.includes(role);
}

/** Chain valid? — cek `from → to` ada di PROMOTION_CHAINS. */
export function isValidPromotionChain(from: string, to: string): boolean {
  const chain = (PROMOTION_CHAINS as Record<string, readonly string[]>)[from];
  return !!chain && chain.includes(to);
}

/** Eligible targets untuk role tertentu (untuk dropdown UI). */
export function getEligibleTargets(role: string): readonly string[] {
  return (PROMOTION_CHAINS as Record<string, readonly string[]>)[role] ?? [];
}

// ─── Primitive schemas ──────────────────────────────────────────────────────

const ToRoleSchema = z.string().refine(
  (v) => PROMOTION_TARGET_ROLES.includes(v),
  { message: 'Target role tidak valid' },
);

// L1 password: server-side bcrypt compare; tidak pernah disimpan plain.
const PasswordSchema = z.string().min(1, 'Password wajib').max(200);

// L2 secret: 8-64 char (memorable format, lihat ROLE_PROMOTION_CONCEPT.md §3).
const SecretSchema = z.string().min(1, 'Secret code wajib').max(200);

// Turnstile token dari Cloudflare widget.
const TurnstileTokenSchema = z.string().min(1, 'Captcha wajib').max(2048);

// Alasan upgrade: minimal 30 char (paksa user kasih konteks bermakna).
const ReasonSchema = z
  .string()
  .trim()
  .min(30, 'Alasan minimal 30 karakter')
  .max(1000, 'Alasan maksimal 1000 karakter');

// Alasan reject oleh SA: minimal 10 char.
const RejectReasonSchema = z
  .string()
  .trim()
  .min(10, 'Alasan reject minimal 10 karakter')
  .max(500);

// ─── Body schemas ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/promotion/submit — submit req (L1+L2+L3+L4 di-validate
 * di handler; Zod cuma cek shape).
 */
export const PromotionSubmitBodySchema = z.object({
  toRole:         ToRoleSchema,
  password:       PasswordSchema,
  secret:         SecretSchema,
  reason:         ReasonSchema,
  turnstileToken: TurnstileTokenSchema,
});

/**
 * POST /api/admin/promotion/[id]/reject — SA reject dengan alasan.
 */
export const PromotionRejectBodySchema = z.object({
  reason: RejectReasonSchema,
});

/**
 * POST /api/admin/promotion/[id]/cancel-cooldown — SA cancel during cooldown.
 * Body opsional alasan.
 */
export const PromotionCancelCooldownBodySchema = z.object({
  reason: z.string().trim().max(500).optional().default(''),
});

/**
 * GET /api/admin/promotion/list — filter status (optional).
 */
export const PromotionListQuerySchema = z.object({
  status: z.enum(['PENDING', 'COOLDOWN', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED'])
    .optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

// ─── Type exports ───────────────────────────────────────────────────────────

export type PromotionSubmitBody         = z.infer<typeof PromotionSubmitBodySchema>;
export type PromotionRejectBody         = z.infer<typeof PromotionRejectBodySchema>;
export type PromotionCancelCooldownBody = z.infer<typeof PromotionCancelCooldownBodySchema>;
export type PromotionListQuery          = z.infer<typeof PromotionListQuerySchema>;
