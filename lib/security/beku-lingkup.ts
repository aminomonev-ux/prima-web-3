// lib/security/beku-lingkup.ts — pilih keterangan beku untuk menu yang sedang dibuka (Tahap 14a).
// BERKAS DAUN: hanya TIPE dari `beku.ts` (terhapus saat kompilasi), aman untuk shell klien.
//
// Layout tidak tahu layar mana yang dibuka, jadi ia menyelesaikan SEMUA lingkup sakelar
// modulnya (`lingkupSakelarModul`) dan shell memilih lewat menu aktif. Tanpa ini layout
// BLUD cuma bertanya ke `app_status_blud`, dan Realisasi yang dibekukan sendirian tidak
// memunculkan satu spanduk pun di Buku Kas (T1).
import type { InfoBeku } from './beku'

export type BekuLingkup = { menu: readonly string[] | null; info: InfoBeku }

/** Lingkup sub yang menaungi `menu` lebih dulu; kalau tidak ada, lingkup seluruh modul. */
export function bekuUntukMenu(lingkup: readonly BekuLingkup[], menu: string): InfoBeku | null {
  const sub = lingkup.find((l) => l.menu?.includes(menu))
  return (sub ?? lingkup.find((l) => l.menu === null))?.info ?? null
}
