// ═══ PRIMA — IKI (Indikator Kinerja Individu) API Schemas ═══════════════════
// Centralized Zod schemas + role allow-list untuk endpoint app/api/iki/*.
// Pattern mirror Rencana Aksi + PK. Konsep: docs/CONCEPT-iki.md

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

// ─── Role allow-list ─────────────────────────────────────────────────────────

/**
 * Default: Admin Staff + Super Admin (keputusan user 2026-07-14).
 * Role lain di-toggle via Admin Panel (`users.app_access` include 'iki').
 */
export const IKI_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;

export function isIkiRole(role: string, appAccess: string[] | null): boolean {
  if ((IKI_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes('iki');
}

export async function ikiRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`iki-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json({
      ok: false,
      error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.`,
      resetIn: rl.resetIn,
    }, { status: 429 });
  }
  return null;
}

// ─── Primitive schemas ───────────────────────────────────────────────────────

export const TahunSchema = z.string().regex(/^\d{4}$/, 'Tahun 4 digit').refine(
  (t) => Number(t) >= 2020 && Number(t) <= 2100,
  'Tahun harus 2020-2100',
);

export const VarianSchema = z.enum(['STANDAR', 'DIREKTUR']);
export type IkiVarian = z.infer<typeof VarianSchema>;

export const AspekBSchema = z.enum(['Akumulatif', 'Progres Positif', 'Progres Negatif', 'Pengulangan']);
export const AspekCSchema = z.enum(['Utama', 'Penunjang']);

const TargetStr = z.string().trim().max(50);

// ─── Nested: triwulan + RHK ──────────────────────────────────────────────────

export const TriwulanSchema = z.object({
  triwulan: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  target_tw: TargetStr.default('0'),
  uraian: z.string().trim().max(2000).nullable().optional(),
  target_aksi: TargetStr.default('0'),
});

export const RhkSchema = z.object({
  no_urut: z.number().int().min(1).max(99),
  rhk_intervensi: z.string().trim().max(500).nullable().optional(),
  rhk: z.string().trim().min(1, 'Rencana Hasil Kerja wajib').max(500),
  aspek_a: z.string().trim().min(1).max(50).default('Kuantitatif'),
  aspek_b: AspekBSchema.default('Akumulatif'),
  aspek_c: AspekCSchema.default('Utama'),
  indikator: z.string().trim().min(1, 'Indikator wajib').max(500),
  target_tahunan: TargetStr.default(''),
  formulasi: z.string().trim().max(2000).nullable().optional(),
  ekspektasi: z.string().trim().max(2000).nullable().optional(),
  renaksi_id: z.number().int().positive().nullable().optional(),
  atasan_rhk_id: z.number().int().positive().nullable().optional(),
  triwulan: z.array(TriwulanSchema).length(4, 'Wajib 4 baris triwulan'),
});

// ─── Create dokumen ──────────────────────────────────────────────────────────

export const CreateDokumenSchema = z.object({
  tahun: TahunSchema,
  varian: VarianSchema.default('STANDAR'),
  nama: z.string().trim().min(1, 'Nama wajib').max(255),
  nip: z.string().trim().min(1, 'NIP wajib').max(50),
  jabatan: z.string().trim().min(1, 'Jabatan wajib').max(255),
  pangkat: z.string().trim().max(100).nullable().optional(),
});

// ─── Save dokumen (header + seluruh RHK, replace-all) ────────────────────────

export const SaveDokumenSchema = z.object({
  expected_version: z.number().int().min(0),
  varian: VarianSchema,
  opd: z.string().trim().min(1).max(255),
  nama: z.string().trim().min(1, 'Nama wajib').max(255),
  nip: z.string().trim().min(1, 'NIP wajib').max(50),
  jabatan: z.string().trim().min(1, 'Jabatan wajib').max(255),
  pangkat: z.string().trim().max(100).nullable().optional(),
  ikhtisar: z.string().trim().max(4000).nullable().optional(),
  nama_atasan: z.string().trim().max(255).nullable().optional(),
  nip_atasan: z.string().trim().max(50).nullable().optional(),
  jabatan_atasan: z.string().trim().max(255).nullable().optional(),
  pangkat_atasan: z.string().trim().max(100).nullable().optional(),
  kota_ttd: z.string().trim().min(1).max(100).default('Semarang'),
  tanggal_ttd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').nullable().optional(),
  atasan_dokumen_id: z.number().int().positive().nullable().optional(),
  rhk: z.array(RhkSchema).max(50, 'Maksimal 50 baris RHK'),
}).superRefine((v, ctx) => {
  if (v.varian === 'DIREKTUR') {
    // Varian DIREKTUR: tanpa atasan, tanpa RHK-diintervensi, tanpa Ekspektasi
    if (v.atasan_dokumen_id) {
      ctx.addIssue({ code: 'custom', path: ['atasan_dokumen_id'], message: 'Varian DIREKTUR tidak punya dokumen atasan' });
    }
    v.rhk.forEach((r, i) => {
      if (r.rhk_intervensi?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['rhk', i, 'rhk_intervensi'], message: 'Varian DIREKTUR tidak memakai RHK yang diintervensi' });
      }
    });
  } else {
    if (!v.nama_atasan?.trim() || !v.jabatan_atasan?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['nama_atasan'], message: 'Nama & jabatan atasan wajib untuk varian STANDAR' });
    }
    v.rhk.forEach((r, i) => {
      if (!r.rhk_intervensi?.trim()) {
        ctx.addIssue({ code: 'custom', path: ['rhk', i, 'rhk_intervensi'], message: 'RHK yang diintervensi wajib untuk varian STANDAR' });
      }
    });
  }
});

export type SaveDokumenInput = z.infer<typeof SaveDokumenSchema>;
export type RhkInput = z.infer<typeof RhkSchema>;

// ─── Query / param schemas ───────────────────────────────────────────────────

export const ListQuerySchema = z.object({
  tahun: TahunSchema.optional(),
});

export const IdSchema = z.coerce.number().int().positive();

export const FinalizeSchema = z.object({
  expected_version: z.number().int().min(0),
});

export const DuplicateSchema = z.object({
  tahun_target: TahunSchema,
});

export const ImportRenaksiQuerySchema = z.object({
  tahun: z.coerce.number().int().min(2020).max(2100),
});

export const ImportAtasanQuerySchema = z.object({
  dokumen_id: z.coerce.number().int().positive(),
});

// Override pemetaan kolom import Excel (field → nomor kolom Excel 1-based)
export const IMPORT_COL_FIELDS = [
  'no', 'rhk_intervensi', 'rhk', 'aspek', 'indikator', 'target_tahunan',
  'formulasi', 'romawi', 'target_tw', 'uraian', 'target_aksi',
] as const;
export const ImportExcelOverridesSchema = z.record(
  z.enum(IMPORT_COL_FIELDS),
  z.coerce.number().int().min(1).max(30),
);
