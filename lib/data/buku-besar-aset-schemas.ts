// ═══ PRIMA — Buku Besar Aset (BBA) — Zod + role + rate-limit ═══════
// Konsep: docs/session/buku-besar-aset/CONCEPT.md (v2).
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/security/ratelimit';
import { bolehMasukModul, peranBawaanModul } from '@/lib/registry/apps';
import { isSafeHttpUrl } from '@/lib/shared/url';
import { SUMBER_REFERENSI, JENIS_BUKTI, MAKS_REFERENSI } from '@/lib/bba/referensi';
import { BBA_STATUSES } from '@/lib/bba/status';
import { PANJANG_NAMA_BARANG } from '@/lib/bba/barang';
import { MAKS_UNIT, MAKS_BARIS_PENDATAAN } from '@/lib/bba/eksisting';

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

// Status + transisi pindah ke lib/bba/status.ts (murni — layar ikut memakainya); diekspor
// ulang di sini supaya pemanggil lama tidak disentuh.
export { BBA_STATUSES, BBA_STATUS_TRANSITIONS, isValidStatusTransition, type BbaStatus } from '@/lib/bba/status';

const StatusSchema = z.enum(BBA_STATUSES);
const SumberSchema = z.enum(['BLUD', 'APBD', 'DAK', 'LAINNYA']);
const TahunSchema  = z.coerce.number().int().min(2020, 'Tahun 2020-2100').max(2100, 'Tahun 2020-2100');

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

// Master Barang (§5.1). `barang_baru` = buat (atau pakai yang bernama sama) SAAT Simpan item,
// di transaksi yang sama — tidak ada tulisan lain di luar tombol Simpan (L78).
const BarangIdSchema   = z.number().int().positive();
const NamaBarangSchema = z.string().trim().min(1, 'Nama barang wajib').max(PANJANG_NAMA_BARANG);
const satuBarang = (b: { barang_id?: number | null; barang_baru?: string | null }) => !(b.barang_id && b.barang_baru);
const PESAN_SATU_BARANG = 'Pilih barang yang ada ATAU buat barang baru, bukan keduanya';

export const BbaCreateSchema = z.object({
  tahun_anggaran:   TahunSchema,
  kode_rekening:    z.string().max(64).nullish(),
  uraian:           z.string().min(1, 'Uraian wajib').max(2000),
  kategori_aset:    z.string().max(64).nullish(),
  barang_id:        BarangIdSchema.nullish(),
  barang_baru:      NamaBarangSchema.nullish(),
  sumber_anggaran:  SumberSchema.default('BLUD'),
  vol:              z.number().min(0).default(0),
  satuan:           z.string().max(32).nullish(),
  harga:            z.number().min(0).default(0),
  penanggung_jawab: z.string().max(128).nullish(),
  keterangan:       z.string().max(4000).nullish(),
  referensi:        ReferensiDaftarSchema,
}).refine(satuBarang, PESAN_SATU_BARANG);

// Status TIDAK lagi diubah lewat sini — satu pintu: modal Proses & Realisasi (`setRealisasi`, §5.2).
export const BbaUpdateSchema = z.object({
  id:               z.number().int().positive(),
  expected_version: z.number().int().min(0),
  kode_rekening:    z.string().max(64).nullish(),
  uraian:           z.string().min(1).max(2000).optional(),
  kategori_aset:    z.string().max(64).nullish(),
  // undefined = jangan sentuh, null = lepas tautan barang
  barang_id:        BarangIdSchema.nullish(),
  barang_baru:      NamaBarangSchema.nullish(),
  sumber_anggaran:  SumberSchema.optional(),
  vol:              z.number().min(0).optional(),
  satuan:           z.string().max(32).nullish(),
  harga:            z.number().min(0).optional(),
  penanggung_jawab: z.string().max(128).nullish(),
  keterangan:       z.string().max(4000).nullish(),
  referensi:        ReferensiDaftarSchema,
}).refine(satuBarang, PESAN_SATU_BARANG);

export const BbaRealisasiSchema = z.object({
  id:               z.number().int().positive(),
  expected_version: z.number().int().min(0),
  nilai_realisasi:  z.number().min(0),
  vol_realisasi:    z.number().min(0, 'Unit realisasi minimal 0'), // batas atas (≤ vol) divalidasi server di setRealisasi
  tgl_realisasi:    TanggalSchema.nullish(),
  // Dipakai hanya bila status DIPROSES (tanggal pesan/kontrak); status lain mengabaikannya.
  tgl_proses:       TanggalSchema.nullish(),
  status:           StatusSchema,
});

