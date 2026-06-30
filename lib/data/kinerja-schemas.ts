// ═══ PRIMA — Kinerja API Schemas (Audit Tahap 12) ═══════════════════════════
// Centralized Zod schemas + role allow-list untuk semua endpoint app/api/kinerja/*.
// Fixes: C-SEC-2 (no Zod validation), C-WORK-1/2 (no range/enum check),
//        C-OPT-2 (ALLOWED_ROLES duplicated di 7 file).

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import type { SumberSSK, MasterTipe } from './kinerja';

// ─── Rate Limit ─────────────────────────────────────────────────────────────

/**
 * SDL-M14: rate-limit helper untuk endpoint kinerja/*. Mirror pattern
 * `bludRateLimit` di lib/blud/schemas.ts. Key: `kinerja-<action>:<userId>`.
 *
 * Default 30/menit untuk save (PUT/POST), 60/menit untuk read aggregate.
 *
 * Pakai sebagai early-return:
 *   const limited = await kinerjaRateLimit(session.userId, 'save-ssk', 30)
 *   if (limited) return limited
 */
export async function kinerjaRateLimit(
  userId: number,
  action: string,
  maxPerMinute: number = 30,
): Promise<NextResponse | null> {
  const rl = await checkRateLimit(`kinerja-${action}:${userId}`, maxPerMinute, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, message: `Terlalu banyak permintaan. Coba lagi dalam ${rl.resetIn} detik.` },
      { status: 429, headers: { 'Retry-After': String(rl.resetIn) } },
    );
  }
  return null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Role allow-list untuk SEMUA endpoint kinerja (GET + PUT/POST/DELETE).
 *
 * Decision audit Tahap 12 (2026-05-17): GET dan PUT pakai allow-list yang SAMA
 * (7 roles). Konsisten: kalau boleh edit data (PUT), pasti boleh lihat (GET).
 *
 * NOTE: `master/[id]` DELETE pakai `DELETE_ONLY_ROLES` (SUPER_ADMIN+ADMIN)
 * — guard ekstra di endpoint tersebut, BUKAN gantikan ini.
 */
export const KINERJA_ALLOWED_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG',
  'RENBANG', 'PROGRAM', 'KEUANGAN',
] as const;
export const KINERJA_APP_KEY = 'new_econtrolling'; // = APP_CARDS.id kartu E-Anggaran/Kinerja

/**
 * Cek role + app_access (pola isAsetRole/isLkjipRole). Role di luar allow-list
 * bisa di-grant via users.app_access include 'new_econtrolling' (Admin Panel).
 * Pakai via `hasAppAccess(userId, role, isKinerjaRole)` atau `requireAccess(isKinerjaRole)`.
 */
export function isKinerjaRole(role: string, appAccess: string[] | null | undefined): boolean {
  if ((KINERJA_ALLOWED_ROLES as readonly string[]).includes(role)) return true;
  return Array.isArray(appAccess) && appAccess.includes(KINERJA_APP_KEY);
}

// ─── Primitive Schemas ──────────────────────────────────────────────────────

/**
 * Tahun anggaran — string of 4 digit numeric, range 2020-2100.
 * Sesuai konvensi DB (`tahun VARCHAR(4)`).
 */
export const TahunSchema = z
  .string()
  .regex(/^\d{4}$/, 'Tahun harus 4 digit')
  .refine((v) => {
    const n = Number(v);
    return n >= 2020 && n <= 2100;
  }, 'Tahun harus di antara 2020-2100');

/**
 * Bulan ke-N — integer 1-12.
 */
export const BulanSchema = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .pipe(z.number().int().gte(1).lte(12));

/**
 * Sumber SSK enum — typed dari kinerja.ts.
 */
export const SumberSchema: z.ZodType<SumberSSK> = z.enum([
  'GAJI', 'BLUD', 'HARLEP', 'PROMKES', 'SARPRAS', 'OBAT', 'PEMELIHARAAN', 'PEMBANGUNAN',
]);

