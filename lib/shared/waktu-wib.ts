// lib/shared/waktu-wib.ts — stempel waktu WIB, satu sumber untuk semua modul.
//
// Lahir di `lib/blud/tanggal.ts` dan dipindah ke sini saat E-Anggaran butuh
// stempel yang sama untuk `kinerja_riwayat_simpan`. Dua modul yang memerlukan jam
// yang sama tidak boleh saling menjangkau ke berkas khas modul lain — pola yang
// sudah dipakai `toDateStr` dan `RIWAYAT_RETENSI`. `lib/blud/tanggal.ts`
// me-re-export keduanya supaya 20-an pemanggil lama tidak disentuh.

/** Selisih WIB terhadap UTC. */
export const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * 'YYYY-MM-DD HH:MM:SS' menurut WIB, siap masuk kolom DATETIME.
 *
 * BUKAN `NOW()` MySQL: server bisa berjalan di UTC, dan pada dini hari WIB
 * keduanya jatuh di tanggal yang berbeda — cukup untuk membuat sebuah snapshot
 * mengaku milik hari kemarin.
 *
 * @param sekarang epoch ms — parameter hanya untuk pengujian.
 */
export function waktuSekarangWIB(sekarang: number = Date.now()): string {
  return new Date(sekarang + JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
}
