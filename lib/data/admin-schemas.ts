// ═══ PRIMA — Admin API Schemas (SDL-Audit v1.1 Phase 1) ════════════════════
// Centralized Zod schemas untuk endpoint app/api/admin/*.
// Fixes: SDL-M12 (admin/users PATCH body cast), SDL-L4 (app_access whitelist).

import { z } from 'zod';
import { StrongPasswordSchema } from './auth-schemas';
import { BIDANG_ROLES, SUBBIDANG_ROLES } from '@/lib/constants';

// ─── Role enum ──────────────────────────────────────────────────────────────

/**
 * Role yang boleh di-assign via `admin/users` PATCH action='ubah-role'.
 * Tidak include `SUPER_ADMIN` (reject di handler — tidak boleh di-promote).
 *
 * Derive dari taksonomi role asli di lib/constants.ts (single source of truth)
 * supaya nilai dropdown (ROLE_GROUPS_OPTIONS) selalu match enum. Sebelumnya enum
 * pakai skema penamaan lama (SUB_RENBANG_PROGRAM/BIDANG_RENBANG/…) yang tidak
 * pernah cocok dengan role aktual → ubah-role ke sub bidang selalu 400.
 */
// Admin tier minus SUPER_ADMIN di-hardcode agar elemen pertama definite
// (z.enum butuh tuple `[string, ...string[]]`; `.filter` mengubahnya jadi rest-only).
const ASSIGNABLE_ROLES: [string, ...string[]] = [
  'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG',
  ...BIDANG_ROLES,
  ...SUBBIDANG_ROLES,
];

export const AssignableRoleEnum = z.enum(ASSIGNABLE_ROLES);

/**
 * SDL-L4: whitelist app_access key. Match `APP_CARDS.id` di menu-client.tsx.
 * Sebelumnya `apps: string[]` di-`JSON.stringify` tanpa cek isi → DB pollution.
 */
export const AppAccessKeyEnum = z.enum([
  'dashboard', 'blud', 'rencana_aksi', 'perjanjian_kinerja',
  'usulan_aset', 'new_econtrolling', 'admin',
  'buku_besar_aset', 'lkjip',
]);

// ─── User ID ────────────────────────────────────────────────────────────────

const UserIdSchema = z.number().int().positive();

// ─── Discriminated union per action ─────────────────────────────────────────

/**
 * SDL-M12: discriminated union untuk `admin/users` PATCH body.
 * Setiap action punya validasi field strict — runtime parsing menggantikan
 * body cast `as { id, action, role?, password? }`.
 */
export const AdminUsersPatchBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('nonaktif'),
    id:     UserIdSchema,
  }),
  z.object({
    action: z.literal('aktifkan'),
    id:     UserIdSchema,
  }),
  z.object({
    action: z.literal('ubah-role'),
    id:     UserIdSchema,
    role:   AssignableRoleEnum,
  }),
  z.object({
    action:     z.literal('set-app-access'),
    id:         UserIdSchema,
    app_access: z.array(AppAccessKeyEnum).max(10).nullable(),
  }),
  z.object({
    action:   z.literal('reset-password'),
    id:       UserIdSchema,
    password: StrongPasswordSchema,
  }),
]);

export type AdminUsersPatchBody = z.infer<typeof AdminUsersPatchBodySchema>;

/**
 * INTRANET EDITION (D9 · docs/INTRANET-DELTA.md): body create-user via admin/users POST.
 * Registrasi publik dimatikan → Super Admin satu-satunya jalur pembuatan akun.
 * Role reuse AssignableRoleEnum (tanpa SUPER_ADMIN). Kuota di-enforce di handler.
 */
export const AdminUserCreateBodySchema = z.object({
  username:     z.string().min(3, 'Username minimal 3 karakter').max(50)
                 .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Username hanya huruf, angka, _ - .'),
  email:        z.string().email('Format email tidak valid'),
  password:     StrongPasswordSchema,
  role:         AssignableRoleEnum,
  nama_lengkap: z.string().max(100).optional(),
});

export type AdminUserCreateBody = z.infer<typeof AdminUserCreateBodySchema>;

// ─── Config schema ──────────────────────────────────────────────────────────

/**
 * SDL-M13: config GET selalu return semua key, tapi non-admin di-filter di handler.
 * Whitelist key di sini untuk POST.
 */
export const ConfigKeyEnum = z.enum([
  'batas_mulai', 'batas_selesai', 'batas_pesan', 'batas_aktif', 'pagu_blud',
]);

/**
 * Key yang aman dilihat oleh non-admin (deadline pengajuan, info publik dalam org).
 * `pagu_blud` SENGAJA tidak masuk — angka anggaran tidak untuk SUB_BIDANG biasa.
 */
export const PUBLIC_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'batas_mulai', 'batas_selesai', 'batas_pesan', 'batas_aktif',
]);
