// lib/blud/row-map.ts — satu-satunya tempat baris DPA/Pergeseran dari server
// diubah jadi baris yang dipegang klien.
//
// Ada karena pernah salah: dulu tiap layar menyusun ulang barisnya sendiri dengan
// daftar kolom yang ditulis tangan. Kolom yang tidak masuk daftar ikut terbuang
// diam-diam, lalu terkirim balik ke server sebagai "tidak ada" — `anggaran_key`
// (jangkar realisasi, CONCEPT-blud-realisasi §2.3) dan jejak `origin`/`usulan_*`
// dua-duanya pernah hilang begitu. Tipe opsional membuat `tsc` tidak protes, dan
// layar tetap terlihat wajar; yang rusak baru ketahuan jauh di belakang.
//
// Aturannya sekarang: tambah kolom pada baris DPA/Pergeseran = ubah berkas INI.
// Jangan menyusun ulang baris di tempat lain.

import type {
  DpaBaris, DpaBarisInput, PergeseranBaris, PergeseranBarisInput,
} from '@/types'

/** Baris DPA dari server → baris yang bisa disunting klien. */
export function dpaKeInput(d: DpaBaris): DpaBarisInput {
  return {
    kode_rekening:    d.kode_rekening,
    uraian:           d.uraian,
    vol:              d.vol,
    satuan:           d.satuan,
    harga:            d.harga,
    jumlah:           d.jumlah,
    // String kosong, bukan null: keduanya terikat langsung ke <input>.
    penanggung_jawab: d.penanggung_jawab ?? '',
    keterangan:       d.keterangan ?? '',
    tipe_baris:       d.tipe_baris,
    row_id:           d.row_id || `row_${d.id}`,
    anggaran_key:     d.anggaran_key ?? null,
    parent_id:        d.parent_id,
    urutan:           d.urutan,
    origin:           d.origin ?? 'MANUAL',
    usulan_item_id:   d.usulan_item_id ?? null,
    usulan_no:        d.usulan_no ?? null,
  }
}

/** Baris Pergeseran dari server → baris yang bisa disunting klien. */
export function pergeseranKeInput(d: PergeseranBaris): PergeseranBarisInput {
  return {
    kode_rekening:       d.kode_rekening,
    uraian:              d.uraian,
    vol:                 d.vol,
    satuan:              d.satuan,
    harga:               d.harga,
    jumlah:              d.jumlah,
    vol_p:               d.vol_p,
    harga_p:             d.harga_p,
    pergeseran:          d.pergeseran,
    bertambah_berkurang: d.bertambah_berkurang,
    // String kosong, bukan null: keduanya terikat langsung ke <input>.
    penanggung_jawab:    d.penanggung_jawab ?? '',
    keterangan:          d.keterangan ?? '',
    tipe_baris:          d.tipe_baris,
    row_id:              d.row_id || `row_${d.id}`,
    anggaran_key:        d.anggaran_key ?? null,
    parent_id:           d.parent_id,
    urutan:              d.urutan,
  }
}

/**
 * "Generate" di layar Pergeseran: salinan DPA sebagai titik awal. Kolom P
 * sengaja kosong — yang menggeser manusia. Jangkarnya ikut terbawa, sebab ini
 * baris yang sama, bukan baris yang baru lahir.
 */
export function dpaKePergeseranInput(d: DpaBaris, urutan: number): PergeseranBarisInput {
  return {
    kode_rekening:       d.kode_rekening,
    uraian:              d.uraian,
    vol:                 d.vol,
    satuan:              d.satuan,
    harga:               d.harga,
    jumlah:              d.jumlah,
    vol_p:               null,
    harga_p:             null,
    pergeseran:          0,
    bertambah_berkurang: 0,
    penanggung_jawab:    d.penanggung_jawab ?? '',
    keterangan:          d.keterangan ?? '',
    tipe_baris:          d.tipe_baris,
    row_id:              d.row_id || `row_${urutan}`,
    anggaran_key:        d.anggaran_key ?? null,
    parent_id:           d.parent_id,
    urutan,
  }
}
