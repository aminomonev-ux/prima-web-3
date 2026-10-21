// ═══ PRIMA — IKI (Indikator Kinerja Individu) API Schemas ═══════════════════
// Centralized Zod schemas + role allow-list untuk endpoint app/api/iki/*.
// Pattern mirror Rencana Aksi + PK. Konsep: docs/CONCEPT-iki.md

import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { bolehMasukModul, peranBawaanModul } from '@/lib/registry/apps';
import { AlignSchema, buatCellSchema } from '@/lib/lkjip/schemas';
import { BATAS_KOLOM_IKI, BATAS_BARIS_IKI } from '@/lib/iki/custom';
import { KUNCI_PERAN } from '@/lib/iki/peran';
import { BATAS_BARIS_KEPALA } from '@/lib/lkjip/tabel';

// ─── Role allow-list ─────────────────────────────────────────────────────────

/**
 * Default: Admin Staff + Super Admin (keputusan user 2026-07-14).
 * Role lain di-toggle via Admin Panel (`users.app_access` include 'iki').
 */
export const IKI_ALLOWED_ROLES = peranBawaanModul('iki');

// Fase B (Tahap 2): daftar peran + aturan pintunya PINDAH ke `lib/registry/apps.ts`.
// Fungsi ini dipertahankan sebagai pembungkus tipis supaya 1 pemanggilnya tidak
// perlu disentuh — yang hilang cuma salinan aturannya, bukan bentuk pemanggilannya.
export function isIkiRole(role: string, appAccess: string[] | null): boolean {
  return bolehMasukModul('iki', role, appAccess);
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

export const VarianSchema = z.enum(['STANDAR', 'DIREKTUR', 'CUSTOM']);
export type IkiVarian = z.infer<typeof VarianSchema>;

export const JenisDokumenSchema = z.enum(['MURNI', 'PERUBAHAN']);
export type IkiJenisDokumen = z.infer<typeof JenisDokumenSchema>;

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

// ─── Tabel varian CUSTOM (docs/CONCEPT-iki-custom.md §5) ─────────────────────
// Sel = skema sel LKJIP yang SAMA (pabrik `buatCellSchema`), batasnya milik IKI (24 kolom, §9.1).
// Kunci yang tak terdaftar dibuang Zod diam-diam — kunci baru di `TabelCustom` WAJIB didaftar di sini.
const BATAS_JSON_TABEL = 2_000_000;
export const TabelCustomSchema = z.object({
  kolom: z.array(z.string().max(255)).min(1, 'Tabel minimal 1 kolom').max(BATAS_KOLOM_IKI, `Tabel paling banyak ${BATAS_KOLOM_IKI} kolom`),
  align: z.array(AlignSchema).max(BATAS_KOLOM_IKI).default([]),
  colWidths: z.array(z.coerce.number().int().min(24).max(2000)).max(BATAS_KOLOM_IKI).default([]),
  headerRows: z.coerce.number().int().min(0).max(BATAS_BARIS_KEPALA).default(1),
  rows: z.array(z.array(buatCellSchema(BATAS_KOLOM_IKI)).max(BATAS_KOLOM_IKI)).min(1, 'Tabel minimal 1 baris')
    .max(BATAS_BARIS_IKI, `Tabel paling banyak ${BATAS_BARIS_IKI} baris`),
  kolomNomor: z.number().int().min(0).max(BATAS_KOLOM_IKI - 1).nullable().default(null),
  gaya: z.object({ selang: z.boolean().optional(), jumlah: z.boolean().optional(), mendatar: z.boolean().optional() }).default({}),
  kertas: z.enum(['A4', 'F4']).default('A4'),
  // Peran kolom (§11): peran → indeks kolom. Kerapiannya (satu peran satu kolom, mendatar ⇄ menurun) dijaga bacaPeran saat ditulis.
  peran: z.partialRecord(z.enum(KUNCI_PERAN), z.number().int().min(0).max(BATAS_KOLOM_IKI - 1)).default({}),
}).refine(t => JSON.stringify(t).length <= BATAS_JSON_TABEL, 'Isi tabel terlalu besar');
export type TabelCustomInput = z.infer<typeof TabelCustomSchema>;

// ─── Create dokumen ──────────────────────────────────────────────────────────

export const CreateDokumenSchema = z.object({
  tahun: TahunSchema,
  varian: VarianSchema.default('STANDAR'),
  jenis: JenisDokumenSchema.default('MURNI'),
  nama: z.string().trim().min(1, 'Nama wajib').max(255),
  nip: z.string().trim().min(1, 'NIP wajib').max(50),
  jabatan: z.string().trim().min(1, 'Jabatan wajib').max(255),
  pangkat: z.string().trim().max(100).nullable().optional(),
  // Varian CUSTOM: tabel awal disalin dari templat ini (tanpa = bentuk bawaan `tabelCustomAwal`).
  templat_id: z.number().int().positive().nullable().optional(),
});

// ─── Save dokumen (header + seluruh RHK, replace-all) ────────────────────────

export const SaveDokumenSchema = z.object({
  expected_version: z.number().int().min(0),
  varian: VarianSchema,
  jenis: JenisDokumenSchema.default('MURNI'),
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
  tabel_custom: TabelCustomSchema.nullable().optional(),
}).superRefine((v, ctx) => {
  // CUSTOM berisi tabel, bukan RHK — dua isian untuk satu dokumen = dua sumber kebenaran (konsep §5).
  if (v.varian === 'CUSTOM') {
    if (!v.tabel_custom) ctx.addIssue({ code: 'custom', path: ['tabel_custom'], message: 'Varian CUSTOM wajib berisi tabel' });
    if (v.rhk.length) ctx.addIssue({ code: 'custom', path: ['rhk'], message: 'Varian CUSTOM tidak memakai baris RHK' });
    return;
  }
  if (v.tabel_custom) ctx.addIssue({ code: 'custom', path: ['tabel_custom'], message: 'Tabel bebas hanya untuk varian CUSTOM' });
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

export const BulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Minimal 1 dokumen').max(200, 'Maksimal 200 dokumen sekaligus'),
});

export const FinalizeSchema = z.object({
  expected_version: z.number().int().min(0),
});

export const DuplicateSchema = z.object({
  tahun_target: TahunSchema,
  // Opsional: tab lama yang tidak mengirimnya tetap menyalin jenis yang sama (perilaku lama).
  jenis_target: JenisDokumenSchema.optional(),
});

export const SalinTahunSchema = z.object({
  tahun_sumber: TahunSchema,
  tahun_target: TahunSchema,
}).refine(v => v.tahun_sumber < v.tahun_target, 'Tahun sumber harus sebelum tahun tujuan');

// ─── Templat tabel CUSTOM (konsep §4) — dikelola semua pemegang akses IKI (keputusan #2) ──────
const NamaTemplatSchema = z.string().trim().min(1, 'Nama templat wajib').max(150);
export const TemplatBuatSchema = z.object({ nama: NamaTemplatSchema, payload: TabelCustomSchema });
export const TemplatUbahSchema = z.object({ id: z.number().int().positive(), nama: NamaTemplatSchema });

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
