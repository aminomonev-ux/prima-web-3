// ═══ PRIMA — Buku Besar Aset (BBA) — Zod + role + rate-limit ═══════
// Konsep: docs/session/buku-besar-aset/CONCEPT.md (v2).
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { bolehMasukModul, peranBawaanModul } from '@/lib/registry/apps';
import { isSafeHttpUrl } from '@/lib/shared/url';
import { SUMBER_REFERENSI, JENIS_BUKTI, MAKS_REFERENSI } from '@/lib/bba/referensi';

// K5: akses dasar SUPER_ADMIN + ADMIN (staf). Role lain via users.app_access
// include 'buku_besar_aset' (diatur Admin Panel → User Management). Pola Rencana Aksi.
export const ASET_APP_KEY = 'buku_besar_aset';
export const ASET_ALLOWED_ROLES = peranBawaanModul(ASET_APP_KEY);

// Fase B (Tahap 2): daftar peran + aturan pintunya PINDAH ke `lib/registry/apps.ts`.
// Fungsi ini dipertahankan sebagai pembungkus tipis supaya 1 pemanggilnya tidak
// perlu disentuh — yang hilang cuma salinan aturannya, bukan bentuk pemanggilannya.
export function isAsetRole(role: string, appAccess: string[] | null | undefined): boolean {
  return bolehMasukModul('buku_besar_aset', role, appAccess);
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
export function isValidStatusTransition(from: BbaStatus, to: BbaStatus, bolehKoreksiMundur = false): boolean {
  if (from === to) return true; // idempotent: edit field lain tanpa ganti status
  // A4: koreksi mundur dari terminal REALISASI_PENUH — khusus Admin (SUPER_ADMIN/
  // ADMIN, lihat PERAN_PEMBATAL_FINAL), dicatat audit log. Nama parameternya dulu
  // `superAdminOverride`; diganti karena yang menentukan sekarang KEWENANGANNYA,
  // bukan satu peran tertentu — nama lama akan menyesatkan pembaca berikutnya.
  if (bolehKoreksiMundur && from === 'REALISASI_PENUH') return true;
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

// ─── Referensi harga & bukti dukung (CONCEPT-bba-perencanaan §4) ────────────
const TanggalSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const TautanSchema  = z.string().trim().max(2048).refine(isSafeHttpUrl, 'Tautan harus diawali http:// atau https://');
// Bentuk id berkas Drive — sama dengan `safeId` di /api/upload/download.
const FileIdSchema  = z.string().regex(/^[\w-]{20,64}$/, 'Id berkas tidak valid');

export const ReferensiSchema = z.object({
  sumber:        z.enum(SUMBER_REFERENSI),
  nama_penyedia: z.string().trim().max(255).nullish(),
  url:           TautanSchema.nullish(),
  harga:         z.number().min(0).nullish(),
  tgl_cek:       TanggalSchema.nullish(),
  file_id:       FileIdSchema.nullish(),
}).refine(r => !!(r.nama_penyedia || r.url || r.harga || r.tgl_cek || r.file_id), 'Referensi harga kosong');

// L87: `undefined` = jangan sentuh referensi tersimpan; larik (termasuk kosong) = ganti semua.
const ReferensiDaftarSchema = z.array(ReferensiSchema).max(MAKS_REFERENSI, `Referensi harga paling banyak ${MAKS_REFERENSI}`).optional();

export const BuktiCreateSchema = z.object({
  aset_id:    z.number().int().positive(),
  jenis:      z.enum(JENIS_BUKTI),
  nama:       z.string().trim().min(1, 'Nama bukti wajib').max(255),
  url:        TautanSchema.nullish(),
  file_id:    FileIdSchema.nullish(),
  keterangan: z.string().trim().max(500).nullish(),
}).refine(b => !!(b.url || b.file_id), 'Bukti perlu berkas atau tautan');
export const BuktiDeleteSchema = z.object({ id: z.coerce.number().int().positive() });
export const BbaDetailSchema   = z.object({ id: z.coerce.number().int().positive() });

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
  referensi:        ReferensiDaftarSchema,
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
  referensi:        ReferensiDaftarSchema,
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
export type ReferensiInput       = z.infer<typeof ReferensiSchema>;
export type BuktiCreateInput     = z.infer<typeof BuktiCreateSchema>;
