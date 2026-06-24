// lib/blud/master-akun-schemas.ts
// Zod schemas untuk endpoint /api/blud/master-akun.
// Pattern sama dengan lib/blud/schemas.ts (audit Tahap 11).

import { z } from 'zod';

/**
 * Master Akun baris input — minimal kode + uraian.
 * Validasi: kode max 64 char (sesuai schema MySQL), uraian max 255.
 */
export const MasterAkunInputSchema = z.object({
  kode:   z.string().trim().max(64,  'Kode maks 64 karakter'),
  uraian: z.string().trim().min(1,  'Uraian wajib diisi').max(255, 'Uraian maks 255 karakter'),
});

export type MasterAkunInput = z.infer<typeof MasterAkunInputSchema>;

/**
 * POST /api/blud/master-akun
 * Body: { rows: MasterAkunInput[] } — replace all (atomic via transaction).
 * Max 5000 baris per save: enough untuk daftar rekening BLUD, mencegah abuse.
 */
export const MasterAkunBodySchema = z.object({
  rows:  z.array(MasterAkunInputSchema).max(5000, 'Maksimal 5000 baris'),
  // Audit BLUD v1.2 (B-NEW-1): override safety threshold (user eksplisit confirm di modal)
  force: z.boolean().optional().default(false),
  // L51 optimistic locking: client kirim baseline version
  expected_version: z.coerce.number().int().min(0).default(0),
});
