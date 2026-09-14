// app/(dashboard)/menu/_kartu-sakelar.ts — keadaan sakelar sebuah kartu /menu (Tahap 13, T18).
// Berkas DAUN: hanya mengimpor registry yang juga nol-impor, supaya aturannya bisa diuji
// sungguhan dari skrip, bukan dicocokkan ke teks komponen.

import {
  bacaKeadaan, kunciDenganGlobal, lingkupSakelarModul, sebabTerburuk, type KeadaanSakelar,
} from '@/lib/registry/apps';

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

/** Bagian modul (sub-sakelar) yang keadaannya lebih membatasi daripada kartunya. */
export type BagianKartu = { label: string; keadaan: KeadaanSakelar; kunci: string };

const PERINGKAT: Record<KeadaanSakelar, number> = { online: 0, readonly: 1, maintenance: 2 };

export function sakelarKartu(
  status: MuatSakelar,
  id: string,
): { keadaan: KeadaanKartu; kunci: string; sebagian: BagianKartu[] } {
  // T14 — kuncinya dari registry, tidak dirangkai `app_status_${id}` sebagai teks.
  const [utama, ...subLingkup] = lingkupSakelarModul(id);
  // Modul tanpa sakelar (Admin Panel) tempat menyalakan kembali yang lain: tidak pernah
  // ikut mati, dan tidak boleh ikut "tak terbaca" saat status gagal dimuat.
  if (!utama) return { keadaan: 'online', kunci: '', sebagian: [] };
  const kunciModul = utama.kunci[0];
  if (status.muat === 'memuat') return { keadaan: 'memuat', kunci: kunciModul, sebagian: [] };
  if (status.muat === 'gagal') return { keadaan: 'tak-terbaca', kunci: kunciModul, sebagian: [] };
  const s = sebabTerburuk(kunciDenganGlobal(utama.kunci).map((k) => [k, status.data[k]] as const));
  // T1 — sub-sakelar tidak mengubah keadaan KARTU (DPA tetap bisa dibuka saat Realisasi
  // dimatikan, jadi kartunya tidak boleh mengirim orang ke halaman pemeliharaan), tapi
  // kartunya wajib MENYEBUTNYA. Dulu Realisasi beku sendirian → kartu BLUD berbunyi LIVE.
  const sebagian: BagianKartu[] = subLingkup.flatMap((l) => {
    const kunciSub = l.kunci[l.kunci.length - 1];
    const k = bacaKeadaan(status.data[kunciSub]);
    return PERINGKAT[k] > PERINGKAT[s.keadaan] ? [{ label: l.label, keadaan: k, kunci: kunciSub }] : [];
  });
  return { keadaan: s.keadaan, kunci: s.kunci ?? kunciModul, sebagian };
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
