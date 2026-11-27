// ═══ PRIMA — BBA Penawaran Rekanan (CONCEPT-bba-revamp-alur §5A, CONCEPT-bba-penawaran-matriks) — Zod ═══
import { z } from 'zod';
import { TanggalSchema, FileIdSchema } from './buku-besar-aset-schemas';
import { STATUS_PAJAK, STATUS_TINDAK_LANJUT, syaratSurat } from '@/lib/bba/penawaran';
import { isSafeHttpUrl } from '@/lib/shared/url';

const Teks = (maks: number) => z.string().trim().max(maks);
export const MAKS_ITEM_PENAWARAN = 300;

/** Satu item: barang dari Master (`barang_id`), barang baru (`barang_baru`, dibuat di transaksi yang sama — L78), atau belum ditautkan. */
export const ItemPenawaranSchema = z.object({
  id: z.number().int().positive().nullish(),
  barang_id: z.number().int().positive().nullish(),
  barang_baru: Teks(160).min(1).nullish(),
  nama_barang: Teks(255).min(1, 'Nama barang di surat wajib'),
  merk: Teks(80).nullish(),
  /** Tipe (nama kolom lama). */
  merk_tipe: Teks(160).nullish(),
  spesifikasi: Teks(500).nullish(),
  satuan: Teks(40).nullish(),
  /** Kosong = surat belum mencantumkan harga (§3.3). */
  harga_satuan: z.number().positive('Harga satuan harus lebih dari 0').max(1e13).nullish(),
  status_pajak: z.enum(STATUS_PAJAK).nullish(),
  tautan: Teks(500).nullish().refine(u => !u || isSafeHttpUrl(u), 'Link e-Katalog harus alamat http/https yang utuh'),
  garansi: Teks(120).nullish(),
}).refine(i => !(i.barang_id && i.barang_baru), 'Pilih barang yang ada ATAU buat barang baru, bukan keduanya');

export const KepalaPenawaranSchema = z.object({
  rekanan:           Teks(160).min(1, 'Nama rekanan wajib'),
  nomor_surat:       Teks(120).nullish(),
  tgl_surat:         TanggalSchema,
  berlaku_sampai:    TanggalSchema.nullish(),
  kategori_id:       z.number().int().positive().nullish(),
  jenis_kategori_id: z.number().int().positive().nullish(),
  kategori:          Teks(100).nullish(),
  jenis_kategori:    Teks(255).nullish(),
  kode_rekening:     Teks(64).nullish(),
  kelompok_kib:      Teks(128).nullish(),
  file_id:           FileIdSchema.nullish(),
  /** Syarat & pengecualian. */
  catatan:           Teks(1000).nullish(),
  // L87: kolom Matriks yang tidak dikirim (tab lama, tinjauan Drive berbentuk lama) = jangan sentuh.
  jenis_surat:          Teks(80).nullish(),
  pic_kontak:           Teks(255).nullish(),
  masa_berlaku_teks:    Teks(60).nullish(),
  status_tindak_lanjut: z.enum(STATUS_TINDAK_LANJUT).nullish(),
}).refine(k => !k.berlaku_sampai || k.berlaku_sampai >= k.tgl_surat, 'Tanggal berlaku tidak boleh sebelum tanggal surat');

export const PenawaranSimpanSchema = z.object({
  /** Tanpa id = surat baru. */
  id: z.number().int().positive().nullish(),
  expected_version: z.number().int().min(0).nullish(),
  kepala: KepalaPenawaranSchema,
  item: z.array(ItemPenawaranSchema).max(MAKS_ITEM_PENAWARAN),
}).refine(p => !p.id || p.expected_version != null, 'Angka kunci surat wajib saat mengubah')
  // §3.1 — jenis surat yang tidak dikirim saat mengubah dinilai server dari jenis tersimpan (simpanPenawaran).
  .superRefine((p, ctx) => {
    if (p.kepala.jenis_surat === undefined && p.id) return;
    const sebab = syaratSurat(p.kepala.jenis_surat, p.item);
    if (sebab) ctx.addIssue({ code: 'custom', message: sebab, path: ['item'] });
  });

/** Ubah status tindak lanjut dari menu ⋯ baris tanpa membuka form. */
export const StatusPenawaranSchema = z.object({
  id: z.number().int().positive(),
  expected_version: z.number().int().min(0),
  status_tindak_lanjut: z.enum(STATUS_TINDAK_LANJUT).nullable(),
});

export const PenawaranHapusSchema = z.object({ id: z.coerce.number().int().positive(), v: z.coerce.number().int().min(0) });

export type PenawaranSimpanInput = z.infer<typeof PenawaranSimpanSchema>;
export type KepalaPenawaranInput = z.infer<typeof KepalaPenawaranSchema>;
