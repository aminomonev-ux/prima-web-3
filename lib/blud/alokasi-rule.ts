// lib/blud/alokasi-rule.ts — aturan "uang keluar wajib punya rekening".
// Konsep: docs/CONCEPT-blud-realisasi.md §4.2, §5.2
//
// Modul daun: TIDAK mengimpor apa pun (khususnya bukan `next/server` maupun
// lapisan data), supaya aturan yang sama bisa dipakai Zod, data layer, DAN modal
// Buku Kas di browser tanpa menyeret kode server ke bundel klien.
//
// Sebelumnya pengecualian pagar alokasi berbunyi `jenis !== 'BELANJA'`, dan itu
// bocor: satu transaksi `LAIN` dengan kas_keluar besar dan alokasi kosong lolos
// seluruh pagar pagu, tersimpan berstatus NORMAL (jadi tidak menghalangi Tutup
// Kas seperti transaksi terparkir), dan tidak pernah muncul di layar Realisasi —
// uang keluar yang tidak membebani anggaran mana pun. Jalan keluar sah untuk
// "rekeningnya memang belum ada di DPA" tetap satu: parkir (§4.2), yang sengaja
// memblokir Tutup Kas sampai dibereskan.

export const JENIS_TRANSAKSI = ['BELANJA', 'AMBIL_BANK', 'SETOR_BANK', 'PENERIMAAN', 'LAIN'] as const
export type JenisTransaksi = typeof JENIS_TRANSAKSI[number]

/**
 * Jenis yang hanya memindahkan uang milik sendiri antar-tempat (bank↔kas). Arus
 * keluarnya bukan belanja — tapi justru karena itu keduanya wajib NETRAL: tanpa
 * syarat itu, pengecualian ini jadi pintu lain untuk mengeluarkan uang tanpa
 * membebani anggaran, persis lubang yang sedang ditutup.
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

/** Uang yang masuk sama dengan yang keluar → benar-benar cuma pindah tempat. */
export function transferNetral(v: Omit<ArusKas, 'jenis' | 'belum_berrekening'>): boolean {
  return Math.abs((v.kas_masuk + v.bank_masuk) - (v.kas_keluar + v.bank_keluar)) < NOL
}

/**
 * Aturan tunggalnya: setiap arus keluar wajib dibebankan ke baris anggaran,
 * kecuali (a) transaksi diparkir, atau (b) pemindahan bank↔kas yang netral.
 */
export function wajibBeralokasi(v: ArusKas): boolean {
  if (v.belum_berrekening) return false
  if (nilaiBebanPagu(v) <= 0) return false
  return !(JENIS_PEMINDAHAN.includes(v.jenis) && transferNetral(v))
}
