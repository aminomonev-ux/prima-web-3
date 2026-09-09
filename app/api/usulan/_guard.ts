// app/api/usulan/_guard.ts — sakelar pemeliharaan modul Usulan Kebutuhan.
// Konsep: docs/CONCEPT-pusat-akses-satu-pintu.md §17.2 Tahap 1 (A1), temuan T-1.
//
// Kenapa berkas ini baru lahir sekarang: `app_status_usulan_aset` sudah punya baris
// di `app_config`, sudah punya tombol di Admin Panel, dan sudah membuat kartunya abu
// di /menu — tapi tidak ada satu pun halaman atau route yang membacanya. Mematikan
// modul Usulan berarti "kartunya abu"; mengetik `/usulan-kebutuhan` langsung tetap
// masuk penuh, baca DAN tulis. Itu persis L72/T1, dan gate G tidak menangkapnya
// karena daftar modulnya ditulis tangan dan Usulan tidak ada di dalamnya.
//
// Sengaja TIDAK dilebur ke pemeriksaan peran yang sudah ada di tiap route: hasilnya
// akan jadi 403 padahal ini 503. "Modul sedang dimatikan" akan hilang sendiri;
// "Anda tidak berhak" perlu minta akses. Penerimanya harus bisa membedakan.
//
// Usulan tidak punya lapis izin per-menu seperti BLUD/PK — pagar perannya ditulis
// sebaris di tiap handler (isKasubag/isBidang/…). Jadi yang dibutuhkan di sini cuma
// sakelarnya; berkas ini sengaja tidak menumbuhkan lapis baru.
import { modulMati } from '@/lib/security/guard'

export const FLAG_USULAN = 'app_status_usulan_aset'

/**
 * Dipanggil di TIAP handler, sesudah `getSession()` dan sebelum apa pun yang
 * menyentuh data:
 *
 *   const mati = await usulanMati(session.role)
 *   if (mati) return mati
 *
 * `role` WAJIB dioper supaya `PERAN_TEMBUS_SAKELAR` (SUPER_ADMIN) tetap bisa masuk
 * memeriksa saat modulnya dimatikan — sama seperti di layar. Lupa mengopernya tidak
 * menimbulkan galat apa pun, cuma membuat SUPER_ADMIN ikut ditolak 503; yang
 * menangkapnya `scripts/test-sesi-dicabut.mts`, bukan tsc.
 */
export function usulanMati(role?: string) {
  return modulMati([FLAG_USULAN], { role })
}
