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
    // `null` apa adanya — ini SATU-SATUNYA tempat baris Pergeseran server→klien
    // dipetakan, dan kolom yang lupa didaftar di sini terbuang senyap lalu
    // terkirim balik sebagai "tidak ada" (CLAUDE.md).
    bertambah:           d.bertambah,
    berkurang:           d.berkurang,
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
 * "Generate" di layar Pergeseran: salinan DPA sebagai titik awal. Jangkarnya
 * ikut terbawa, sebab ini baris yang sama, bukan baris yang baru lahir.
 *
 * Kolom P adalah salinan PENUH kolom DPA, bukan kolom kosong. Dulu keduanya
 * `null`, dan itu bukan "belum digeser" melainkan "pagunya dinolkan":
 * `recalcPergeseranJumlah` menghitung `pergeseran = vol_p × harga_p`, jadi
 * tabel yang baru disalin melaporkan seluruh DPA-nya lenyap dan Simpan ditolak
 * PERGESERAN_TIDAK_BERIMBANG sebelum satu angka pun digeser. Lebih jauh lagi:
 * begitu satu versi Pergeseran tersimpan, `getPaguEfektif` membaca pagu tahun
 * itu dari kolom `pergeseran` — nol di situ berarti Realisasi & Buku Kas
 * menolak belanja di hampir semua rekening.
 *
 * Konsekuensinya "belum digeser" kini dikenali dari `vol_p`/`harga_p` yang
 * masih sama persis dengan `vol`/`harga` — dipakai `injectDpaKePergeseran`
 * untuk memutuskan baris mana yang boleh ikut DPA baru.
 */
export function dpaKePergeseranInput(d: DpaBaris, urutan: number): PergeseranBarisInput {
  return {
    kode_rekening:       d.kode_rekening,
    uraian:              d.uraian,
    vol:                 d.vol,
    satuan:              d.satuan,
    harga:               d.harga,
    jumlah:              d.jumlah,
    vol_p:               d.vol,
    harga_p:             d.harga,
    pergeseran:          d.jumlah,
    bertambah_berkurang: 0,
    // Salinan DPA — belum digeser sama sekali, jadi belum ada yang diuraikan.
    bertambah:           null,
    berkurang:           null,
    penanggung_jawab:    d.penanggung_jawab ?? '',
    keterangan:          d.keterangan ?? '',
    tipe_baris:          d.tipe_baris,
    row_id:              d.row_id || `row_${urutan}`,
    anggaran_key:        d.anggaran_key ?? null,
    parent_id:           d.parent_id,
    urutan,
  }
}

// ─── SALIN DARI TAHUN LAIN ───────────────────────────────────────────────────
// Dua mapper di bawah ini kebalikan `dpaKePergeseranInput` di atas dalam satu hal
// yang menentukan: di sana `anggaran_key` SENGAJA dibawa karena itu baris yang
// sama; di sini SENGAJA dibuang karena tahunnya beda. Jangkar itu mengikat baris
// ke realisasi/SPJ tahun sumber — membawanya berarti belanja 2027 dilaporkan ke
// pos 2026. Jejak `origin`/`usulan_*` juga dilepas: baris tahun baru tidak pernah
// lewat putusan Usulan tahun lama.
//
// `row_id` disalin apa adanya, TANPA nilai cadangan. Mengarang id di sini akan
// memutus `parent_id` anak-anaknya yang masih menunjuk id lama; kalau sampai ada
// yang kosong, `validateTreeIntegrity` menolaknya di server — gagal bersuara,
// bukan gagal diam-diam.

/** Baris DPA tahun sumber → titik awal form DPA tahun berikutnya. */
export function dpaKeTahunBaruInput(d: DpaBaris, urutan: number): DpaBarisInput {
  return {
    kode_rekening:    d.kode_rekening,
    uraian:           d.uraian,
    vol:              d.vol,
    satuan:           d.satuan,
    harga:            d.harga,
    jumlah:           d.jumlah,
    penanggung_jawab: d.penanggung_jawab ?? '',
    keterangan:       d.keterangan ?? '',
    tipe_baris:       d.tipe_baris,
    row_id:           d.row_id,
    anggaran_key:     null,
    parent_id:        d.parent_id,
    urutan,
    origin:           'MANUAL',
    usulan_item_id:   null,
    usulan_no:        null,
  }
}

/**
 * Baris Pergeseran tahun sumber → titik awal form DPA tahun berikutnya, memakai
 * pagu PASCA-geser.
 *
 * Bisa satu lawan satu karena `pergeseran_dpa` menyimpan pasangan vol/harga
 * sendiri: `pergeseran = vol_p × harga_p` (`recalcPergeseranJumlah`), invarian
 * yang sama persis dengan `jumlah = vol × harga` di DPA (`recalcDpaJumlah`).
 * Jadi `jumlah` yang disalin di sini akan dihitung ulang server jadi angka yang
 * identik. Kalau `pergeseran` dulu angka ketikan bebas, salinan ini akan ditimpa
 * balik jadi vol × harga lama tanpa pesan apa pun — itu yang tidak terjadi.
 *
 * `satuan` diambil apa adanya (Pergeseran tidak punya `satuan_p` — satuannya
 * memang cermin DPA), dan `bertambah_berkurang` tidak dibawa sama sekali:
 * selisih terhadap DPA hanya bermakna di dalam tahunnya sendiri. Alasan yang
 * sama membuang `bertambah`/`berkurang` — uraian geseran tahun lalu tidak
 * menjelaskan apa pun tentang pagu awal tahun baru. Tipe tujuannya
 * `DpaBarisInput` yang memang tidak punya kolom itu, jadi ini terjaga sendiri.
 */
export function pergeseranKeTahunBaruInput(d: PergeseranBaris, urutan: number): DpaBarisInput {
  return {
    kode_rekening:    d.kode_rekening,
    uraian:           d.uraian,
    vol:              d.vol_p,
    satuan:           d.satuan,
    harga:            d.harga_p,
    jumlah:           d.pergeseran,
    penanggung_jawab: d.penanggung_jawab ?? '',
    keterangan:       d.keterangan ?? '',
    tipe_baris:       d.tipe_baris,
    row_id:           d.row_id,
    anggaran_key:     null,
    parent_id:        d.parent_id,
    urutan,
    origin:           'MANUAL',
    usulan_item_id:   null,
    usulan_no:        null,
  }
}