/**
 * Refactor Versi (Checkpoint A) — definisi diawal supaya bisa dipakai oleh
 * SskBodySchema / KinerjaQuerySchema yang ada di bawah. JANGAN pindah ke bawah
 * — akan trigger ReferenceError "Cannot access before initialization".
 */
export const VersiTipeSchema = z.enum(['MURNI', 'PERUBAHAN']);
export const VersiSeqSchema  = z
  .union([z.string(), z.number()])
  .transform((v) => Number(v))
  .pipe(z.number().int().gte(0).lte(99));

/**
 * Master tipe enum — typed dari kinerja.ts.
 */
export const MasterTipeSchema: z.ZodType<MasterTipe> = z.enum([
  'program', 'kegiatan', 'subkegiatan', 'uraian_ssk', 'sumber_anggaran',
]);

// ─── Months Object ──────────────────────────────────────────────────────────

const MonthsSchema = z.object({
  jan: z.number(), feb: z.number(), mar: z.number(),
  apr: z.number(), mei: z.number(), jun: z.number(),
  jul: z.number(), agu: z.number(), sep: z.number(),
  okt: z.number(), nov: z.number(), des: z.number(),
});

// ─── Body Schemas per Endpoint ──────────────────────────────────────────────

/**
 * POST /api/kinerja/master — Tambah master row.
 */
export const MasterCreateBodySchema = z.object({
  tahun:           TahunSchema,
  tipe:            MasterTipeSchema,
  nama:            z.string().trim().min(1, 'Nama wajib diisi').max(500),
  sumber:          SumberSchema.nullable().optional(),
  program_ref:     z.string().nullable().optional(),
  kegiatan_ref:    z.string().nullable().optional(),
  subkegiatan_ref: z.string().nullable().optional(),
});

/**
 * PUT /api/kinerja/master/[id] — Update nama master.
 */
export const MasterUpdateBodySchema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi').max(500),
});

/**
 * POST /api/kinerja/master/init-renaksi — Init master dari rencana_aksi.
 * dry=true → preview count tanpa insert (untuk modal konfirmasi).
 */
export const InitRenaksiBodySchema = z.object({
  tahun: TahunSchema,
  dry:   z.boolean().optional().default(false),
});

/**
 * PUT /api/kinerja/ssk — Save SSK/RKO batch.
 */
const SskRowSchema = z.object({
  uraian_ssk:   z.string(),
  uraian:       z.string(),
  program:      z.string(),
  kegiatan:     z.string(),
  subkegiatan:  z.string(),
  pagu:         z.number(),
  months:       MonthsSchema,
  months_pct:   MonthsSchema,
  total:        z.number(),
  total_pct:    z.number(),
  urut:         z.number().int().optional().default(0), // di-overwrite saveSskBatch via index
  // Refactor Versi (Checkpoint C) — optional, server fallback ke MURNI seq=0 kalau tidak ada
  canonical_id: z.string().optional(),
  is_nullified: z.boolean().optional(),
});

export const SskBodySchema = z.object({
  tahun:      TahunSchema,
  sumber:     SumberSchema,
  versi_tipe: VersiTipeSchema.optional(),
  versi_seq:  VersiSeqSchema.optional(),
  expected_version: z.number().int().optional(), // V3-6 optimistic lock
  rows:       z.array(SskRowSchema).max(5000, 'Maks 5000 baris per batch'),
});

/**
 * PUT /api/kinerja/rekening — Save rekening batch.
 */
const RekeningRowSchema = z.object({
  uraian:           z.string(),
  uraian_ssk:       z.string().nullable(),
  sumber_anggaran:  z.string().nullable(),
  program:          z.string().nullable(),
  kegiatan:         z.string().nullable(),
  subkegiatan:      z.string().nullable(),
});

export const RekeningBodySchema = z.object({
  tahun:  TahunSchema,
  sumber: SumberSchema,
  rows:   z.array(RekeningRowSchema).max(5000, 'Maks 5000 baris per batch'),
});

