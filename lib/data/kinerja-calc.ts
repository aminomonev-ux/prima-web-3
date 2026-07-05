// lib/data/kinerja-calc.ts
// Server-side recalc untuk E-Anggaran Realisasi.
// Tahap Versi — Checkpoint A Task #11.
// Formula 1:1 dari app/(dashboard)/kinerja/_utils.ts → recalcAllRealisasi.
// Reference: docs/lain/KINERJA_VERSI_REFACTOR.md
//
// Filosofi:
//   - real_fisik & real_keuangan adalah satu-satunya input persisten dari user.
//   - Semua kolom turunan (pagu_awal, target_fisik, pct, akum, deviasi) DIHITUNG
//     di sini berdasarkan SSK versi aktif yang user pilih.
//   - Formula audit-sensitive — perubahan WAJIB sinkron dengan _utils.ts.
//   - Review 2026-07-05: konvensi deviasi disatukan `target − real` (positif =
//     tertinggal) untuk fisik DAN keuangan; deviasi dihitung dari akumulasi
//     mentah (belum dibulatkan) supaya tidak drift ±0,01; group key pakai
//     ssk_canonical_id bila ada (fallback keterangan+uraian_ssk).

import type { MonthKey, SskMonths } from '@/app/(dashboard)/kinerja/_types';

const MONTH_BY_INDEX: MonthKey[] = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];

/** Input row realisasi mentah dari DB — field persisten + identitas + fallback snapshot. */
export interface RealRowRaw {
  bulan:            number;
  keterangan:       string;
  uraian_ssk?:      string | null;
  program?:         string | null;
  kegiatan?:        string | null;
  subkegiatan?:     string | null;
  ssk_canonical_id: string;
  ssk_versi_tipe:   'MURNI' | 'PERUBAHAN';
  ssk_versi_seq:    number;
  real_fisik:       number;
  real_keuangan:    number;
}

/** Snapshot SSK per canonical_id (versi yang user pilih). */
export interface SskHydrationCtx {
  /** Map canonical_id → { pagu, months_pct } untuk versi aktif. */
  sskByCanonical: Map<string, { pagu: number; months_pct: SskMonths | null }>;
}

/** Row hasil hydrate — siap dikirim ke client. */
export interface RealRowHydrated extends RealRowRaw {
  // Diturunkan dari SSK versi aktif:
  pagu_awal:         number;
  target_fisik:      number;
  // Diturunkan dari running calc:
  pct_fisik:         number;
  akum_target_fisik: number;
  akum_real_fisik:   number;
  akum_pct_fisik:    number;
  pct_keuangan:      number;
  akum_keuangan:     number;
  akum_pct_keuangan: number;
  deviasi_fisik:     number;
  deviasi_keuangan:  number;
}

/**
 * Hydrate + recalc semua row realisasi.
 *
 * Step 1: Ambil pagu + target_fisik per bulan dari SSK by canonical_id.
 *   target_fisik bulan b = months_pct[b] (sudah dalam %).
 * Step 2: Group by (keterangan + uraian_ssk), sort by bulan, hitung akumulasi.
 * Step 3: Return rows dengan kolom turunan terisi.
 *
 * Formula akumulasi & deviasi PERSIS sama dengan recalcAllRealisasi di _utils.ts —
 * supaya angka di endpoint baru ≡ angka di DB lama untuk versi MURNI.
 */
export function recalcAllRealisasiServer(
  rows: RealRowRaw[],
  ctx: SskHydrationCtx,
): RealRowHydrated[] {
  // ─── Step 1: hydrate pagu + target_fisik dari SSK versi aktif ─────────────
  const hydrated: RealRowHydrated[] = rows.map(r => {
    // Checkpoint D: fallback snapshot di-hapus — SSK lookup adalah satu-satunya sumber.
    // Kalau canonical_id tidak match (orphan), pagu/target = 0 → semua kolom % juga 0.
    // Prasyarat sebelum migration 031: 0 orphan rows (sudah diverifikasi).
    const ssk = ctx.sskByCanonical.get(r.ssk_canonical_id);
    const pagu = ssk?.pagu ?? 0;
    const monthKey = MONTH_BY_INDEX[r.bulan - 1];
    const target_fisik = ssk?.months_pct?.[monthKey] ?? 0;
    return {
      ...r,
      pagu_awal: pagu,
      target_fisik,
      // placeholder — di-overwrite di step 2
      pct_fisik: 0,
      akum_target_fisik: 0,
      akum_real_fisik:   0,
      akum_pct_fisik:    0,
      pct_keuangan:      0,
      akum_keuangan:     0,
      akum_pct_keuangan: 0,
      deviasi_fisik:     0,
      deviasi_keuangan:  0,
    };
  });

  // ─── Step 2: group + sort + akumulasi ─────────────────────────────────────
  // Group by (keterangan + uraian_ssk) supaya nama keterangan sama beda hierarki
  // tidak tabrakan — identik dengan logic _utils.ts.
  const groups = new Map<string, { row: RealRowHydrated; origIdx: number }[]>();
  hydrated.forEach((r, i) => {
    // #9: canonical_id = identitas item paling presisi (nama kembar lintas
    // sub-kegiatan tidak tercampur). Fallback legacy: keterangan+uraian_ssk.
    const groupKey = r.ssk_canonical_id
      ? `cid:${r.ssk_canonical_id}`
      : `${r.keterangan || ''}||${r.uraian_ssk || ''}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push({ row: r, origIdx: i });
  });

  const resultMap = new Map<number, RealRowHydrated>();
  for (const entries of groups.values()) {
    entries.sort((a, b) => a.row.bulan - b.row.bulan);
    let akumTargetPct = 0;
    let akumRealFisik = 0;
    let akumKeuangan  = 0;
    for (const { row, origIdx } of entries) {
      const pagu = row.pagu_awal || 0;
      akumTargetPct += row.target_fisik  || 0;
      akumRealFisik += row.real_fisik    || 0;
      akumKeuangan  += row.real_keuangan || 0;
      const pct_fisik         = pagu > 0 ? Math.round((row.real_fisik    / pagu) * 10000) / 100 : 0;
      const akum_pct_fisik    = pagu > 0 ? Math.round((akumRealFisik     / pagu) * 10000) / 100 : 0;
      const pct_keuangan      = pagu > 0 ? Math.round((row.real_keuangan / pagu) * 10000) / 100 : 0;
      const akum_pct_keuangan = pagu > 0 ? Math.round((akumKeuangan      / pagu) * 10000) / 100 : 0;
      // #5/#6: konvensi seragam `target − real` (positif = tertinggal) untuk fisik
      // & keuangan. E3: deviasi dari akum mentah (belum dibulatkan), bulatkan sekali.
      const akumPctFisikRaw   = pagu > 0 ? (akumRealFisik / pagu) * 100 : 0;
      const akumPctKeuRaw     = pagu > 0 ? (akumKeuangan  / pagu) * 100 : 0;
      const deviasi_fisik     = Math.round((akumTargetPct - akumPctFisikRaw) * 100) / 100;
      const deviasi_keuangan  = Math.round((akumTargetPct - akumPctKeuRaw)   * 100) / 100;
      resultMap.set(origIdx, {
        ...row,
        pct_fisik,
        akum_target_fisik: Math.round(akumTargetPct * 100) / 100,
        akum_real_fisik:   akumRealFisik,
        akum_pct_fisik,
        pct_keuangan,
        akum_keuangan:     akumKeuangan,
        akum_pct_keuangan,
        deviasi_fisik,
        deviasi_keuangan,
      });
    }
  }

  return hydrated.map((_, i) => resultMap.get(i)!);
}
