// lib/blud/kode-besar-schemas.ts
// Zod schemas untuk endpoint /api/blud/kode-besar.
// Pattern mirror master-akun-schemas.ts (audit Tahap 11 + BLUD v1.2 force flag).
// Migration 026: + kolom level + parent_kode untuk fitur 'Buat Form DPA via Kode Besar'.

import { z } from 'zod';

/**
 * Level kategori — menentukan tipe_baris saat inject ke DPA:
 *   L1   → GRANDMASTER (TOTAL row, root)
 *   L2   → MASTER (kelompok belanja)
 *   L2.1 → CHILD (leaf, bisa input vol/harga)
 */
export const KodeBesarLevelSchema = z.enum(['L1', 'L2', 'L2.1']);
export type KodeBesarLevel = z.infer<typeof KodeBesarLevelSchema>;

/**
 * Kode Besar baris input — kode + uraian + level + (opsional) parent_kode.
 *
 * parent_kode rules:
 * - L1   → harus NULL (root)
 * - L2   → boleh NULL (auto-detect by prefix segmen pertama saat inject ke DPA)
 * - L2.1 → wajib diisi (ref kode L2 mana yang dia ikuti)
 *
 * Validasi cross-field di server saat save (skip kalau invalid + warning).
 */
export const KodeBesarInputSchema = z.object({
  kode:        z.string().trim().max(64,  'Kode maks 64 karakter'),
  uraian:      z.string().trim().min(1,  'Uraian wajib diisi').max(255, 'Uraian maks 255 karakter'),
  level:       KodeBesarLevelSchema.default('L2'),
  parent_kode: z.string().trim().max(64).nullable().optional(),
});

export type KodeBesarInput = z.infer<typeof KodeBesarInputSchema>;

/**
 * POST /api/blud/kode-besar
 * Body: { rows: KodeBesarInput[] } — replace all (atomic via transaction).
 */
export const KodeBesarBodySchema = z.object({
  rows:  z.array(KodeBesarInputSchema).max(1000, 'Maksimal 1000 baris'),
  // Audit BLUD v1.2 (B-NEW-1): override safety threshold (user eksplisit confirm di modal)
  force: z.boolean().optional().default(false),
  // L51 optimistic locking
  expected_version: z.coerce.number().int().min(0).default(0),
});