export const BbaDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// Import Belanja Modal dari Usulan Kebutuhan — pagarnya izin EDIT bagian Rencana (route).
export const BbaImportUsulanSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), tahun: TahunSchema }),
  z.object({ mode: z.literal('commit'),  tahun: TahunSchema }),
]);

// ─── Master Kategori Aset ───────────────────────────────────────────────────
export const KategoriCreateSchema = z.object({ nama: z.string().trim().min(1, 'Nama kategori wajib').max(128) });
export const KategoriDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

// ─── Master Barang (§5.1) ───────────────────────────────────────────────────
export const BarangCreateSchema = z.object({
  nama:          NamaBarangSchema,
  kategori_aset: z.string().trim().max(64).nullish(),
  satuan:        z.string().trim().max(32).nullish(),
});
export const BarangUpdateSchema = z.object({
  id:            BarangIdSchema,
  nama:          NamaBarangSchema.optional(),
  kategori_aset: z.string().trim().max(64).nullish(),
  satuan:        z.string().trim().max(32).nullish(),
});
export const BarangDeleteSchema = z.object({ id: z.coerce.number().int().positive() });
export const BarangGabungSchema = z.object({ dari: BarangIdSchema, ke: BarangIdSchema })
  .refine(g => g.dari !== g.ke, 'Barang asal dan tujuan tidak boleh sama');
export const BarangQuerySchema = z.object({
  id:      z.coerce.number().int().positive().optional(),
  tahun:   TahunSchema.optional(),
  ringkas: z.enum(['1']).optional(),
});
// Tautkan sekaligus: hanya item yang MASIH belum bertaut yang diisi (bukan CAS versi — daftarnya
// dipotret dari tabel yang bisa basi, L77; "masih kosong" adalah pertanyaan yang tepat).
export const BarangTautkanSchema = z.object({
  pasangan: z.array(z.object({
    aset_id:     z.number().int().positive(),
    barang_id:   BarangIdSchema.nullish(),
    barang_baru: NamaBarangSchema.nullish(),
  }).refine(p => !!p.barang_id !== !!p.barang_baru, PESAN_SATU_BARANG)).min(1, 'Tidak ada item yang ditautkan').max(200),
});

export type BbaCreateInput       = z.infer<typeof BbaCreateSchema>;
export type BbaUpdateInput       = z.infer<typeof BbaUpdateSchema>;
export type BbaRealisasiInput    = z.infer<typeof BbaRealisasiSchema>;
export type BbaQuery             = z.infer<typeof BbaQuerySchema>;
export type BbaImportUsulanInput = z.infer<typeof BbaImportUsulanSchema>;
export type ReferensiInput       = z.infer<typeof ReferensiSchema>;
// ─── Kondisi eksisting (§6) ─────────────────────────────────────────────────
const NamaLokasiSchema = z.string().trim().min(1, 'Nama lokasi wajib').max(160);
export const LokasiCreateSchema = z.object({ nama: NamaLokasiSchema });
export const LokasiUpdateSchema = z.object({ id: z.number().int().positive(), nama: NamaLokasiSchema });
export const LokasiDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

const UnitSchema = z.number().int('Jumlah unit harus bilangan bulat').min(0).max(MAKS_UNIT);
// Satu Simpan = satu lokasi × satu tanggal; baris yang tidak dikirim tidak disentuh (bukan replace-all lokasi).
export const EksistingSimpanSchema = z.object({
  lokasi_id: z.number().int().positive(),
  tgl_cek:   TanggalSchema,
  baris: z.array(z.object({
    barang_id:    z.number().int().positive(),
    baik:         UnitSchema,
    rusak_ringan: UnitSchema,
    rusak_berat:  UnitSchema,
    catatan:      z.string().trim().max(500).nullish(),
    file_id:      FileIdSchema.nullish(),
  })).min(1, 'Belum ada barang yang didata').max(MAKS_BARIS_PENDATAAN)
    .refine(b => new Set(b.map(x => x.barang_id)).size === b.length, 'Barang yang sama muncul dua kali'),
});
export const EksistingFormSchema = z.object({ lokasi_id: z.coerce.number().int().positive(), tgl: TanggalSchema });
export const EksistingDeleteSchema = z.object({ id: z.coerce.number().int().positive() });

export type BuktiCreateInput     = z.infer<typeof BuktiCreateSchema>;
export type EksistingSimpanInput = z.infer<typeof EksistingSimpanSchema>;
export type BarangCreateInput    = z.infer<typeof BarangCreateSchema>;
export type BarangUpdateInput    = z.infer<typeof BarangUpdateSchema>;
export type BarangTautkanInput   = z.infer<typeof BarangTautkanSchema>;
