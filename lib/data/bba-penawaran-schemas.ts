// ═══ PRIMA — BBA Penawaran Rekanan (CONCEPT-bba-revamp-alur §5A) — Zod ═══
import { z } from 'zod';
import { TanggalSchema, FileIdSchema } from './buku-besar-aset-schemas';

const Teks = (maks: number) => z.string().trim().max(maks);
export const MAKS_ITEM_PENAWARAN = 300;

/** Satu item: barang dari Master (`barang_id`), barang baru (`barang_baru`, dibuat di transaksi yang sama — L78), atau belum ditautkan. */
export const ItemPenawaranSchema = z.object({
  id: z.number().int().positive().nullish(),
  barang_id: z.number().int().positive().nullish(),
  barang_baru: Teks(160).min(1).nullish(),
  nama_barang: Teks(255).min(1, 'Nama barang di surat wajib'),
  merk_tipe: Teks(160).nullish(),
  spesifikasi: Teks(500).nullish(),
  satuan: Teks(40).nullish(),
  harga_satuan: z.number().positive('Harga satuan harus lebih dari 0').max(1e13),
}).refine(i => !(i.barang_id && i.barang_baru), 'Pilih barang yang ada ATAU buat barang baru, bukan keduanya');

export const KepalaPenawaranSchema = z.object({
  rekanan: Teks(160).min(1, 'Nama rekanan wajib'),
  nomor_surat: Teks(120).nullish(),
  tgl_surat: TanggalSchema,
  berlaku_sampai: TanggalSchema.nullish(),
  kategori: Teks(80).nullish(),
  file_id: FileIdSchema.nullish(),
  catatan: Teks(500).nullish(),
}).refine(k => !k.berlaku_sampai || k.berlaku_sampai >= k.tgl_surat, 'Tanggal berlaku tidak boleh sebelum tanggal surat');

export const PenawaranSimpanSchema = z.object({
  /** Tanpa id = surat baru. */
  id: z.number().int().positive().nullish(),
  expected_version: z.number().int().min(0).nullish(),
  kepala: KepalaPenawaranSchema,
  item: z.array(ItemPenawaranSchema).min(1, 'Surat penawaran minimal satu item').max(MAKS_ITEM_PENAWARAN),
}).refine(p => !p.id || p.expected_version != null, 'Angka kunci surat wajib saat mengubah');

export const PenawaranHapusSchema = z.object({ id: z.coerce.number().int().positive(), v: z.coerce.number().int().min(0) });

export type PenawaranSimpanInput = z.infer<typeof PenawaranSimpanSchema>;
export type KepalaPenawaranInput = z.infer<typeof KepalaPenawaranSchema>;
