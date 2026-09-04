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
