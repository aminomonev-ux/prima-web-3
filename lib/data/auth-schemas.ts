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

// ─── Body Schemas per Endpoint ──────────────────────────────────────────────
//
// Q5 (2026-09-16) — DIBUANG dari sini: `EmailTokenSchema`, `UsernameOrEmailSchema`,
// `ResetPasswordBodySchema`, `UsernameOrEmailBodySchema`, beserta kedua tipenya.
// Keempatnya milik alur email (reset kata sandi, verifikasi, kirim ulang) yang sudah
// pensiun di edisi intranet — route-nya memulangkan 410 Gone tanpa membaca body sama
// sekali. Diperiksa: nol pemakai di seluruh `app`, `lib`, `components`, dan `scripts`.
//
// Bentuk kata sandinya TIDAK ikut dibuang: `StrongPasswordSchema` dipakai
// `ChangePasswordBodySchema` di bawah, dan itu pintu yang justru paling menentukan —
// di situlah kata sandi sementara dari Super Admin ditimpa.

/**
 * POST /api/auth/change-password — pemakai mengganti password sendiri.
 * Wajib `StrongPasswordSchema`: pintu inilah yang dipakai menimpa password sementara dari
 * Super Admin, jadi kalau cuma min(8) kebijakan akun baru bisa ditembus di langkah berikutnya.
 */
export const ChangePasswordBodySchema = z.object({
  passwordLama: z.string().min(1, 'Password lama wajib diisi'),
  passwordBaru: StrongPasswordSchema,
  konfirmasi:   z.string().min(1, 'Konfirmasi password wajib diisi'),
}).refine(d => d.passwordBaru === d.konfirmasi, {
  message: 'Konfirmasi password tidak cocok',
  path: ['konfirmasi'],
});

