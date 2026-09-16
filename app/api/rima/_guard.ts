// app/api/rima/_guard.ts — penjaga sakelar RIMA. Cermin `app/api/blud/_guard.ts`,
// dengan satu beda pokok: RIMA tidak punya izin per-menu, jadi yang tinggal di sini
// hanya sakelarnya.
//
// Sampai 2026-09-16 `app_status_sentinel_bot` tidak dibaca satu pun berkas server —
// satu-satunya pembacanya `components/sentinel/SentinelProvider.tsx`, dan itu berjalan
// DI PERAMBAN. Mematikannya menyembunyikan tombol RIMA dan tidak menutup apa pun:
// siapa pun yang sudah login dan tahu alamat endpointnya tetap bisa memakainya. Bentuk
// T-1 yang sama, di tempat yang berbeda.
//
// Kuncinya diambil dari registry lewat `kunciSakelarLain`, BUKAN diketik di sini.
// Berjenjangnya (Tanya Data anak dari seluruh bot) hidup di satu tempat; route yang
// mengetik kuncinya sendiri akan lolos tsc dan lolos gate G — penjaganya memang ada,
// cuma kuncinya kurang satu — lalu diam-diam tetap hidup saat induknya dimatikan.
import { modulMati } from '@/lib/security/guard'
import { kunciSakelarLain } from '@/lib/registry/apps'

/**
 * Sakelar seluruh bot RIMA. Dipanggil di tiap handler jalur-data RIMA, sesudah
 * `getSession()` dan sebelum apa pun yang menyentuh data:
 *
 *   const mati = await rimaMati(session.role)
 *   if (mati) return mati
 *
 * `role` dioper supaya `PERAN_TEMBUS_SAKELAR` berlaku sama seperti di sembilan modul
 * lain (S1): SUPER_ADMIN tetap bisa mencoba RIMA selagi dimatikan untuk orang lain.
 */
export function rimaMati(role?: string) {
  return modulMati(kunciSakelarLain('app_status_sentinel_bot'), { role })
}

/**
 * Tanya Data — sakelarnya sendiri, DAN induknya. Satu panggilan, dua sakelar:
 * `kunciSakelarLain` yang menyisipkan kunci bot, jadi mematikan seluruh bot ikut
 * menutup pertanyaan-data. Sebelumnya keduanya berdiri sendiri, sehingga "matikan
 * seluruh bot" justru membiarkan terbuka bagian RIMA yang menyentuh data anggaran.
 */
export function rimaTanyaMati(role?: string) {
  return modulMati(kunciSakelarLain('app_status_rima_query'), { role })
}
