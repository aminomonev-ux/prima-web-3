// ═══ PRIMA — BBA Buku Aset — Zod ═══════════════════════════════════
import { z } from 'zod';
import { GOLONGAN } from '@/lib/bba/kib';
import { PANJANG_NAMA_BARANG } from '@/lib/bba/barang';

const Golongan = z.enum(GOLONGAN);

export const AsetDaftarSchema = z.object({
  golongan: Golongan.optional(),
  q: z.string().trim().max(100).optional(),
  tahun: z.coerce.number().int().min(1800).max(2200).optional(),
  kondisi: z.enum(['B', 'RR', 'RB', 'BELUM_DICEK']).optional(),
  status: z.enum(['AKTIF', 'DIHAPUS']).optional(),
});

export const AsetIdSchema = z.object({ id: z.coerce.number().int().positive() });

/** Register sebuah kelompok — dibatasi supaya satu permintaan tidak menarik seluruh buku. */
export const AsetIdsSchema = z.object({
  ids: z.string().max(8000).transform(s => s.split(',').map(Number)).pipe(z.array(z.number().int().positive()).min(1).max(500)),
});

export const UbahAsetSchema = z.object({
  id: z.number().int().positive(),
  expected_version: z.number().int().min(0),
  nama: z.string().max(255).nullable().optional(),
  barang_id: z.number().int().positive().nullable().optional(),
  barang_baru: z.string().trim().min(1).max(PANJANG_NAMA_BARANG).optional(),
}).refine(d => !(d.barang_baru && d.barang_id), { message: 'Pilih barang yang ada ATAU buat baru, bukan keduanya' });

export const KibExcelSchema = z.object({ golongan: z.union([Golongan, z.literal('SEMUA')]) });
