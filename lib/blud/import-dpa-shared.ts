// lib/blud/import-dpa-shared.ts — potongan impor DPA yang dipakai KEDUA sisi.
//
// Modal impor (klien) butuh pemeta baris, parser (server) butuh yang sama, dan
// Zod butuh batas barisnya. Kalau ketiganya mengambil dari `import-dpa.ts` atau
// `schemas.ts`, bundel browser ikut menyeret `ratelimit` → `ioredis` → `dns`
// dan build Next gagal "Module not found: Can't resolve 'dns'".
//
// Aturan berkas ini: HANYA boleh bergantung pada tipe dan `format.ts`. Jangan
// pernah menambah impor yang menyentuh basis data, Redis, atau `node:*`.
import type { DpaBarisInput, TipeBaris } from '@/types'
import { genRowId } from './format'

/**
 * Batas baris jalur SIMPAN — berlaku untuk `DpaBodySchema`, `PergeseranBodySchema`,
 * dan `InjectBodySchema`. Satu angka untuk semua jalur tulis BLUD.
 *
 * Dulu angka telanjang di Zod; diangkat ke sini sejak "Salin dari Tahun Lain" —
 * fitur itu bisa memuat isi tahun yang DIISI LEWAT IMPOR, jadi sebuah form
 * berisi ribuan baris bisa lahir tanpa menyentuh jalur impor sama sekali, dan
 * Simpan-nya ditolak sesudah orangnya terlanjur menyalin. Modal salinnya
 * memeriksa angka ini di muka; kalau angkanya cuma hidup di dalam Zod,
 * pemeriksaan itu jadi tebakan yang melenceng begitu batasnya diubah.
 *
 * 3.000 dipilih dari DPA BLUD tergemuk yang nyata (~2.500) plus ruang tumbuh.
 * Batas atasnya `bulkInsert`, yang menulis satu INSERT tunggal tanpa memecah
 * bongkahan — 3.000 × 20 kolom masih jauh di bawah `max_allowed_packet` 64 MB.
 * Yang justru lebih dulu mentok: `client_max_body_size` Nginx (bawaan 1 MB;
 * setel `10m` saat pemasangan) dan tabel DPA/Pergeseran yang belum
 * di-virtualisasi — di atas ~1.500 baris ketikan mulai terasa tersendat.
 */
export const BLUD_SIMPAN_MAKS_BARIS = 3000

/**
 * Batas baris jalur IMPOR. Dipakai parser DAN Zod — kalau keduanya berbeda,
 * pratinjau bisa menjanjikan "Simpan 1.200 baris" lalu simpannya ditolak,
 * setelah orang terlanjur memeriksa seluruh isinya.
 *
 * SENGAJA diturunkan dari batas simpan, bukan angka sendiri. Dulu impor 2.000
 * sementara simpan 700: DPA 1.500 baris bisa MASUK lewat impor lalu tidak bisa
 * disimpan lagi dari layar DPA sendiri — ubah satu sel, Simpan ditolak, tanpa
 * jalan keluar. Data yang bisa masuk wajib bisa keluar, jadi plafon impor tidak
 * boleh melampaui plafon simpan. Turunan, bukan salinan, supaya tidak bisa
 * melenceng lagi diam-diam.
 */
export const BLUD_IMPOR_MAKS_BARIS = BLUD_SIMPAN_MAKS_BARIS

/** Bentuk minimum yang dibutuhkan pemeta — dipenuhi `BarisTerbaca`. */
export interface BarisSiapPeta {
  barisExcel: number
  kode: string
  uraian: string
  vol: number | null
  satuan: string | null
  harga: number | null
  jumlahHitung: number
  penanggungJawab: string | null
  keterangan: string | null
  tipe_baris: TipeBaris
  indukBarisExcel: number | null
  jangkar: string | null
}

/** Bentuk siap simpan. `row_id` baru; jangkar dipakai ulang kalau berkasnya membawanya. */
export function keDpaBarisInput(baris: BarisSiapPeta[]): DpaBarisInput[] {
  const idDariBaris = new Map<number, string>()
  for (const b of baris) idDariBaris.set(b.barisExcel, genRowId())
  return baris.map((b, i) => ({
    kode_rekening: b.kode,
    uraian: b.uraian,
    vol: b.vol,
    satuan: b.satuan,
    harga: b.harga,
    jumlah: b.jumlahHitung,
    penanggung_jawab: b.penanggungJawab,
    keterangan: b.keterangan,
    tipe_baris: b.tipe_baris,
    row_id: idDariBaris.get(b.barisExcel)!,
    anggaran_key: b.jangkar,
    parent_id: b.indukBarisExcel != null ? idDariBaris.get(b.indukBarisExcel) ?? null : null,
    urutan: i,
    origin: 'MANUAL' as const,
  }))
}
