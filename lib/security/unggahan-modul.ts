// lib/security/unggahan-modul.ts — modul mana yang memiliki sebuah berkas unggahan.
//
// Dipakai DUA route: `/api/upload` (menulis) dan `/api/upload/download` (membaca). Keduanya
// di luar `dirApi` modul mana pun, jadi gate G tidak memindainya — sakelarnya dipasang
// tangan, dan daftar modulnya harus satu supaya unggah & unduh tidak berbeda pendapat (L78).
import { kunciSakelarUntuk } from '@/lib/registry/apps';
import type { DriveTujuan } from '@/lib/services/drive-tujuan';

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

const TUJUAN_MODUL: Record<ModulPengunggah, DriveTujuan> = {
  lkjip: 'lkjip', usulan_aset: 'usulan', buku_besar_aset: 'bba',
};

/**
 * Tujuan Drive unggahan sebuah modul; foldernya dijawab `folderUntuk()` (drive-tujuan.ts).
 * Modul tak dikenal (tab lama tanpa field `modul`) → lampiran usulan, folder umum yang dulu.
 */
export function tujuanUnggahan(modul: ModulPengunggah | null): DriveTujuan {
  return modul ? TUJUAN_MODUL[modul] : 'usulan';
}
