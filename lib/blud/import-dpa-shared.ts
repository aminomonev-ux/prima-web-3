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
 * Batas baris jalur IMPOR — lebih longgar dari batas 700 pada simpan manual,
 * karena satu berkas DPA provinsi wajar berisi ratusan sampai ribuan baris
 * (yang asli: 453, 466, 558).
 *
 * Angka ini dipakai parser DAN Zod. Kalau keduanya berbeda, pratinjau bisa
 * menjanjikan "Simpan 1.200 baris" lalu simpannya ditolak — setelah orang
 * terlanjur memeriksa seluruh isinya.
 *
 * 2.000 dipilih karena `bulkInsert` menulis satu INSERT tunggal tanpa memecah
 * bongkahan; 2.000 × 18 kolom masih jauh di bawah `max_allowed_packet`.
 */
export const BLUD_IMPOR_MAKS_BARIS = 2000

/**
 * Batas baris jalur SIMPAN biasa (`DpaBodySchema`). Dulu angka telanjang di Zod;
 * diangkat ke sini sejak "Salin dari Tahun Lain" — fitur itu bisa memuat isi
 * tahun yang DIISI LEWAT IMPOR, jadi sebuah form berisi >700 baris kini bisa
 * lahir tanpa menyentuh jalur impor sama sekali, dan Simpan-nya akan ditolak
 * sesudah orangnya terlanjur menyalin. Modal salinnya memeriksa angka ini di
 * muka; kalau angkanya cuma hidup di dalam Zod, pemeriksaan itu jadi tebakan
 * yang diam-diam melenceng begitu batasnya diubah.
 */
export const BLUD_SIMPAN_MAKS_BARIS = 700

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
