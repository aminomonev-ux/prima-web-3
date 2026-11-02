// lib/kinerja/samakan-target.ts — aturan tombol "Samakan dengan Target" di kolom
// Real Fisik tab Realisasi. PURE, dipisah dari komponen supaya bisa diuji
// perilakunya, bukan dicocokkan ke teks sumbernya.
//
// Angka yang dipakai adalah `target_rp` — RUPIAH milik RKO bulan itu — BUKAN
// `target_fisik` yang sudah dibulatkan 2 desimal. Keduanya kelihatan setara
// (`round(persen/100 × pagu)` vs `months[m]`), tapi hanya yang rupiah membuat
// `pct_fisik` keluar PERSIS sama dengan `target_fisik`: keduanya
// `round(x / pagu × 10000) / 100` dari bilangan yang sama. Tombol bernama
// "samakan" yang menghasilkan angka tidak sama adalah cacat yang paling
// menyusahkan dilacak nanti.

import type { RealRow } from '@/app/(dashboard)/kinerja/_types';

/**
 * Baris yang punya target untuk disalin.
 *
 * Pagu 0 dikecualikan bukan karena "tidak boleh", tapi karena mengisi 0 dengan 0
 * tidak melakukan apa pun — tombolnya cuma jadi kebisingan di baris yang di
 * layar nyata jumlahnya bisa 9 dari 14. Yatim dikecualikan karena targetnya
 * memang tidak ada.
 */
export function bisaSamakan(r: RealRow): boolean {
  return (r.pagu_awal || 0) > 0 && (r.target_rp || 0) > 0 && !r.yatim;
}

const kosong = (r: RealRow) => (r.real_fisik || 0) === 0;
// Per sen: real_fisik DECIMAL(18,2), target_rp rupiah RKO.
const samaTarget = (r: RealRow) =>
  Math.round((r.real_fisik || 0) * 100) === Math.round((r.target_rp || 0) * 100);

export interface RingkasSamakan {
  /** Baris bulan itu yang punya target DAN masih kosong. */
  kosong: number;
  /** Sudah berisi angka yang sama dengan targetnya — tidak ada yang perlu diubah. */
  sama: number;
  /** Berisi angka LAIN — bisa target yang sudah berubah, bisa realisasi asli yang diketik. */
  berbeda: RealRow[];
}

export function ringkasSamakan(rows: RealRow[], bulan: number): RingkasSamakan {
  const kandidat = rows.filter(r => r.bulan === bulan && bisaSamakan(r));
  const nKosong = kandidat.filter(kosong).length;
  const berbeda = kandidat.filter(r => !kosong(r) && !samaTarget(r));
  return { kosong: nKosong, sama: kandidat.length - nKosong - berbeda.length, berbeda };
}

/** Satu baris: menimpa isi yang ada — satu sel, diklik sengaja. */
export function samakanSatu(rows: RealRow[], idx: number): RealRow[] {
  return rows.map((r, i) => i === idx ? { ...r, real_fisik: r.target_rp || 0 } : r);
}

/**
 * Sebulan penuh: bawaannya HANYA baris yang masih kosong; `timpa` ikut menyamakan
 * baris yang sudah berisi angka lain.
 *
 * Sistem tidak bisa membedakan "dulu diisi dari target lama" dari "realisasi asli
 * yang diketik" (GAJI 2026: 62 dari 180 baris memang berbeda dari targetnya), jadi
 * menimpa tidak pernah jadi efek samping — pemanggil yang memutuskan, sesudah
 * pemakainya melihat baris mana yang akan berubah (`ringkasSamakan().berbeda`).
 */
export function samakanSebulan(rows: RealRow[], bulan: number, timpa = false): RealRow[] {
  return rows.map(r =>
    r.bulan === bulan && bisaSamakan(r) && !samaTarget(r) && (timpa || kosong(r))
      ? { ...r, real_fisik: r.target_rp || 0 }
      : r);
}
