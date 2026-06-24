// ═══ PRIMA — PK API Schemas (Perjanjian Kinerja) ════════════════════════════
// Centralized Zod schemas + role allow-list + rate-limit helper untuk
// endpoint app/api/perjanjian-kinerja/*.
//
// Pattern mirror: kinerja-schemas.ts (L34 + L43 + L36 compliance).
// Reference: docs/session/PK_REFACTOR_CONCEPT.md §4

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

// ─── Rate Limit ─────────────────────────────────────────────────────────────

/**
 * SDL-M14 mirror: rate-limit helper untuk endpoint PK. Key: `pk-<action>:<userId>`.
 * Default 30/menit untuk save, 60/menit untuk read aggregate.
 *
 * Pakai sebagai early-return:
 *   const limited = await pkRateLimit(session.userId, 'save-sasaran', 30)
 *   if (limited) return limited
 */
export async function pkRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`pk-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

// ─── Role allow-list ────────────────────────────────────────────────────────

/**
 * Role yang boleh akses modul PK (read + write).
 * RENBANG (BIDANG_ROLES) + PROGRAM (SUBBIDANG_ROLES) eksis di lib/constants.ts.
 * Verified Sprint 0 — RENBANG/PROGRAM = fungsional owner modul Perjanjian Kinerja.
 */
export const PK_ALLOWED_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG',
  'RENBANG', 'PROGRAM',
] as const;

/**
 * Role yang boleh mutating (create/update/delete dokumen PK).
 * Subset PK_ALLOWED_ROLES — exclude ADMIN_KABAG (read-only review).
 */
export const PK_EDIT_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG',
  'RENBANG', 'PROGRAM',
] as const;

export const PK_APP_KEY = 'perjanjian_kinerja';

/**
 * Cek role + app_access (pola isAsetRole/isLkjipRole). Role di luar allow-list
 * bisa di-grant via users.app_access include 'perjanjian_kinerja' (Admin Panel).
 */
export function isPkRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((PK_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(PK_APP_KEY);
}
export function isPkEditRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((PK_EDIT_ROLES as readonly string[]).includes(role)) return true;
  // ADMIN_KABAG tetap read-only review (decision Sprint 0) meski di-grant app_access
  if ((PK_ALLOWED_ROLES as readonly string[]).includes(role)) return false;
  return Array.isArray(appAccess) && appAccess.includes(PK_APP_KEY);
}

// ─── Primitive schemas ──────────────────────────────────────────────────────

/**
 * Tahun anggaran — string 4 digit, range 2020-2100. Sama dengan kinerja-schemas.
 */
export const TahunSchema = z
  .string()
  .regex(/^\d{4}$/, 'Tahun harus 4 digit')
  .refine((v) => {
    const n = Number(v);
    return n >= 2020 && n <= 2100;
  }, 'Tahun harus di antara 2020-2100');

export const LevelEnum    = z.enum(['program','kegiatan','subkegiatan']);
export const JenisPkEnum  = z.enum(['MURNI','PERUBAHAN']);
export const StatusPkEnum = z.enum(['DRAFT','FINAL']);

// ─── Body schemas ───────────────────────────────────────────────────────────

/**
 * POST /api/perjanjian-kinerja/sasaran — save batch Master Sasaran.
 * Max 200 rows per batch (Master Sasaran typically <100 per tahun).
 */
export const SasaranBodySchema = z.object({
  tahun: TahunSchema,
  rows: z.array(z.object({
    program:                z.string().trim().min(1, 'Program wajib').max(255),
    indikator_program:      z.string().trim().max(500).optional().nullable(),
    target_program:         z.string().trim().max(255).optional().nullable(),
    kegiatan:               z.string().trim().max(255).optional().nullable(),
    indikator_kegiatan:     z.string().trim().max(500).optional().nullable(),
    target_kegiatan:        z.string().trim().max(255).optional().nullable(),
    subkegiatan:            z.string().trim().max(255).optional().nullable(),
    indikator_subkegiatan:  z.string().trim().max(500).optional().nullable(),
    target_subkegiatan:     z.string().trim().max(255).optional().nullable(),
  })).min(1, 'Minimal 1 baris').max(200, 'Maks 200 baris per batch'),
});

/**
 * POST /api/perjanjian-kinerja/program — save batch Master Program.
 */
export const ProgramBodySchema = z.object({
  tahun: TahunSchema,
  rows: z.array(z.object({
    program:     z.string().trim().min(1, 'Program wajib').max(255),
    kegiatan:    z.string().trim().max(255).optional().nullable(),
    subkegiatan: z.string().trim().max(255).optional().nullable(),
    level:       LevelEnum,
  })).min(0).max(500, 'Maks 500 baris per batch'),
});

/**
 * POST /api/perjanjian-kinerja/pejabat — save batch Pejabat.
 */
export const PejabatBodySchema = z.object({
  tahun: TahunSchema,
  rows: z.array(z.object({
    unit_kerja: z.string().trim().min(1, 'Unit kerja wajib').max(255),
    nama:       z.string().trim().min(1, 'Nama wajib').max(255),
    jabatan:    z.string().trim().min(1, 'Jabatan wajib').max(255),
    pangkat:    z.string().trim().max(100).optional().nullable(),
    nip:        z.string().trim().max(50).optional().nullable(),
  })).min(0).max(100),
});

/**
 * POST /api/perjanjian-kinerja/dokumen — create dokumen PK.
 * Multi-step: header + lampiran[] + anggaran[] di-create dalam 1 transaction.
 */
export const DokumenCreateBodySchema = z.object({
  tahun:            TahunSchema,
  tanggal_dokumen:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus YYYY-MM-DD'),
  jenis_pk:         JenisPkEnum,
  // Pihak Pertama (bawahan)
  unit_pertama:     z.string().trim().min(1).max(255),
  nama_pertama:     z.string().trim().min(1).max(255),
  jabatan_pertama:  z.string().trim().min(1).max(255),
  pangkat_pertama:  z.string().trim().max(100).optional().nullable(),
  nip_pertama:      z.string().trim().max(50).optional().nullable(),
  // Pihak Kedua (atasan)
  unit_kedua:       z.string().trim().min(1).max(255),
  nama_kedua:       z.string().trim().min(1).max(255),
  jabatan_kedua:    z.string().trim().min(1).max(255),
  pangkat_kedua:    z.string().trim().max(100).optional().nullable(),
  nip_kedua:        z.string().trim().max(50).optional().nullable(),
  // Lampiran (sasaran)
  lampiran: z.array(z.object({
    unit_kerja:  z.string().trim().min(1).max(255),
    level:       LevelEnum,
    program:     z.string().trim().max(255).optional().nullable(),
    kegiatan:    z.string().trim().max(255).optional().nullable(),
    subkegiatan: z.string().trim().max(255).optional().nullable(),
    uraian:      z.string().trim().min(1).max(255),
    indikator:   z.string().trim().max(500).optional().nullable(),
    target:      z.string().trim().max(255).optional().nullable(),
    urutan:      z.number().int().nonnegative().default(0),
  })).max(100, 'Maks 100 lampiran per dokumen'),
  // Anggaran
  anggaran: z.array(z.object({
    unit_kerja:            z.string().trim().min(1).max(255),
    level:                 LevelEnum,
    program:               z.string().trim().max(255).optional().nullable(),
    kegiatan:              z.string().trim().max(255).optional().nullable(),
    subkegiatan:           z.string().trim().max(255).optional().nullable(),
    uraian:                z.string().trim().min(1).max(255),
    keterangan_sumber:     z.string().trim().min(1).max(50),
    nominal:               z.number().nonnegative().max(1e15).default(0),
    urutan:                z.number().int().nonnegative().default(0),
    auto_filled_from_blud: z.boolean().default(false),
  })).max(200, 'Maks 200 anggaran per dokumen'),
});

/**
 * PATCH update — sama struktur dengan create, dipakai untuk replace pattern
 * (withTransaction DELETE lampiran/anggaran + bulkInsert baru — L7 BUG-C2).
 */
export const DokumenUpdateBodySchema = DokumenCreateBodySchema;

// ─── Query schemas ──────────────────────────────────────────────────────────

export const PkQuerySchema = z.object({
  tahun:      TahunSchema.optional(),
  as_pertama: z.enum(['true','false']).optional(),
  status:     StatusPkEnum.optional(),
  jenis_pk:   JenisPkEnum.optional(),
});

export const BludNominalQuerySchema = z.object({
  unit: z.string().trim().min(1, 'Unit kerja wajib').max(255),
});

/**
 * POST /api/perjanjian-kinerja/units — save Master Unit Kerja (admin only).
 *
 * Strategy: upsert pattern, tidak hard-delete (FK pejabat ON DELETE RESTRICT).
 *   - Row punya `id` → UPDATE existing (subset field: atasan/selectable/urutan/active)
 *   - Row tanpa `id` → INSERT new
 *   - "Hapus" via toggle `active=false` di UI
 * BludMapping: full replace per save (DELETE all + bulk INSERT).
 */
export const UnitKerjaBodySchema = z.object({
  units: z.array(z.object({
    id:                    z.number().int().positive().optional(),
    nama_unit:             z.string().trim().min(1, 'Nama unit wajib').max(255),
    level:                 LevelEnum,
    atasan_default:        z.string().trim().max(255).optional().nullable(),
    selectable_as_pertama: z.boolean(),
    urutan:                z.number().int().nonnegative().max(99999),
    active:                z.boolean(),
  })).min(1, 'Minimal 1 unit').max(100, 'Maks 100 unit per batch'),
  bludMapping: z.array(z.object({
    unit_pk:       z.string().trim().min(1).max(255),
    blud_pj_label: z.string().trim().min(1).max(255),
  })).max(500, 'Maks 500 mapping per batch').optional().default([]),
});

export type UnitKerjaBody = z.infer<typeof UnitKerjaBodySchema>;

// ─── Type exports ───────────────────────────────────────────────────────────

export type SasaranBody         = z.infer<typeof SasaranBodySchema>;
export type ProgramBody         = z.infer<typeof ProgramBodySchema>;
export type PejabatBody         = z.infer<typeof PejabatBodySchema>;
export type DokumenCreateBody   = z.infer<typeof DokumenCreateBodySchema>;
export type DokumenUpdateBody   = z.infer<typeof DokumenUpdateBodySchema>;
export type PkQuery             = z.infer<typeof PkQuerySchema>;
export type BludNominalQuery    = z.infer<typeof BludNominalQuerySchema>;
