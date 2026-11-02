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
import { fmtNumDisplay } from '@/lib/shared/utils';

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
  /** Baris yatim yang DIKELUARKAN dari jumlah di atas — untuk catatannya. */
  yatim: { jumlah: number; realKeu: number; akumKeu: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Yatim (rekeningnya tidak ada di SSK acuan, mis. lahir di Perubahan saat MURNI
 * dipilih) DIKELUARKAN: pagunya 0, jadi menjumlah realisasinya menaikkan persen
 * tanpa penyebut. Aturan yang sama dengan Rekap (§9.1a) — barisnya tetap tampil,
 * uangnya disebut di catatan. CONCEPT-kinerja-versi-cetak §1.4.
 */
export function hitungJumlahBulan(rows: RealRow[]): JumlahBulan {
  let pagu = 0, tgtRp = 0, akumTgtRp = 0;
  let realFisik = 0, akumFisik = 0, realKeu = 0, akumKeu = 0;
  const yatim = { jumlah: 0, realKeu: 0, akumKeu: 0 };
  for (const r of rows) {
    if (r.yatim) {
      yatim.jumlah++;
      yatim.realKeu += r.real_keuangan || 0;
      yatim.akumKeu += r.akum_keuangan || 0;
      continue;
    }
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
    yatim,
  };
}

/** Penanda baris yatim di kolom Uraian — layar, Excel, PDF. */
export function tandaYatim(versi: string): string {
  return `tidak ada di SSK ${versi}`;
}

/** Catatan di bawah tabel satu bulan — ikut tercetak. `null` kalau tidak ada yatim. */
export function catatanYatimBulan(j: JumlahBulan, versi: string): string | null {
  if (j.yatim.jumlah === 0) return null;
  return `${j.yatim.jumlah} rekening ${tandaYatim(versi)} — realisasinya (Rp ${fmtNumDisplay(j.yatim.realKeu)} bulan ini, `
    + `Rp ${fmtNumDisplay(j.yatim.akumKeu)} s/d bulan ini) tidak ikut dijumlah.`;
}

/** Bulan yang punya baris, urut — dipakai layar & bundel unduhan. */
export function bulanBerdata(rows: RealRow[]): number[] {
  return [...new Set(rows.filter(r => r.bulan >= 1 && r.bulan <= 12).map(r => r.bulan))]
    .sort((a, b) => a - b);
}
