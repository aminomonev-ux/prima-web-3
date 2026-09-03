// lib/kinerja/cetak-detail.ts — baris JUMLAH view "Detail" Cetak E-Anggaran.
// PURE, dipisah dari JSX supaya layar, Excel, dan PDF memakai satu rumus.
//
// Sebelumnya rumus ini hidup di dalam JSX CetakTab dan LUPUT dari audit
// perhitungan — padahal ia memuat DUA cacat yang sama persis dengan yang sudah
// dibereskan di view Rekap:
//
//  1. Target rupiah diturunkan dari `target_fisik` (PERSEN yang sudah dibulatkan
//     2 desimal) alih-alih dijumlah dari `target_rp`. Sama dengan T5.
//  2. Deviasi dikurangkan dari dua angka yang SUDAH dibulatkan
//     (`totAkumPF - totAkumTgt`), padahal `kinerja-calc.ts` & `_utils.ts`
//     melarangnya. Sama dengan T3.
//
// Keduanya diperbaiki di sini. Itu berarti baris JUMLAH bisa bergeser ~0,01%
// dari cetakan lama — konsekuensi yang sama dengan Tahap 5.

import type { RealRow } from '@/app/(dashboard)/kinerja/_types';

export interface JumlahBulan {
  pagu:        number;
  /** Target bulan itu dalam RUPIAH — angka yang menopang `targetPct`. */
  targetRp:    number;
  /** Akumulasi target s/d bulan itu, rupiah — penopang `akumTgtPct` & deviasi. */
  akumTgtRp:   number;
  targetPct:   number;
  realFisik:   number;
  pctFisik:    number;
  akumTgtPct:  number;
  akumFisik:   number;
  akumPctF:    number;
  realKeu:     number;
  pctKeu:      number;
  akumKeu:     number;
  akumPctKeu:  number;
  devFisik:    number;
  devKeu:      number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function hitungJumlahBulan(rows: RealRow[]): JumlahBulan {
  let pagu = 0, tgtRp = 0, akumTgtRp = 0;
  let realFisik = 0, akumFisik = 0, realKeu = 0, akumKeu = 0;
  for (const r of rows) {
    pagu      += r.pagu_awal      || 0;
    tgtRp     += r.target_rp      || 0;
    akumTgtRp += r.akum_target_rp || 0;
    realFisik += r.real_fisik     || 0;
    akumFisik += r.akum_real_fisik|| 0;
    realKeu   += r.real_keuangan  || 0;
    akumKeu   += r.akum_keuangan  || 0;
  }
  const pct = (v: number) => pagu > 0 ? (v / pagu) * 100 : 0;
  // Deviasi dari rasio MENTAH, dibulatkan sekali — bukan selisih dua angka bulat.
  const akumTgtRaw = pct(akumTgtRp), akumFisikRaw = pct(akumFisik), akumKeuRaw = pct(akumKeu);
  return {
    pagu,
    targetRp:   tgtRp,
    akumTgtRp,
    targetPct:  r2(pct(tgtRp)),
    realFisik,
    pctFisik:   r2(pct(realFisik)),
    akumTgtPct: r2(akumTgtRaw),
    akumFisik,
    akumPctF:   r2(akumFisikRaw),
    realKeu,
    pctKeu:     r2(pct(realKeu)),
    akumKeu,
    akumPctKeu: r2(akumKeuRaw),
    devFisik:   r2(akumFisikRaw - akumTgtRaw),
    devKeu:     r2(akumKeuRaw   - akumTgtRaw),
  };
}

/** Bulan yang punya baris, urut — dipakai layar & bundel unduhan. */
export function bulanBerdata(rows: RealRow[]): number[] {
  return [...new Set(rows.filter(r => r.bulan >= 1 && r.bulan <= 12).map(r => r.bulan))]
    .sort((a, b) => a - b);
}
