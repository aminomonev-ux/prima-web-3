// lib/kinerja/master-nama.ts — aturan nama & induk baris Master E-Anggaran.
//
// PURE: tidak menyentuh DB — dipakai server DAN layar (Master, Rekening).
//
// Hierarki master TIDAK disambung foreign key, melainkan TEKS NAMA:
// `kinerja_master.program_ref` / `.kegiatan_ref` / `.subkegiatan_ref` berisi NAMA
// induknya. Ganti nama / pindah induk beserta jalarannya ke Rekening, RKO, dan
// Realisasi ada di `master-ubah.ts`.

import type { MasterTipe } from '@/lib/data/kinerja';

/**
 * Tipe yang namanya dipikul anak lewat kolom `*_ref`. `uraian_ssk` dan
 * `sumber_anggaran` daun — tidak ada baris master yang menunjuk namanya.
 */
export function punyaAnak(tipe: MasterTipe): boolean {
  return tipe === 'program' || tipe === 'kegiatan' || tipe === 'subkegiatan';
}

/**
 * Bintang penanda tingkat di ujung nama — format matriks Renaksi resmi (`*` tujuan …
 * `*****` sub kegiatan) yang ikut tersimpan lewat Init Renaksi. Bukan bagian nama:
 * "PROGRAM X ***" dan "PROGRAM X" entri yang sama, dan memperlakukannya berbeda
 * memecah satu program jadi dua kelompok di Cetak Rekap.
 */
export function buangBintang(nama: string): string {
  return nama.replace(/[\s*]+$/u, '').trim();
}

export interface IndukMaster {
  program_ref: string | null;
  kegiatan_ref: string | null;
  subkegiatan_ref: string | null;
}

/**
 * Entri tampil di bawah induk terpilih bila setiap kolom induknya KOSONG atau SAMA.
 * Satu aturan untuk pilihan berantai di tab Master & Rekening, pagar pindah induk,
 * dan "Lengkapi Master" (L78). Pilihan Kegiatan di tab Rekening dulu memeriksa baris
 * PERTAMA yang bernama sama, jadi kegiatan senama di program lain ikut hilang/tampil.
 */
export function cocokInduk(
  e: IndukMaster,
  induk: { program?: string | null; kegiatan?: string | null; subkegiatan?: string | null },
): boolean {
  const pas = (ref: string | null, v: string | null | undefined) => !v || !ref || ref === v;
  return pas(e.program_ref, induk.program) && pas(e.kegiatan_ref, induk.kegiatan)
    && pas(e.subkegiatan_ref, induk.subkegiatan);
}

/** Nama unik dengan urutan kemunculan — dua entri senama di induk berbeda cukup satu pilihan. */
export function namaUnik(rows: readonly { nama: string }[]): string[] {
  return [...new Set(rows.map(r => r.nama))];
}
