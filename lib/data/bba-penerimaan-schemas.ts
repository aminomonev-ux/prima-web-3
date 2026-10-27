// ═══ PRIMA — BBA Pengadaan & penerimaan (Tahap E buku aset) — Zod ═══
import { z } from 'zod';
import { GOLONGAN, KONDISI } from '@/lib/bba/kib';
import { MAKS_REFERENSI } from '@/lib/bba/referensi';
import { TanggalSchema, FileIdSchema, TautanSchema } from './buku-besar-aset-schemas';

const IdPositif = z.coerce.number().int().positive();
const Versi = z.number().int().min(0);
const Teks = (maks: number) => z.string().trim().max(maks);

export const PengadaanQuerySchema = z.object({ tahun: z.coerce.number().int().min(2020).max(2100) });

/** "Yang dibeli": pilih referensi ke-n (disalin) atau isi sendiri; isian sendiri menimpa salinan per kolom. */
export const PenerimaanSchema = z.object({
  rencana_id: z.number().int().positive(),
  expected_version: Versi,
  tgl: TanggalSchema,
  vol: z.number().positive('Jumlah yang diterima harus lebih dari 0').max(1_000_000),
  harga_satuan: z.number().min(0).max(1e13),
  referensi_urutan: z.number().int().min(1).max(MAKS_REFERENSI).nullish(),
  merk_tipe: Teks(160).nullish(),
  penyedia: Teks(255).nullish(),
  url: TautanSchema.nullish(),
  catatan: Teks(500).nullish(),
});

export const HapusPenerimaanSchema = z.object({ id: IdPositif });

/** Penempatan oleh Umum Aset: satu penerimaan → `jumlah` register "belum teregister". */
export const TempatkanSchema = z.object({
  penerimaan_id: z.number().int().positive(),
  jumlah: z.number().int().min(1).max(1000),
  golongan: z.enum(GOLONGAN),
  nama_resmi: Teks(255).min(1, 'Nama barang (seperti di KIB) wajib'),
  nama: Teks(255).nullish(),
  lokasi_id: z.number().int().positive().nullish(),
  kondisi: z.enum(KONDISI),
  catatan: Teks(500).nullish(),
});

export const RegisterSchema = z.object({
  id: z.number().int().positive(),
  expected_version: Versi,
  kode_barang: Teks(80).min(1, 'Kode barang wajib'),
  register: Teks(20).min(1, 'Nomor register wajib'),
});

export const HapusAsetSchema = z.object({
  id: z.number().int().positive(),
  expected_version: Versi,
  sk_nomor: Teks(80).min(1, 'Nomor SK penghapusan wajib'),
  sk_tgl: TanggalSchema,
  catatan: Teks(500).nullish(),
  file_id: FileIdSchema.nullish(),
});

export const RehabSchema = z.object({
  aset_id: z.number().int().positive(),
  expected_version: Versi,
  rencana_id: z.number().int().positive(),
  kondisi: z.enum(KONDISI),
  tgl: TanggalSchema,
  catatan: Teks(500).nullish(),
  file_id: FileIdSchema.nullish(),
});

/** Antrean Buku Aset: satu POST, dua tindakan (tempatkan barang diterima / catat rehab selesai). */
export const AntreanAksiSchema = z.discriminatedUnion('aksi', [
  TempatkanSchema.extend({ aksi: z.literal('TEMPATKAN') }),
  RehabSchema.extend({ aksi: z.literal('REHAB') }),
]);

export type PenerimaanInput = z.infer<typeof PenerimaanSchema>;
export type TempatkanInput = z.infer<typeof TempatkanSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type HapusAsetInput = z.infer<typeof HapusAsetSchema>;
export type RehabInput = z.infer<typeof RehabSchema>;
