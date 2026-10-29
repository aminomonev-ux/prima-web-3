// ═══ PRIMA — BBA Buku Aset — Zod ═══════════════════════════════════
import { z } from 'zod';
import { GOLONGAN, KONDISI } from '@/lib/bba/kib';
import { PANJANG_NAMA_BARANG } from '@/lib/bba/barang';
import { TanggalSchema, FileIdSchema } from './buku-besar-aset-schemas';

const Golongan = z.enum(GOLONGAN);
const IdPositif = z.coerce.number().int().positive();

export const AsetDaftarSchema = z.object({
  golongan: Golongan.optional(),
  q: z.string().trim().max(100).optional(),
  tahun: z.coerce.number().int().min(1800).max(2200).optional(),
  kondisi: z.enum(['B', 'RR', 'RB', 'BELUM_DICEK', 'PERLU_DICEK']).optional(),
  status: z.enum(['AKTIF', 'DIHAPUS']).optional(),
  tanda: z.enum(['BELUM_TEREGISTER', 'SIAP_DIHAPUS']).optional(),
  /** 0 = peralatan (B/E) yang belum punya ruangan. */
  lokasi: z.coerce.number().int().min(0).optional(),
  gedung: IdPositif.optional(),
  /** Dari kartu barang: register yang ditautkan ke barang itu. */
  barang: IdPositif.optional(),
});

export const AsetIdSchema = z.object({ id: IdPositif });

/** Register sebuah kelompok — dibatasi supaya satu permintaan tidak menarik seluruh buku. */
export const AsetIdsSchema = z.object({
  ids: z.string().max(8000).transform(s => s.split(',').map(Number)).pipe(z.array(z.number().int().positive()).min(1).max(500)),
});

/** Register untuk opname: satu ruangan ATAU satu gedung (gedungnya + isi ruangan-ruangan di dalamnya). */
export const AsetOpnameSchema = z.union([z.object({ ruang: IdPositif }), z.object({ gedung: IdPositif })]);

/** Calon aset sasaran rencana (modal item, Tahap D). */
export const AsetSasaranCariSchema = z.object({
  barang: IdPositif.optional(),
  q: z.string().trim().max(100).optional(),
});

export const UbahAsetSchema = z.object({
  id: z.number().int().positive(),
  expected_version: z.number().int().min(0),
  nama: z.string().max(255).nullable().optional(),
  barang_id: z.number().int().positive().nullable().optional(),
  barang_baru: z.string().trim().min(1).max(PANJANG_NAMA_BARANG).optional(),
}).refine(d => !(d.barang_baru && d.barang_id), { message: 'Pilih barang yang ada ATAU buat baru, bukan keduanya' });

export const MAKS_ASET_SEKALIGUS = 1000;
const Versi = z.object({ id: z.number().int().positive(), expected_version: z.number().int().min(0) });
const tanpaKembar = <T extends { id: number }>(xs: T[]) => new Set(xs.map(x => x.id)).size === xs.length;

/** Satu pemeriksaan = satu tanggal untuk semua register yang dikirim; semua atau tidak sama sekali. */
export const CatatKondisiSchema = z.object({
  tgl: TanggalSchema,
  catatan: z.string().trim().max(500).nullish(),
  file_id: FileIdSchema.nullish(),
  item: z.array(Versi.extend({ kondisi: z.enum(KONDISI) })).min(1, 'Belum ada register yang dicek').max(MAKS_ASET_SEKALIGUS)
    .refine(tanpaKembar, 'Register yang sama muncul dua kali'),
});

export const PindahAsetSchema = z.object({
  lokasi_id: z.number().int().positive().nullable(),
  catatan: z.string().trim().max(500).nullish(),
  item: z.array(Versi).min(1, 'Belum ada register yang dipilih').max(MAKS_ASET_SEKALIGUS).refine(tanpaKembar, 'Register yang sama muncul dua kali'),
});

export const TautkanBarangAsetSchema = z.object({
  barang_id: z.number().int().positive().nullable().optional(),
  barang_baru: z.string().trim().min(1).max(PANJANG_NAMA_BARANG).optional(),
  item: z.array(Versi).min(1, 'Belum ada register yang dipilih').max(MAKS_ASET_SEKALIGUS).refine(tanpaKembar, 'Register yang sama muncul dua kali'),
}).refine(d => !(d.barang_baru && d.barang_id), { message: 'Pilih barang yang ada ATAU buat baru, bukan keduanya' })
  .refine(d => d.barang_baru !== undefined || d.barang_id !== undefined, { message: 'Pilih barangnya dulu' });

// ─── Nomor diganti provinsi & catatan kembar (Tahap G, §23) ──────────────────

/** Pasangan pilihan pratinjau impor — server menerimanya hanya bila ada di daftar calonnya sendiri. */
export const PasanganImporSchema = z.array(z.object({ aset_id: z.number().int().positive(), kunci: z.string().min(1).max(400) }).strict()).max(20_000)
  .refine(xs => new Set(xs.map(x => x.aset_id)).size === xs.length, 'Satu catatan dipasangkan dua kali')
  .refine(xs => new Set(xs.map(x => x.kunci)).size === xs.length, 'Satu register berkas dipasangkan dua kali');

/** Saran kembaran di kartu aset; `register` = cari nomor (nama/harganya ikut dibetulkan provinsi). */
export const KembarCariSchema = z.object({ id: IdPositif, register: z.string().trim().min(1).max(80).optional() });

export const GabungKembarSchema = z.object({
  id: z.number().int().positive(),
  expected_version: z.number().int().min(0),
  kembar_id: z.number().int().positive(),
  expected_version_kembar: z.number().int().min(0),
  alasan: z.string().trim().min(5, 'Tulis alasannya (paling sedikit 5 huruf)').max(500),
}).refine(d => d.id !== d.kembar_id, { message: 'Pilih catatan lain — ini catatan yang sama' });

export const JENIS_EXCEL = ['KIB', 'KIR', 'SENSUS', 'REKAP', 'BI', 'KERJA', 'RENCANA'] as const;
export const AsetExcelSchema = z.discriminatedUnion('jenis', [
  z.object({ jenis: z.literal('KIB'), golongan: z.union([Golongan, z.literal('SEMUA')]) }),
  /** SEMUA = satu lembar per ruangan yang berisi. */
  z.object({ jenis: z.literal('KIR'), lokasi: z.union([IdPositif, z.literal('SEMUA')]) }),
  z.object({ jenis: z.literal('SENSUS'), tahun: z.coerce.number().int().min(2000).max(2200) }),
  z.object({ jenis: z.literal('REKAP') }),
  z.object({ jenis: z.literal('BI') }),
  z.object({ jenis: z.literal('KERJA') }),
  z.object({ jenis: z.literal('RENCANA'), tahun: z.coerce.number().int().min(2020).max(2100) }),
]);

export type CatatKondisiInput = z.infer<typeof CatatKondisiSchema>;
export type PindahAsetInput = z.infer<typeof PindahAsetSchema>;
export type TautkanBarangAsetInput = z.infer<typeof TautkanBarangAsetSchema>;
export type AsetExcelInput = z.infer<typeof AsetExcelSchema>;
export type GabungKembarInput = z.infer<typeof GabungKembarSchema>;
