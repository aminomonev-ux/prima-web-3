// ═══ PRIMA — Buku Besar Aset (BBA) — Zod + role + rate-limit ═══════
// Konsep: docs/session/buku-besar-aset/CONCEPT.md (v2).
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';

// K5: akses dasar SUPER_ADMIN + ADMIN (staf). Role lain via users.app_access
// include 'buku_besar_aset' (diatur Admin Panel → User Management). Pola Rencana Aksi.
export const ASET_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export const ASET_APP_KEY = 'buku_besar_aset';

export function isAsetRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((ASET_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(ASET_APP_KEY);
}

/** Rate-limit per user+action (pola kinerjaRateLimit). Return 429 NextResponse atau null. */
export async function bbaRateLimit(userId: number, action: string, maxPerMinute: number): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`bba-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu cepat. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

export const BBA_STATUSES = [
  'DIRENCANAKAN', 'REALISASI_PENUH', 'REALISASI_SEBAGIAN',
  'TIDAK_TEREALISASI',
] as const;
export type BbaStatus = typeof BBA_STATUSES[number];

const StatusSchema = z.enum(BBA_STATUSES);
const SumberSchema = z.enum(['BLUD', 'APBD', 'DAK', 'LAINNYA']);
const TahunSchema  = z.coerce.number().int().min(2020, 'Tahun 2020-2100').max(2100, 'Tahun 2020-2100');

// Matriks transisi status sah (server-validated). Terminal → array kosong.
export const BBA_STATUS_TRANSITIONS: Record<BbaStatus, BbaStatus[]> = {
  DIRENCANAKAN:       ['REALISASI_PENUH', 'REALISASI_SEBAGIAN', 'TIDAK_TEREALISASI'],
  REALISASI_SEBAGIAN: ['REALISASI_PENUH', 'TIDAK_TEREALISASI'],
  TIDAK_TEREALISASI:  ['REALISASI_SEBAGIAN', 'REALISASI_PENUH'],
  REALISASI_PENUH:    [],
};
export function isValidStatusTransition(from: BbaStatus, to: BbaStatus): boolean {
  if (from === to) return true; // idempotent: edit field lain tanpa ganti status
  return BBA_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

const OriginSchema    = z.enum(['MANUAL', 'USULAN']);
const KeputusanSchema = z.enum(['DISETUJUI', 'DITOLAK']);

export const BbaQuerySchema = z.object({
  tahun:     TahunSchema.optional(),
  status:    StatusSchema.optional(),
  sumber:    SumberSchema.optional(),
  kategori:  z.string().max(64).optional(),
  pj:        z.string().max(128).optional(),
  origin:    OriginSchema.optional(),
  keputusan: KeputusanSchema.optional(),
  q:         z.string().max(120).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(200).default(50),
});

export const BbaCreateSchema = z.object({
  tahun_anggaran:   TahunSchema,
  kode_rekening:    z.string().max(64).nullish(),
  uraian:           z.string().min(1, 'Uraian wajib').max(2000),
  kategori_aset:    z.string().max(64).nullish(),
  sumber_anggaran:  SumberSchema.default('BLUD'),
  vol:              z.number().min(0).default(0),
  satuan:           z.string().max(32).nullish(),
  harga:            z.number().min(0).default(0),
  penanggung_jawab: z.string().max(128).nullish(),
  keterangan:       z.string().max(4000).nullish(),
});

export const BbaUpdateSchema = z.object({
  id:               z.number().int().positive(),
  expected_version: z.number().int().min(0),
  kode_rekening:    z.string().max(64).nullish(),
  uraian:           z.string().min(1).max(2000).optional(),
  kategori_aset:    z.string().max(64).nullish(),
  sumber_anggaran:  SumberSchema.optional(),
  vol:              z.number().min(0).optional(),
  satuan:           z.string().max(32).nullish(),
  harga:            z.number().min(0).optional(),
  penanggung_jawab: z.string().max(128).nullish(),
  keterangan:       z.string().max(4000).nullish(),
  status:           StatusSchema.optional(),
});

export const BbaRealisasiSchema = z.object({
  id:               z.number().int().positive(),
  expected_version: z.number().int().min(0),
  nilai_realisasi:  z.number().min(0),
  vol_realisasi:    z.number().min(0, 'Unit realisasi minimal 0'), // batas atas (≤ vol) divalidasi server di setRealisasi
  tgl_realisasi:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').nullish(),
  status:           StatusSchema, // REALISASI_PENUH | REALISASI_SEBAGIAN | TIDAK_TEREALISASI
});

export const BbaDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// Import Belanja Modal dari Usulan Kebutuhan — khusus ADMIN/SUPER_ADMIN
// (akses lintas modul, lihat CONCEPT-import-usulan.md §8).
export const BBA_IMPORT_ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const;
export const BbaImportUsulanSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), tahun: TahunSchema }),
  z.object({ mode: z.literal('commit'),  tahun: TahunSchema }),
]);

// ─── Master Kategori Aset ───────────────────────────────────────────────────
export const KategoriCreateSchema = z.object({ nama: z.string().trim().min(1, 'Nama kategori wajib').max(128) });
export const KategoriDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

export type BbaCreateInput       = z.infer<typeof BbaCreateSchema>;
export type BbaUpdateInput       = z.infer<typeof BbaUpdateSchema>;
export type BbaRealisasiInput    = z.infer<typeof BbaRealisasiSchema>;
export type BbaQuery             = z.infer<typeof BbaQuerySchema>;
export type BbaImportUsulanInput = z.infer<typeof BbaImportUsulanSchema>;
