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

export interface RingkasSamakan {
  /** Baris bulan itu yang punya target DAN masih kosong. */
  kosong: number;
  /** Punya target tapi sudah ada isinya — sengaja tidak disentuh. */
  berisi: number;
}

export function ringkasSamakan(rows: RealRow[], bulan: number): RingkasSamakan {
  const kandidat = rows.filter(r => r.bulan === bulan && bisaSamakan(r));
  const kosong = kandidat.filter(r => (r.real_fisik || 0) === 0).length;
  return { kosong, berisi: kandidat.length - kosong };
}

/** Satu baris: menimpa isi yang ada — satu sel, diklik sengaja. */
export function samakanSatu(rows: RealRow[], idx: number): RealRow[] {
  return rows.map((r, i) => i === idx ? { ...r, real_fisik: r.target_rp || 0 } : r);
}

/**
 * Sebulan penuh: HANYA baris yang masih kosong.
 *
 * Menimpa ratusan angka ketikan tangan dengan satu klik menghilangkan kerja yang
 * baru ketahuan berhari-hari kemudian. Menimpa adalah keputusan lain, dan pantas
 * jadi pilihan terpisah — bukan efek samping tombol bernama "isi dari target".
 */
export function samakanSebulan(rows: RealRow[], bulan: number): RealRow[] {
  return rows.map(r =>
    r.bulan === bulan && bisaSamakan(r) && (r.real_fisik || 0) === 0
      ? { ...r, real_fisik: r.target_rp || 0 }
      : r);
}
