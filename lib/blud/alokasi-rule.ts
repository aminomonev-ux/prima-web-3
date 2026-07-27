// lib/blud/alokasi-rule.ts — hubungan antara arus kas dan baris anggaran.
// Konsep: docs/CONCEPT-blud-realisasi.md §4.2, §5.2 · docs/CONCEPT-blud-potongan.md
//
// Modul daun: TIDAK mengimpor apa pun (khususnya bukan `next/server` maupun
// lapisan data), supaya aturan yang sama dipakai Zod, data layer, DAN modal Buku
// Kas di browser tanpa menyeret kode server ke bundel klien.
//
// Satu predikat `sifatAlokasi` menjawab dua arah sekaligus, dan itu disengaja.
// Dulu hanya arah "wajib" yang dijaga (`jenis !== 'BELANJA'` → lolos), sehingga
// transaksi `LAIN` berkas_keluar besar tanpa alokasi menembus seluruh pagar pagu.
// Menambalnya hanya di arah itu meninggalkan kebalikannya terbuka: alokasi yang
// menempel pada transaksi yang TIDAK mengeluarkan uang tetap mengunci dan
// menggerus pagu — serapan naik tanpa belanja. Dua-duanya cacat yang sama dilihat
// dari sisi berbeda, jadi dijawab satu fungsi supaya tidak bisa lagi timpang.

export const JENIS_TRANSAKSI = [
  'BELANJA', 'AMBIL_BANK', 'SETOR_BANK', 'PENERIMAAN', 'LAIN', 'PENGEMBALIAN',
] as const
export type JenisTransaksi = typeof JENIS_TRANSAKSI[number]

/**
 * Jenis yang hanya memindahkan uang milik sendiri antar-tempat (bank↔kas). Arus
 * keluarnya bukan belanja — tapi justru karena itu keduanya wajib NETRAL: tanpa
 * syarat itu, pengecualian ini jadi pintu lain untuk mengeluarkan uang tanpa
 * membebani anggaran.
 */
export const JENIS_PEMINDAHAN: readonly JenisTransaksi[] = ['AMBIL_BANK', 'SETOR_BANK']

/** Toleransi pembulatan DECIMAL(18,2) — sama dengan ambang di tutup-kas.ts. */
const NOL = 0.005

export interface ArusKas {
  jenis: JenisTransaksi
  kas_masuk: number
  bank_masuk: number
  kas_keluar: number
  bank_keluar: number
  belum_berrekening?: boolean
}

/** Nilai yang membebani pagu — hanya arus keluar. */
export function nilaiBebanPagu(v: Pick<ArusKas, 'kas_keluar' | 'bank_keluar'>): number {
  return v.kas_keluar + v.bank_keluar
}

/** Nilai yang kembali ke kas — dipakai jenis PENGEMBALIAN untuk mengurangi serapan. */
export function nilaiArusMasuk(v: Pick<ArusKas, 'kas_masuk' | 'bank_masuk'>): number {
  return v.kas_masuk + v.bank_masuk
}

/** Uang yang masuk sama dengan yang keluar → benar-benar cuma pindah tempat. */
export function transferNetral(v: Omit<ArusKas, 'jenis' | 'belum_berrekening'>): boolean {
  return Math.abs(nilaiArusMasuk(v) - nilaiBebanPagu(v)) < NOL
}

/**
 * WAJIB        arus keluar → harus dibebankan, alokasi bernilai positif
 * WAJIB_KEMBALI pengembalian belanja → alokasi bernilai NEGATIF, mengurangi serapan
 * DILARANG     tidak boleh punya alokasi sama sekali
 */
export type SifatAlokasi = 'WAJIB' | 'WAJIB_KEMBALI' | 'DILARANG'

export function sifatAlokasi(v: ArusKas): SifatAlokasi {
  if (v.belum_berrekening) return 'DILARANG'
  if (v.jenis === 'PENGEMBALIAN') return nilaiArusMasuk(v) > 0 ? 'WAJIB_KEMBALI' : 'DILARANG'
  if (nilaiBebanPagu(v) <= 0) return 'DILARANG'
  if (JENIS_PEMINDAHAN.includes(v.jenis) && transferNetral(v)) return 'DILARANG'
  return 'WAJIB'
}

