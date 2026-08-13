// app/api/kinerja/_guard.ts — sakelar maintenance modul E-Anggaran (Kinerja).
//
// T1: sebelum ini, mematikan modul dari Admin Panel hanya membuat kartunya abu di
// /menu. Mengetik /kinerja langsung — atau tab yang memang sudah terbuka — tetap
// bisa baca DAN tulis lewat 15 route di folder ini. Menyembunyikan menu bukan
// keamanan; pelajaran V3-1 yang sudah dipetik BLUD tapi tidak pernah menular ke sini.
//
// Kinerja sengaja TIDAK dipindah ke `buatGuardModul` seperti empat modul lain.
// Alasannya bukan kemalasan: 15 route di sini punya pagar peran yang lebih ketat di
// atas pagar modul (`SUPER_ADMIN` di /reset, `DELETE_ONLY_ROLES` di /master/[id]),
// dan migrasi mekanis 15 berkas adalah tempat paling mudah untuk tanpa sengaja
// melonggarkan salah satunya. Menambah satu baris ke tiap route tidak menyentuh
// logika peran yang sudah ada sama sekali. Penyeragaman ke pabrik guard boleh
// menyusul sebagai pekerjaan tersendiri, dengan pemeriksaan per-route.

import { modulMati } from '@/lib/security/guard';

export const FLAG_KINERJA = 'app_status_new_econtrolling';

/**
 * Dipanggil di TIAP route, sesudah `getSession()` dan sebelum apa pun yang
 * menyentuh data:
 *
 *   const mati = await kinerjaMati(session.role);
 *   if (mati) return mati;
 *
 * `role` dioper supaya PERAN_TEMBUS_SAKELAR (SUPER_ADMIN) tetap bisa masuk saat
 * maintenance — sama seperti di layar. Lupa mengopernya tidak menimbulkan error,
 * cuma membuat SUPER_ADMIN ikut tertolak 503.
 *
 * Balasannya 503, bukan 403: "modul sedang dimatikan admin" akan hilang sendiri,
 * "Anda tidak berhak" perlu minta akses. Dua hal berbeda, dua kode berbeda.
 */
export function kinerjaMati(role?: string) {
  return modulMati([FLAG_KINERJA], { role });
}
