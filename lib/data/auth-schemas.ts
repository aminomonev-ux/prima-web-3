// ═══ PRIMA — Auth API Schemas (SDL-Audit v1.1 Phase 1) ════════════════════
// Centralized Zod schemas untuk endpoint app/api/auth/*.
// Fixes: SDL-M11 (reset-password Zod + complexity), SDL-M10 (resend-verification Zod).

import { z } from 'zod';

// ─── Primitive ──────────────────────────────────────────────────────────────

/**
 * Password kuat: min 8, harus ada huruf besar + kecil + angka.
 * Konsisten dengan `/api/admin/users` PATCH reset-password (line 125).
 * Sebelumnya `/api/auth/reset-password` hanya cek length ≥ 8 — inkonsisten.
 */
export const StrongPasswordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter')
  .regex(/[A-Z]/, 'Password harus mengandung huruf besar')
  .regex(/[a-z]/, 'Password harus mengandung huruf kecil')
  .regex(/[0-9]/, 'Password harus mengandung angka');

/**
 * Token dari email link — 64 char hex (crypto.randomBytes(32).toString('hex')).
 * Max 256 untuk tolerance, min 32 untuk reject input pendek/kosong.
 */
export const EmailTokenSchema = z
  .string()
  .trim()
  .min(32, 'Token tidak valid')
  .max(256, 'Token terlalu panjang');

/**
 * Username atau email — string trimmed, min 3, max 200.
 */
export const UsernameOrEmailSchema = z
  .string()
  .trim()
  .min(3, 'Masukkan username atau email')
  .max(200, 'Input terlalu panjang');

// ─── Body Schemas per Endpoint ──────────────────────────────────────────────

/**
 * POST /api/auth/reset-password — consume token + set password baru.
 */
export const ResetPasswordBodySchema = z.object({
  token:       EmailTokenSchema,
  newPassword: StrongPasswordSchema,
});

/**
 * POST /api/auth/forgot-password & /api/auth/resend-verification — minta link.
 */
export const UsernameOrEmailBodySchema = z.object({
  usernameOrEmail: UsernameOrEmailSchema,
});

export type ResetPasswordBody       = z.infer<typeof ResetPasswordBodySchema>;
export type UsernameOrEmailBody     = z.infer<typeof UsernameOrEmailBodySchema>;