export function wajibBeralokasi(v: ArusKas): boolean {
  return sifatAlokasi(v) === 'WAJIB'
}

export function bolehBeralokasi(v: ArusKas): boolean {
  return sifatAlokasi(v) !== 'DILARANG'
}

/** Angka yang harus dicapai jumlah alokasi. Negatif = mengembalikan serapan. */
export function nilaiAlokasiSeharusnya(v: ArusKas): number {
  const sifat = sifatAlokasi(v)
  if (sifat === 'WAJIB') return nilaiBebanPagu(v)
  if (sifat === 'WAJIB_KEMBALI') return -nilaiArusMasuk(v)
  return 0
}

/** Sebab spesifik penolakan — pesan "tidak boleh" tanpa sebab tidak bisa ditindaklanjuti. */
export function alasanAlokasiDilarang(v: ArusKas): string {
  if (v.belum_berrekening) {
    return 'Transaksi diparkir belum punya rekening — hapus pembebanannya, '
      + 'alokasi menyusul setelah rekeningnya ada di DPA.'
  }
  if (v.jenis === 'PENGEMBALIAN') {
    return 'Pengembalian belanja harus ada uang masuknya sebelum bisa mengurangi serapan.'
  }
  if (JENIS_PEMINDAHAN.includes(v.jenis)) {
    return 'Ambil/setor bank yang netral hanya memindahkan uang milik sendiri — '
      + 'tidak membebani anggaran mana pun, jadi tidak boleh punya pembebanan.'
  }
  return 'Transaksi ini tidak mengeluarkan uang, jadi tidak ada yang bisa dibebankan '
    + 'ke baris anggaran. Untuk mengembalikan belanja, pilih jenis "Pengembalian belanja".'
}

// ─── Potongan pihak ketiga ──────────────────────────────────────────────────
//
// Pajak yang dipungut/dipotong dari pembayaran vendor (dan potongan lain seperti
// koperasi/Baznas) BUKAN transaksi tersendiri: uangnya ditahan dari pembayaran
// bruto lalu diteruskan pada hari yang sama, masuk dan keluar sama besar. Pagunya
// sudah habis di baris belanja induknya — mencatatnya sebagai transaksi terpisah
// berarti satu belanja menggerus anggaran dua kali. Karena itu ia disimpan sebagai
// RINCIAN transaksi belanja, dan baris masuk/keluar di BKU dibangkitkan saat cetak.

export const JENIS_POTONGAN = [
  'PPN', 'PPH_21', 'PPH_22', 'PPH_23', 'PPH_4_2', 'PPH_FINAL',
  'KOPERASI', 'BAZNAS', 'BPJS_TK', 'LAINNYA',
] as const
export type JenisPotongan = typeof JENIS_POTONGAN[number]

/** Yang masuk hitungan lembar Rekap Pajak — sisanya potongan non-pajak. */
export const POTONGAN_PAJAK: readonly JenisPotongan[] = [
  'PPN', 'PPH_21', 'PPH_22', 'PPH_23', 'PPH_4_2', 'PPH_FINAL',
]

export const LABEL_POTONGAN: Record<JenisPotongan, string> = {
  PPN: 'PPN',
  PPH_21: 'PPh 21',
  PPH_22: 'PPh 22',
  PPH_23: 'PPh 23',
  PPH_4_2: 'PPh Pasal 4(2)',
  PPH_FINAL: 'PPh final',
  KOPERASI: 'Koperasi',
  BAZNAS: 'Baznas',
  BPJS_TK: 'BPJS Ketenagakerjaan',
  LAINNYA: 'Lainnya',
}

export function potonganPajak(jenis: JenisPotongan): boolean {
  return POTONGAN_PAJAK.includes(jenis)
}

/** Hanya belanja sungguhan yang bisa dipotong — tidak ada yang bisa ditahan dari uang yang tidak dibayarkan. */
export function bolehBerpotongan(v: ArusKas): boolean {
  return sifatAlokasi(v) === 'WAJIB'
}
