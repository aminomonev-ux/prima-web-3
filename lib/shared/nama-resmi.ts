// lib/shared/nama-resmi.ts — nama sasaran/program & indikator tanpa penanda matriks Renaksi.
//
// PURE, tanpa impor: dipakai server (route tarik PK, docgen Word) DAN layar (tombol Rapikan Nama).
//
// Matriks Renaksi resmi menandai tingkat dengan bintang di ujung nama (`*` tujuan … `*****`
// sub kegiatan) dan mengurutkan indikator dengan awalan `(1)`, `(2)`. Keduanya turunan dari
// tingkat & urutan, bukan bagian nama — dokumen Perjanjian Kinerja resmi tidak memuatnya.

/** Deret bintang (boleh berselang spasi) di UJUNG KANAN saja; bintang di tengah nama tidak disentuh. */
export function buangBintangUjung(s: string): string {
  return s.replace(/[\s*]+$/u, '').trim();
}

/** Nama yang isinya hanya bintang dikembalikan apa adanya: nama kosong ditolak Zod tanpa penjelasan. */
export function rapikanNamaEntitas(s: string): string {
  return buangBintangUjung(s) || s.trim();
}

/**
 * Indikator: bintang di ujung + awalan `(1)`–`(99)` dibuang. `(n)` di tengah atau di ujung
 * teks ("Kelas (3)") tidak disentuh. Pola awalannya berulang supaya hasilnya idempoten.
 */
export function rapikanIndikator(s: string): string {
  const tanpaBintang = buangBintangUjung(s);
  return tanpaBintang.replace(/^(?:\s*\(\d{1,2}\)\s+)+/u, '') || tanpaBintang || s.trim();
}

export const rapikanNamaAtauNull = (s: string | null | undefined): string | null =>
  s == null ? null : rapikanNamaEntitas(s);

export const rapikanIndikatorAtauNull = (s: string | null | undefined): string | null =>
  s == null ? null : rapikanIndikator(s);
