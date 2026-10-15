// lib/blud/di-luar-pagu.ts — belanja yang rekeningnya tidak ada di versi pagu berlaku.
//
// Alokasi menempel ke `anggaran_key` versi saat transaksi dicatat. Kalau versi sesudahnya
// membuang rekening itu, uangnya tetap sudah keluar tapi tidak punya baris di pohon pagu —
// `gulungKeAtas` tidak bisa menaikkannya ke induk, jadi ia lenyap dari setiap total tanpa jejak.
// Dihitung supaya bisa DISEBUTKAN, bukan dijumlahkan ke serapan: menambahkannya membuat
// % serapan berdiri di atas penyebut yang tidak memuatnya (konsep beranda-serapan §9.1a).
//
// SATU aturan untuk Beranda, layar Realisasi, dan sumber BLUD di LKJIP — kalau disalin,
// ketiganya cepat atau lambat menyebut angka berbeda untuk tahun yang sama (L78).
// MURNI: aman klien & server.

import type { BarisPagu } from './pagu'
import { EPS_PRATINJAU } from './pratinjau-serapan'
import { formatRupiah } from './format'

/** Contoh rekening yang ikut disebut; sisanya cukup dihitung. */
export const BATAS_CONTOH_DI_LUAR_PAGU = 3

export interface RekeningDiLuarPagu {
  anggaran_key: string
  /** Dari versi TERAKHIR yang masih memuat rekening ini; kosong kalau tak ditemukan lagi. */
  kode: string
  uraian: string
  nilai: number
}

export interface DiLuarPagu {
  nilai: number
  rekening: number
  /** Nilai terbesar dulu, paling banyak `BATAS_CONTOH_DI_LUAR_PAGU`. */
  contoh: RekeningDiLuarPagu[]
}

export const DI_LUAR_PAGU_KOSONG: DiLuarPagu = { nilai: 0, rekening: 0, contoh: [] }

/**
 * `nilaiPerKunci` = SUM alokasi per `anggaran_key` (setahun atau s/d bulan — pemanggil yang
 * menentukan titik waktunya). Kode & uraian contoh diisi pemanggil server (`getRekeningLama`).
 */
export function hitungDiLuarPagu(
  baris: readonly Pick<BarisPagu, 'anggaran_key'>[],
  nilaiPerKunci: ReadonlyMap<string, number>,
): { nilai: number; kunci: { anggaran_key: string; nilai: number }[] } {
  const adaDiPohon = new Set(baris.map(b => b.anggaran_key))
  const kunci: { anggaran_key: string; nilai: number }[] = []
  let nilai = 0
  for (const [k, n] of nilaiPerKunci) {
    // Nol dilewati: rekening yang pengembaliannya menutup belanjanya bukan uang
    // yang hilang dari hitungan, dan menyebutnya cuma menambah kebisingan.
    if (adaDiPohon.has(k) || Math.abs(n) <= EPS_PRATINJAU) continue
    nilai += n
    kunci.push({ anggaran_key: k, nilai: n })
  }
  kunci.sort((a, b) => Math.abs(b.nilai) - Math.abs(a.nilai) || a.anggaran_key.localeCompare(b.anggaran_key))
  return { nilai, kunci }
}

const potong = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** "5.1.02.01 Biaya film badge (Rp 2.000.000)" — kode/uraian lama, atau penanda kalau tak dikenal. */
export function namaRekeningDiLuarPagu(r: RekeningDiLuarPagu): string {
  const nama = [r.kode, potong(r.uraian, 60)].filter(Boolean).join(' ') || 'rekening tanpa nama'
  return `${nama} (Rp ${formatRupiah(Math.round(r.nilai))})`
}

/** Contoh rekening + "dan n rekening lain" — dipakai layar Realisasi dan catatan LKJIP. */
export function daftarDiLuarPagu(d: DiLuarPagu): string {
  const sisa = d.rekening - d.contoh.length
  return d.contoh.map(namaRekeningDiLuarPagu).join('; ') + (sisa > 0 ? `; dan ${sisa} rekening lain` : '')
}

/** Satu kalimat untuk catatan tabel LKJIP — teks polos, tanpa tautan menu. */
export function kalimatDiLuarPagu(d: DiLuarPagu, sampai: string): string | null {
  if (!d.rekening) return null
  return `Belanja Rp ${formatRupiah(Math.round(d.nilai))} ${sampai} dari ${d.rekening} rekening yang sudah tidak ada di versi pagu ini `
    + `TIDAK ikut dihitung di tabel: ${daftarDiLuarPagu(d)}.`
}
