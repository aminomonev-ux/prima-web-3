// ═══ PRIMA — Rencana Aksi API Schemas ═════════════════════════════════════
// Centralized Zod schemas + role allow-list untuk endpoint app/api/rencana-aksi/*.
// Pattern mirror BLUD (Tahap 11) + Kinerja (Tahap 12).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Role allow-list default. User lain di-toggle via admin panel
 * (`users.app_access` JSON include 'rencana_aksi').
 */
export const RENCANA_AKSI_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function isRencanaAksiRole(
  role: string,
  appAccess: string[] | null,
): boolean {
  if ((RENCANA_AKSI_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes('rencana_aksi');
}

export async function rencanaAksiRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`rencana-aksi-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json({
      ok: false,
      error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.`,
      resetIn: rl.resetIn,
    }, { status: 429 });
  }
  return null;
}

// ─── Primitive Schemas ──────────────────────────────────────────────────────

export const TahunSchema = z.coerce.number().int().min(2026).max(2045);

export const LevelSchema = z.enum(['tujuan', 'sasaran', 'program', 'kegiatan', 'sub-kegiatan']);
export type RaLevel = z.infer<typeof LevelSchema>;

export const JenisSchema = z.enum(['Akumulatif', 'Progres Positif', 'Progres Negatif', 'Pengulangan']);

// ─── Upsert body (Data Entry → Save) ───────────────────────────────────────

export const UpsertRencanaAksiSchema = z.object({
  id: z.number().int().positive().nullable().optional(),
  tahun: TahunSchema,
  level: LevelSchema,
  sasaran: z.string().trim().max(255).nullable().optional(),
  tujuan: z.string().trim().max(255).nullable().optional(),
  outcome_program:      z.string().trim().max(500).nullable().optional(),
  outcome_kegiatan:     z.string().trim().max(500).nullable().optional(),
  outcome_sub_kegiatan: z.string().trim().max(500).nullable().optional(),
  program: z.string().trim().min(1, 'Program/Sasaran wajib').max(255),
  kegiatan: z.string().trim().max(255).nullable().optional(),
  sub_kegiatan: z.string().trim().max(255).nullable().optional(),
  indikator: z.string().trim().min(1, 'Indikator wajib').max(500),
  jenis: JenisSchema.default('Akumulatif'),
  satuan: z.string().trim().min(1).max(50).default('Persen'),
  target_rpjmd: z.coerce.number().int().min(0).default(0),
  target_tahunan: z.coerce.number().int().min(0).default(0),
  q1_target: z.coerce.number().int().min(0).default(0),
  q2_target: z.coerce.number().int().min(0).default(0),
  q3_target: z.coerce.number().int().min(0).default(0),
  q4_target: z.coerce.number().int().min(0).default(0),
  // Info pagu — hanya relevan untuk level sub-kegiatan (null untuk level lain).
  anggaran_nominal: z.coerce.number().int().min(0).nullable().optional(),
  // Opsi A: 12 target bulanan (sub-kegiatan) → sumber derive q1-q4 target server-side.
  // null/absent untuk level non-sub-kegiatan & data legacy.
  bulan_target: z.array(z.coerce.number().int().min(0)).length(12).nullable().optional(),
}).superRefine((v, ctx) => {
  if (v.level === 'sasaran' && !v.tujuan?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['tujuan'], message: 'Tujuan wajib untuk level sasaran' });
  }
  if (v.level === 'program' && !v.sasaran?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['sasaran'], message: 'Sasaran wajib untuk level program' });
  }
  if ((v.level === 'kegiatan' || v.level === 'sub-kegiatan') && !v.kegiatan?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['kegiatan'], message: 'Kegiatan wajib untuk level kegiatan/sub-kegiatan' });
  }
  if (v.level === 'sub-kegiatan' && !v.sub_kegiatan?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['sub_kegiatan'], message: 'Sub Kegiatan wajib untuk level sub-kegiatan' });
  }
});

export type UpsertRencanaAksiInput = z.infer<typeof UpsertRencanaAksiSchema>;

// ─── Update quarter (Indikator Kinerja → modal TW) ─────────────────────────
// `expected_version` wajib untuk optimistic locking (lihat lib/data/rencana-aksi.ts).

export const UpdateQuarterSchema = z.object({
  id: z.number().int().positive(),
  quarter: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  target: z.coerce.number().int().min(0),
  realisasi: z.coerce.number().int().min(0),
  expected_version: z.coerce.number().int().min(0),
});

// ─── Update realisasi bulanan (Realisasi menu, sub-kegiatan) ───────────────
// 12 realisasi bulanan → server derive q1-q4 realisasi per jenis (Opsi A).

export const UpdateBulanRealisasiSchema = z.object({
  id: z.number().int().positive(),
  bulan_realisasi: z.array(z.coerce.number().int().min(0)).length(12),
  expected_version: z.coerce.number().int().min(0),
});

// ─── Update targets (RPJMD + Tahunan) ──────────────────────────────────────

export const UpdateTargetsSchema = z.object({
  id: z.number().int().positive(),
  target_rpjmd: z.coerce.number().int().min(0),
  target_tahunan: z.coerce.number().int().min(0),
  expected_version: z.coerce.number().int().min(0),
});

// ─── Update jenis only ─────────────────────────────────────────────────────

export const UpdateJenisSchema = z.object({
  id: z.number().int().positive(),
  jenis: JenisSchema,
  expected_version: z.coerce.number().int().min(0),
});

// ─── Reset realisasi (per indikator yang dipilih) ──────────────────────────

export const ResetRealisasiSchema = z.object({
  id: z.number().int().positive(),
  confirm_code: z.string().length(4),
  expected_code: z.string().length(4),
}).refine((v) => v.confirm_code === v.expected_code, {
  message: 'Kode konfirmasi salah',
  path: ['confirm_code'],
});

// ─── Query schemas ─────────────────────────────────────────────────────────

export const ListQuerySchema = z.object({
  tahun: TahunSchema,
  level: LevelSchema,
});

export const ExportQuerySchema = z.object({
  tahun: TahunSchema,
  level: LevelSchema,
  format: z.enum(['excel', 'pdf']),
  scope: z.enum(['list', 'indikator']),
  id: z.coerce.number().int().positive().optional(),
});
