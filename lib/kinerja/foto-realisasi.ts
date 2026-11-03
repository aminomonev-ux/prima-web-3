// lib/kinerja/foto-realisasi.ts — versi RKO yang FINAL (terkunci karena Perubahan dibuat)
// dan foto realisasinya. PURE (aman-klien); DB-nya di foto-realisasi-data.ts.
//
// Realisasi hanya satu set per sumber; versi cuma memilih pagu/target pembandingnya. Jadi
// Murni yang "tertutup semua" tetap bergeser angkanya kalau realisasi disunting di Perubahan
// — kecuali angkanya dibekukan. Buat Perubahan memotret realisasi untuk versi yang dikunci;
// versi final membaca foto itu, 12 bulannya tertutup, dan tutupan versi lain tidak menyentuhnya.
// Konsep: docs/CONCEPT-kinerja-tutup-per-versi.md

import type { BulanTertutup } from './tutup-bulan'

/**
 * BUAT_PERUBAHAN = dipotret saat tombolnya ditekan. RIWAYAT / BERJALAN = versi yang sudah
 * terkunci sebelum fitur ini ada, dipotret sekali saat pemasangan dari simpanan realisasi
 * terakhir sebelum Perubahan dibuat, atau dari realisasi saat itu kalau simpanannya sudah
 * terpangkas retensi.
 */
export type AsalFoto = 'BUAT_PERUBAHAN' | 'RIWAYAT' | 'BERJALAN'

export interface FotoRealisasi {
  asal: AsalFoto
  /** 'YYYY-MM-DD HH:MM:SS' WIB — angka foto = realisasi pada jam ini. */
  keadaan_pada: string
  difoto_oleh: string | null
}

export interface VersiFinal {
  /** Jam versi ini dikunci = jam Perubahan berikutnya dibuat. */
  dikunci_pada: string
  /** null = belum punya foto: layar menampilkan realisasi berjalan dan menyebutnya. */
  foto: FotoRealisasi | null
}

/** Versi final = 12 bulan tertutup, diturunkan dari kuncinya — bukan 12 baris tutupan. */
export function bulanFinal(v: VersiFinal): BulanTertutup[] {
  return Array.from({ length: 12 }, (_, i) => ({
    bulan: i + 1,
    ditutup_oleh: v.foto?.difoto_oleh ?? null,
    ditutup_pada: v.dikunci_pada,
  }))
}

/** Spanduk layar Realisasi untuk versi final. `fmt` = pemformat stempel milik layar. */
export function kalimatVersiFinal(v: VersiFinal, label: string, fmt: (s: string) => string): string {
  const kepala = `${label} sudah final sejak Perubahan dibuat ${fmt(v.dikunci_pada)} — semua bulannya tertutup.`
  if (!v.foto) {
    return `${kepala} Versi ini belum punya foto realisasi, jadi angka di bawah adalah realisasi berjalan dan masih bisa bergeser.`
  }
  if (v.foto.asal === 'BUAT_PERUBAHAN') {
    return `${kepala} Angka di bawah adalah foto realisasi saat itu; koreksi sesudahnya hanya masuk ke versi terbaru.`
  }
  if (v.foto.asal === 'RIWAYAT') {
    return `${kepala} Angka di bawah dari simpanan realisasi terakhir sebelum Perubahan (${fmt(v.foto.keadaan_pada)}).`
  }
  return `${kepala} Simpanan realisasi sebelum Perubahan sudah tidak ada di riwayat, jadi fotonya diambil `
    + `dari realisasi saat pembaruan dipasang (${fmt(v.foto.keadaan_pada)}).`
}
