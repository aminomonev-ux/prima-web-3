// app/api/blud/realisasi/_guard.ts — gerbang akses route Realisasi BLUD.
// Konsep: docs/CONCEPT-blud-realisasi.md §7.4 · docs/CONCEPT-blud-peran.md §5.4
//
// Sejak pembagian peran, izin tidak lagi seragam untuk seluruh modul Realisasi:
// berkas di bawah folder ini menyentuh EMPAT menu berbeda (buku-kas, tutup-kas,
// realisasi, cetak), dan `realisasi/permintaan` bahkan dua menu dalam satu berkas.
// Karena itu `menu` jadi parameter wajib — bukan demi keluwesan, melainkan supaya
// tsc menunjukkan setiap tempat yang harus memutuskan miliknya menu apa.
export { unauthorized, forbidden, tolakEdit } from '../_guard'
import { bolehBukaMenu, bolehEditMenu, bludMati } from '../_guard'
import type { MenuBlud } from '@/lib/blud/peran'

/**
 * S4 — sakelar mati untuk route Realisasi: memeriksa flag BLUD *dan* flag
 * Realisasi sekaligus. Diekspor ulang di sini supaya route di folder ini tidak
 * perlu mengingat harus menyebut lingkupnya — lupa menyebut = sub-modul ini tidak
 * bisa dimatikan sendiri, dan itu jenis kelalaian yang tidak menimbulkan error.
 */
export function realisasiMati() {
  return bludMati('realisasi')
}

export async function bolehLihat(userId: number, role: string, menu: MenuBlud): Promise<boolean> {
  return bolehBukaMenu(userId, role, menu)
}

export async function bolehInput(userId: number, role: string, menu: MenuBlud): Promise<boolean> {
  return bolehEditMenu(userId, role, menu)
}
