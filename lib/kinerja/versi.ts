// lib/kinerja/versi.ts — satu aturan "versi mana yang paling belakang".
//
// PURE: tidak menyentuh DB, React, maupun jaringan — supaya aturannya bisa
// diuji perilakunya, bukan cuma teks sumbernya.
//
// L88 lahir karena modul ini pernah punya TIGA jawaban untuk "versi mana yang
// dipakai", dan tiga layar akhirnya mengukur realisasi yang sama terhadap tiga
// pagu. Aturannya sekarang satu, dan tinggal di sini.
//
// YANG BERBEDA ANTAR-PEMANGGIL BUKAN ATURANNYA, MELAINKAN DAFTAR MASUKANNYA —
// dan itu perbedaan yang memang harus ada:
//
//   `versiAktifKinerja`  memberi baris yang `is_nullified = FALSE`. Ia menjawab
//                        "versi mana yang jadi PENGUKUR" — baris yang dinol-kan
//                        tidak punya pagu, jadi tidak boleh ikut menghitung.
//   `reset`              memberi SEMUA slot versi yang tersisa. Ia menjawab
//                        "slot mana yang tidak punya penerus lagi", supaya
//                        kuncinya dibuka. Versi yang seluruh barisnya dinol-kan
//                        tetap sebuah slot yang ada di pemilih versi dan tetap
//                        boleh disunting — menyaringnya justru akan membuka
//                        kunci versi yang MASIH punya turunan, persis keadaan
//                        yang balapan 1B di scripts/test-kinerja-race-versi.mjs
//                        buktikan merusak.
//
// Konsep: docs/AUDIT-kinerja-2026-09-04.md §A7

/**
 * PERUBAHAN mengalahkan MURNI; di antara sesama PERUBAHAN, `versi_seq` tertinggi
 * yang menang.
 *
 * Sengaja BUKAN `ORDER BY versi_seq DESC, versi_tipe DESC` di SQL: itu kebetulan
 * memberi jawaban yang sama hanya selama MURNI selalu ber-seq 0, dan urutan
 * `versi_tipe` di situ bergantung pada urutan deklarasi ENUM-nya — dua hal yang
 * tidak tertulis di mana pun dan bisa berubah tanpa ada yang sadar.
 */
export function pickVersiAktif<T extends { versi_tipe?: unknown; versi_seq?: unknown }>(
  rows: T[],
): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    const rp = r.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    const bp = best.versi_tipe === 'PERUBAHAN' ? 1 : 0;
    if (rp > bp || (rp === bp && Number(r.versi_seq ?? 0) > Number(best.versi_seq ?? 0))) best = r;
  }
  return best;
}

/**
 * A9 — DAFTAR CALON LENGKAP, ANGKANYA DISARING.
 *
 * Satu saringan pernah mengerjakan dua pekerjaan: `WHERE is_nullified = FALSE`
 * benar untuk MENGHITUNG pagu, tapi ia juga menentukan versi mana yang masuk
 * daftar calon — jadi versi yang SELURUH barisnya dinol-kan tidak menghasilkan
 * satu baris pun, hilang dari `GROUP BY`, dan versi SEBELUMNYA diambil sebagai
 * "berlaku". Akibatnya menol-kan seluruh isi sebuah Perubahan tidak berpengaruh
 * apa pun: angkanya MUNDUR ke versi yang sudah digantikan, bukan turun ke nol,
 * dan ia melaporkan pagu LEBIH BESAR dari kenyataan tanpa satu spanduk pun.
 *
 * Karena itu pemanggilnya membaca calonnya TANPA saringan dan menjumlah dengan
 * `SUM(CASE WHEN is_nullified = FALSE …)`. Fungsi ini yang menyatukan keduanya,
 * dan itu sebabnya ia ada: bentuk yang sama diulang di EMPAT tempat
 * (`versiAktifKinerja`, `getLaporanData`, `getLaporanSemua`, `getKinerjaKpi`),
 * dan empat salinan aturan cepat atau lambat berbeda pendapat (L88).
 *
 * `dinolkan` dipulangkan, bukan disimpulkan pemanggilnya dari "pagu === 0":
 * pagu nol punya DUA sebab yang sangat berbeda — belum diisi, dan sengaja
 * dinol-kan — dan layar wajib bisa membedakannya.
 */
export interface BarisVersiAgregat {
  versi_tipe?: unknown;
  versi_seq?: unknown;
  /** COUNT(*) seluruh baris versi ini, termasuk yang dinol-kan. */
  baris?: unknown;
  /** Baris yang `is_nullified = FALSE` — yang angkanya ikut dihitung. */
  baris_aktif?: unknown;
}

export function pilihVersiAgregat<T extends BarisVersiAgregat>(rows: T[]): {
  versi: { tipe: 'MURNI' | 'PERUBAHAN'; seq: number } | null;
  agregat: T | null;
  dinolkan: boolean;
} {
  const aktif = pickVersiAktif(rows);
  if (!aktif) return { versi: null, agregat: null, dinolkan: false };
  return {
    versi: {
      tipe: aktif.versi_tipe === 'PERUBAHAN' ? 'PERUBAHAN' : 'MURNI',
      seq:  Number(aktif.versi_seq ?? 0),
    },
    agregat: aktif,
    // `baris > 0` BUKAN jaga kosong: pemanggil yang lupa memilih kedua kolom
    // hitungan membuat keduanya terbaca 0, dan tanpa pagar ini SETIAP versi
    // akan mengaku habis dinol-kan — layar penuh spanduk untuk keadaan yang
    // tidak terjadi. Kolom yang lupa didaftar itu cacat yang sudah berulang di
    // repo ini (row-map DPA), jadi pagarnya berdiri di sisi yang aman: tanpa
    // bukti, jawabannya "tidak dinol-kan".
    dinolkan: Number(aktif.baris ?? 0) > 0 && Number(aktif.baris_aktif ?? 0) === 0,
  };
}
