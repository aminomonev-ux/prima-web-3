// lib/kinerja/yatim.ts — memisahkan realisasi yang jangkarnya sudah lenyap.
//
// PURE: tidak menyentuh DB, React, maupun jaringan — supaya aturannya bisa diuji
// sungguhan (pola `hitungRekap`/`hitungRingkas`).
//
// MASALAHNYA (A2): agregat SSK disaring ke versi aktif + `is_nullified = FALSE`,
// sementara `SUM(real_keuangan)` atas `kinerja_realisasi` tidak disaring apa pun.
// Jadi baris yang `ssk_canonical_id`-nya sudah tidak ada di versi acuan masuk
// PEMBILANG sementara pagunya TIDAK ADA di penyebut — `pct_serapan` naik palsu
// dan bisa melewati 100%. Cetak→Rekap sudah mengeluarkannya sejak T7; Laporan,
// Laporan-semua-sumber, dan KPI Dashboard belum. L69: yang terlewat selalu yang
// tidak sedang dilihat.
//
// Nominalnya SENGAJA tidak dijumlahkan ke totalnya — menambahkannya membuat
// persen berdiri di atas penyebut yang tidak memuatnya, dan itu justru cacat
// yang sedang ditutup (§9.1a Beranda BLUD).
//
// Konsep: docs/CONCEPT-kinerja-yatim-dan-hapus-ssk.md §4

import type { LaporanYatim } from './rekap';

/** Sebanyak apa contoh rekening yang disebut di spanduk. Sama dengan `rekap.ts`. */
const MAX_CONTOH = 5;

export interface PenyaringYatim {
  /**
   * `true` = ikut dihitung. `false` = yatim, dan sudah dicatat — pemanggil
   * tinggal melewatinya.
   */
  pakai(sumber: string, canonical: string, nominal: number, baris: number, label?: string): boolean;
  /** Rekapitulasi yang sudah dilewati. Bentuknya sama dengan `hitungRekap().yatim`. */
  hasil(): LaporanYatim;
}

/**
 * @param aktif `sumber` → himpunan `canonical_id` yang ada di versi SSK yang
 *   berlaku untuk sumber itu. Dibangun `canonicalAktifKinerja()`, yang bertanya
 *   ke `versiAktifKinerja()` — supaya "versi mana yang berlaku" tetap SATU
 *   jawaban (L88).
 */
export function buatPenyaringYatim(aktif: Map<string, Set<string>>): PenyaringYatim {
  let jumlahBaris = 0;
  let nominal = 0;
  const item = new Set<string>();

  return {
    pakai(sumber, canonical, nom, baris, label) {
      // Himpunan yang TIDAK ADA untuk sumber itu berarti sumbernya tidak punya
      // baris SSK sama sekali — semua realisasinya yatim, bukan semuanya sah.
      // `?? new Set()` bukan `?? semuaLolos`: sumber tanpa pagu tidak boleh
      // menyumbang pembilang.
      if ((aktif.get(sumber) ?? new Set<string>()).has(canonical)) return true;
      jumlahBaris += baris;
      nominal += nom;
      if (label) item.add(label);
      else if (canonical) item.add(canonical);
      return false;
    },
    hasil() {
      return {
        jumlahBaris,
        jumlahItem: item.size,
        nominal,
        contoh: Array.from(item).slice(0, MAX_CONTOH),
      };
    },
  };
}

/** Satu baris `kinerja_ssk` sejauh yang dibutuhkan penyaring. */
export interface BarisCanonical {
  sumber:       string;
  canonical_id: string;
  versi_tipe:   string;
  versi_seq:    number;
}

/**
 * Lipat baris SSK jadi `sumber → himpunan canonical_id yang BERLAKU`.
 *
 * Dipisah dari `canonicalAktifKinerja` (yang memegang kuerinya) supaya aturannya
 * bisa diuji sungguhan. Selama ia tinggal di dalam fungsi ber-`sql`, satu-satunya
 * yang bisa dicocokkan tesnya adalah teks sumbernya — dan uji mutasi membuktikan
 * itu tidak menggigit: melepas perbandingan versinya lolos tanpa satu tes gagal.
 *
 * Baris dari versi NON-aktif dibuang di sini, bukan di SQL: yang tahu versi mana
 * yang aktif hanya `versiAktifKinerja` (L88).
 */
export function himpunanCanonical(
  rows: BarisCanonical[],
  peta: Map<string, { tipe: 'MURNI' | 'PERUBAHAN'; seq: number }>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const v = peta.get(r.sumber);
    if (!v || r.versi_tipe !== v.tipe || Number(r.versi_seq) !== v.seq) continue;
    if (!r.canonical_id) continue;
    if (!out.has(r.sumber)) out.set(r.sumber, new Set<string>());
    out.get(r.sumber)!.add(r.canonical_id);
  }
  return out;
}

/** Yatim kosong — untuk jalur yang belum punya datanya. */
export function yatimKosong(): LaporanYatim {
  return { jumlahBaris: 0, jumlahItem: 0, nominal: 0, contoh: [] };
}
