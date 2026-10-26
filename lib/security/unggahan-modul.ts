// lib/security/unggahan-modul.ts — modul mana yang memiliki sebuah berkas unggahan.
//
// Dipakai DUA route: `/api/upload` (menulis) dan `/api/upload/download` (membaca). Keduanya
// di luar `dirApi` modul mana pun, jadi gate G tidak memindainya — sakelarnya dipasang
// tangan, dan daftar modulnya harus satu supaya unggah & unduh tidak berbeda pendapat (L78).
import { kunciSakelarUntuk } from '@/lib/registry/apps';

export const MODUL_PENGUNGGAH = ['lkjip', 'usulan_aset', 'buku_besar_aset'] as const;
export type ModulPengunggah = (typeof MODUL_PENGUNGGAH)[number];

/** Nilai dari klien atau kolom `uploaded_files.context` → modul yang dikenal, atau `null`. */
export function modulPengunggah(nilai: unknown): ModulPengunggah | null {
  return MODUL_PENGUNGGAH.find((m) => m === nilai) ?? null;
}

/**
 * Modul tidak diketahui (tab lama tanpa field `modul`, atau berkas yang diunggah sebelum
 * kolomnya diisi) → SEMUA sakelar pemakainya ditanya. Lebih membatasi daripada menebak.
 */
export function kunciSakelarBerkas(modul: ModulPengunggah | null): string[] {
  return modul
    ? kunciSakelarUntuk(modul)
    : [...new Set(MODUL_PENGUNGGAH.flatMap((m) => kunciSakelarUntuk(m)))];
}

const ENV_FOLDER_KHUSUS: Partial<Record<ModulPengunggah, string>> = {
  buku_besar_aset: 'GOOGLE_DRIVE_FOLDER_ID_BBA',
};

/**
 * Folder Drive tujuan unggahan. Modul berfolder khusus yang env-nya belum diisi jatuh ke
 * folder umum `GOOGLE_DRIVE_FOLDER_ID` — server yang belum menyetelnya tetap bisa mengunggah.
 */
export function folderUnggahan(modul: ModulPengunggah | null, env: Record<string, string | undefined> = process.env): string {
  const kunci = modul ? ENV_FOLDER_KHUSUS[modul] : undefined;
  return (kunci ? env[kunci]?.trim() : '') || (env.GOOGLE_DRIVE_FOLDER_ID?.trim() ?? '');
}
