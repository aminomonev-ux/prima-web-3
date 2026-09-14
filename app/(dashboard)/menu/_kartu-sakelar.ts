// app/(dashboard)/menu/_kartu-sakelar.ts — keadaan sakelar sebuah kartu /menu (Tahap 13, T18).
// Berkas DAUN: hanya mengimpor registry yang juga nol-impor, supaya aturannya bisa diuji
// sungguhan dari skrip, bukan dicocokkan ke teks komponen.

import { KUNCI_GLOBAL, sebabTerburuk, type KeadaanSakelar } from '@/lib/registry/apps';

/**
 * Hasil memuat `/api/admin/app-status`. Tiga keadaan, bukan "data atau objek kosong":
 * dulu kegagalan memuat meninggalkan `{}`, dan `sebabTerburuk` membaca kunci yang tak
 * ada sebagai `online` — jadi kartu modul yang sedang maintenance berbunyi LIVE persis
 * saat status aplikasinya tidak diketahui (terukur di sesi audit 2026-09-12).
 */
export type MuatSakelar =
  | { muat: 'memuat' }
  | { muat: 'gagal' }
  | { muat: 'ada'; data: Record<string, string> };

export type KeadaanKartu = KeadaanSakelar | 'memuat' | 'tak-terbaca';

export function sakelarKartu(
  status: MuatSakelar,
  id: string,
): { keadaan: KeadaanKartu; kunci: string } {
  const kunciModul = `app_status_${id}`;
  // Admin Panel tidak punya sakelar; ia tempat menyalakan kembali yang lain, jadi tidak
  // boleh ikut "tak terbaca" saat status gagal dimuat.
  if (id === 'admin') return { keadaan: 'online', kunci: kunciModul };
  if (status.muat === 'memuat') return { keadaan: 'memuat', kunci: kunciModul };
  if (status.muat === 'gagal') return { keadaan: 'tak-terbaca', kunci: kunciModul };
  const s = sebabTerburuk([
    [KUNCI_GLOBAL, status.data[KUNCI_GLOBAL]],
    [kunciModul, status.data[kunciModul]],
  ]);
  return { keadaan: s.keadaan, kunci: s.kunci ?? kunciModul };
}

/**
 * Hasil memuat `/api/user/access`. `null` pada `app_access` punya arti sah sendiri
 * (SUPER_ADMIN/ADMIN: semua modul terbuka), jadi kegagalan memuat tidak boleh ikut
 * menumpang `null` — dulu keduanya sama, dan kegagalan terbaca "semua terbuka".
 */
export type MuatAkses =
  | { muat: 'memuat' }
  | { muat: 'gagal' }
  | { muat: 'ada'; akses: string[] | null };

export function kartuTerkunci(akses: MuatAkses, id: string): boolean {
  if (id === 'admin') return false;
  if (akses.muat !== 'ada' || akses.akses === null) return false;
  return !akses.akses.includes(id);
}
