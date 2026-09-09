// app/api/dashboard/_guard.ts — sakelar pemeliharaan modul Dashboard.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §17.2 Tahap 1 (A1), temuan T-1.
//
// Dashboard adalah kasus paling telanjang dari T-1: `app_status_dashboard` ada di
// whitelist `APP_KEYS` dan punya tombol di Admin Panel, tapi tidak dibaca oleh
// halaman maupun route mana pun. Mematikannya tidak menutup apa-apa.
//
// Modul ini READ-ONLY, dan itu tidak mengurangi alasan memasang pagarnya: sakelar
// pemeliharaan dipakai justru ketika angkanya sedang tidak bisa dipercaya (migrasi
// berjalan, sumbernya sedang diperbaiki). Laporan yang salah lebih berbahaya
// daripada laporan yang tidak bisa dibuka.
import { modulMati } from '@/lib/security/guard';

export const FLAG_DASHBOARD = 'app_status_dashboard';

/**
 * Dipanggil di TIAP handler, sesudah pagar akses dan sebelum kueri apa pun:
 *
 *   const mati = await dashboardMati(g.session.role)
 *   if (mati) return mati
 *
 * `role` WAJIB dioper supaya `PERAN_TEMBUS_SAKELAR` (SUPER_ADMIN) tetap bisa masuk
 * memeriksa saat modulnya dimatikan — sama seperti di layar.
 */
export function dashboardMati(role?: string) {
  return modulMati([FLAG_DASHBOARD], { role });
}
