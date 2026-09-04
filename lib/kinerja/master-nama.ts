// lib/kinerja/master-nama.ts — aturan ganti nama baris Master E-Anggaran.
//
// PURE: tidak menyentuh DB — supaya aturannya bisa diuji perilakunya.
//
// MASALAHNYA (A3): hierarki master TIDAK disambung foreign key. Ia disambung
// TEKS NAMA — `kinerja_master.program_ref` / `.kegiatan_ref` / `.subkegiatan_ref`
// berisi NAMA induknya, bukan id-nya. Jadi mengganti nama induk membuat setiap
// anak menunjuk nama yang sudah tidak ada, dan MySQL tidak punya cara
// menolaknya sendiri. Jalur HAPUS sudah menyadari ini dan berpagar
// (`KinerjaMasterPunyaAnakError`); jalur ganti nama tidak punya apa pun.
//
// Konsep & contoh kasusnya: docs/AUDIT-kinerja-2026-09-04.md §A3

import type { MasterTipe } from '@/lib/data/kinerja';

/**
 * Tipe yang namanya dipikul anak lewat kolom `*_ref`.
 *
 * `uraian_ssk` dan `sumber_anggaran` daun — tidak ada yang menunjuk namanya di
 * `kinerja_master`, jadi ganti namanya tidak memutus apa pun. (Kolom
 * `kinerja_ssk.uraian_ssk` dan `kinerja_rekening.*` memang memuat teksnya, tapi
 * itu SALINAN hasil Inject Rekening — bukan penunjuk hidup. Keputusan yang sama
 * sudah ditulis di komentar `deleteMasterRow`, dan tidak diubah di sini.)
 */
export function punyaAnak(tipe: MasterTipe): boolean {
  return tipe === 'program' || tipe === 'kegiatan' || tipe === 'subkegiatan';
}

/**
 * Kaskade tidak boleh jalan kalau namanya dipikul lebih dari satu baris.
 *
 * Nama TIDAK unik (tidak ada `UNIQUE` di kolom `nama`). Kalau ada saudara yang
 * memikul nama yang sama, `UPDATE … SET program_ref = 'B' WHERE program_ref = 'A'`
 * akan ikut memindahkan anak milik saudara itu — dan itu kerusakan yang lebih
 * sulit dilacak daripada yang sedang diperbaiki.
 *
 * Pertanyaan yang sama sudah dihitung `deleteMasterRow` lewat kolom `sisa`.
 *
 * @param sisaNamaLama saudara setipe yang masih memikul nama LAMA
 * @param sisaNamaBaru saudara setipe yang sudah memikul nama BARU
 */
export type AlasanTolakGantiNama = 'lama-kembar' | 'baru-kembar' | null;

export function alasanTolakGantiNama(
  anak: number, sisaNamaLama: number, sisaNamaBaru: number,
): AlasanTolakGantiNama {
  // Tanpa anak tidak ada yang dipindahkan, jadi tidak ada yang bisa nyasar.
  // Menolaknya di sini cuma menghalangi pembetulan salah ketik yang tidak
  // merusak apa pun.
  if (anak === 0) return null;
  if (sisaNamaLama > 0) return 'lama-kembar';
  // Sesudah ganti nama, anak baris ini dan anak saudara bernama-baru itu
  // menunjuk teks yang sama dan tidak bisa dibedakan lagi. Ambiguitas yang
  // KITA ciptakan, bukan yang sudah ada.
  if (sisaNamaBaru > 0) return 'baru-kembar';
  return null;
}

export function pesanTolakGantiNama(
  alasan: Exclude<AlasanTolakGantiNama, null>, namaLama: string, namaBaru: string, anak: number,
): string {
  if (alasan === 'lama-kembar') {
    return `Nama "${namaLama}" dipakai lebih dari satu baris master, sedangkan ${anak} baris `
      + 'di bawahnya menempel ke NAMA itu — menggantinya akan ikut memindahkan anak milik baris '
      + 'yang lain. Samakan dulu penamaannya, atau pindahkan anaknya satu per satu.';
  }
  return `Sudah ada baris master lain bernama "${namaBaru}". Kalau baris ini ikut memakainya, `
    + `${anak} baris di bawahnya tidak bisa lagi dibedakan dari anak baris itu. Pakai nama lain.`;
}
