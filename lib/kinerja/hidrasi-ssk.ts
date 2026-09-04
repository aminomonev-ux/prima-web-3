// lib/kinerja/hidrasi-ssk.ts — pagu & target realisasi berasal dari SSK, satu rumus.
//
// PURE: tidak menyentuh DB, React, maupun jaringan — supaya rumusnya bisa diuji
// perilakunya, bukan cuma teks sumbernya.
//
// MASALAHNYA (A4): `real_fisik` & `real_keuangan` satu-satunya yang diketik
// manusia; `pagu_awal`, `target_rp`, `target_fisik`, dan `yatim` SELALU turunan
// dari SSK versi yang sedang dibuka. Rumus itu hidup di tiga tempat —
// `recalcAllRealisasiServer` (server), `initRealisasiFromSSK` (layar), dan
// `pulihkanRealisasi` (Riwayat Simpan) — dan yang ketiga tidak menghitungnya
// sama sekali: ia memakai angka milik FOTO, jadi memulihkan simpanan 4 Sep saat
// PERUBAHAN-1 sudah terbit menampilkan pagu lama di samping Laporan & Rekap yang
// sudah memakai pagu baru.
//
// `recalcAllRealisasi` TIDAK bisa menutup itu sendiri: ia MEMBACA `pagu_awal` &
// `target_rp` lalu menghitung persen dan akumulasi dari situ. Hidrasi harus
// terjadi lebih dulu.
//
// Konsep & contoh kasusnya: docs/AUDIT-kinerja-2026-09-04.md §A4

import type { SskMonths } from '@/app/(dashboard)/kinerja/_types';

export const BULAN_KE_KUNCI: (keyof SskMonths)[] =
  ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];

/**
 * Yang dibutuhkan hidrasi dari sebuah baris SSK. Sengaja struktural, bukan
 * `SskRow`: hasil `SELECT canonical_id, pagu, months` di server memenuhinya juga.
 */
export interface SumberHidrasi {
  pagu: number;
  months: SskMonths | null;
}

export interface HasilHidrasi {
  pagu_awal:    number;
  /** Target bulan ini dalam RUPIAH — sumber tunggal; `target_fisik` turunannya. */
  target_rp:    number;
  target_fisik: number;
  /** `ssk_canonical_id`-nya tidak ada di SSK versi acuan — pagu & target 0. */
  yatim:        boolean;
}

/**
 * Target diambil dalam RUPIAH, persennya diturunkan — bukan sebaliknya (L89).
 * Menjumlah persen yang sudah dibulatkan 2 desimal membuat akumulasi meleset
 * sampai 0,005% × pagu tiap bulan tiap item.
 */
export function hidrasiDariSsk(ssk: SumberHidrasi | undefined, bulan: number): HasilHidrasi {
  const pagu = ssk?.pagu ?? 0;
  const target_rp = ssk?.months?.[BULAN_KE_KUNCI[bulan - 1]] ?? 0;
  return {
    pagu_awal:    pagu,
    target_rp,
    target_fisik: pagu > 0 ? Math.round((target_rp / pagu) * 10000) / 100 : 0,
    yatim:        !ssk,
  };
}

export type BarisSskAcuan = SumberHidrasi & { canonical_id?: string; is_nullified?: boolean };

/**
 * Peta canonical_id → baris SSK yang boleh jadi acuan.
 *
 * Saringannya WAJIB sama dengan kueri SSK di `getRealisasiHydrated`: baris
 * ber-`is_nullified` dikecualikan, baris tanpa canonical_id dilewati. Kalau
 * berbeda, layar dan server tidak sepakat baris mana yang yatim — dan spanduk
 * yatim itu satu-satunya kabar bahwa ada uang keluar tanpa pagu yang menaunginya.
 */
export function petaHidrasi(rows: BarisSskAcuan[]): Map<string, SumberHidrasi> {
  const peta = new Map<string, SumberHidrasi>();
  for (const r of rows) {
    const cid = r.canonical_id ?? '';
    if (!cid || r.is_nullified) continue;
    peta.set(cid, { pagu: r.pagu, months: r.months });
  }
  return peta;
}

export interface VersiAcuan { tipe: 'MURNI' | 'PERUBAHAN'; seq: number }

/**
 * Hidrasi ulang baris yang datang dari FOTO (Riwayat Simpan) terhadap SSK versi
 * yang sedang dibuka.
 *
 * Penunjuk versinya ikut disetel: angkanya kini milik versi itu, jadi baris yang
 * mengaku milik MURNI-0 sementara pagunya dari PERUBAHAN-1 adalah kebohongan
 * yang sama di kolom lain — dan `app/api/kinerja/reset` menyaring baris realisasi
 * LEWAT kolom itu, jadi yang salah cap tidak ikut terhapus saat versinya direset.
 *
 * Di lib, bukan di berkas layar: fungsi di dalam `'use client'` cuma bisa
 * dicocokkan ke teks sumbernya, sedangkan yang ini harus dibuktikan memulangkan
 * angka yang sama dengan `recalcAllRealisasiServer` (L82c).
 */
export function hidrasiUlang<T extends { bulan: number; ssk_canonical_id?: string }>(
  rows: T[],
  acuan: BarisSskAcuan[],
  versi: VersiAcuan,
): (T & HasilHidrasi & { ssk_versi_tipe: 'MURNI' | 'PERUBAHAN'; ssk_versi_seq: number })[] {
  const peta = petaHidrasi(acuan);
  return rows.map(r => ({
    ...r,
    ...hidrasiDariSsk(peta.get(r.ssk_canonical_id ?? ''), r.bulan),
    ssk_versi_tipe: versi.tipe,
    ssk_versi_seq:  versi.seq,
  }));
}