/**
 * PUT /api/kinerja/realisasi — Save realisasi batch.
 */
const RealRowSchema = z.object({
  bulan:             BulanSchema,
  ssk_id:            z.number().int().nullable().optional(),
  real_keuangan:     z.number(),
  akum_keuangan:     z.number().optional(),
  akum_pct_keuangan: z.number().optional(),
  real_fisik:        z.number().optional(),
  akum_pct_fisik:    z.number().optional(),
}).passthrough(); // tolerate extra fields seperti uraian_ssk untuk display

export const RealisasiBodySchema = z.object({
  tahun:  TahunSchema,
  sumber: SumberSchema,
  expected_version: z.number().int().optional(), // V3-6 optimistic lock
  rows:   z.array(RealRowSchema).max(10000, 'Maks 10000 baris per batch'),
});

/**
 * PUT /api/kinerja/realisasi/nomen — Save nomenklatur batch.
 */
export const NomenBodySchema = z.object({
  tahun:  TahunSchema,
  sumber: SumberSchema,
  rows:   z.array(z.object({ keterangan: z.string() })).max(1000),
});

/**
 * PUT /api/kinerja/pendapatan — Save CRR atau Pendapatan batch (type-switched).
 */
const CrrRowSchema = z.object({
  bulan_ke:           BulanSchema,
  bulan:              z.string(),
  pendapatan:         z.number(),
  belanja_blud:       z.number(),
  belanja_daerah:     z.number(),
  pendapatan_sd:      z.number(),
  belanja_blud_sd:    z.number(),
  belanja_daerah_sd:  z.number(),
  crr_parsial_pct:    z.number(),
  crr_total_pct:      z.number(),
});

const PendRowSchema = z.object({
  urut:         z.number().int().optional().default(0), // di-overwrite savePendapatanBatch via index (i+1)
  keterangan:   z.string(),
  target:       z.number(),
  realisasi:    z.number(),
  capaian_pct:  z.number(),
});

export const PendapatanBodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('crr'),        tahun: TahunSchema, rows: z.array(CrrRowSchema).max(12) }),
  z.object({ type: z.literal('pendapatan'), tahun: TahunSchema, rows: z.array(PendRowSchema).max(1000) }),
]);

/**
 * POST /api/kinerja/realisasi/import (mode JSON) — simpan peta keterangan Excel→SSK.
 * L-1: sumber via enum (tolak nilai liar → cegah 500 strict MySQL), keterangan/id
 * dibatasi. Eksistensi ssk_canonical_id dicek terpisah di handler (anti pointer
 * menggantung) karena butuh akses DB.
 */
export const SaveMapPairSchema = z.object({
  keterangan_excel: z.string().trim().min(1).max(500),
  sumber:           SumberSchema,
  ssk_canonical_id: z.string().trim().min(1).max(20),
});
export const SaveMapBodySchema = z.object({
  action: z.literal('save-map'),
  tahun:  TahunSchema,
  pairs:  z.array(SaveMapPairSchema).max(2000),
});

// ─── Query Param Schemas ────────────────────────────────────────────────────

/**
 * GET endpoint query parser. Pass dari URL searchParams.
 * Reusable di dashboard/laporan/master/ssk/rekening/realisasi/pendapatan/nomen.
 */
export const KinerjaQuerySchema = z.object({
  tahun:      TahunSchema.optional(),
  sumber:     SumberSchema.optional(),
  tipe:       MasterTipeSchema.optional(),
  type:       z.enum(['crr', 'pendapatan']).optional(),
  bulan:      BulanSchema.optional(),
  // ─── Versi (Refactor Versi Checkpoint A) ────────────────────────────────
  versi_tipe: VersiTipeSchema.optional(),
  versi_seq:  VersiSeqSchema.optional(),
});

/**
 * Helper: parse searchParams + return validated object atau throw via NextResponse.
 * Pakai di handler GET.
 */
export type KinerjaQuery = z.infer<typeof KinerjaQuerySchema>;
