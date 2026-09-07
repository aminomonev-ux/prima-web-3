// lib/shared/tip-posisi.ts — letak tooltip portal supaya tidak terpotong tepi layar.
//
// PURE: tanpa React/DOM/jaringan. Dipisah dari `components/ui/Tip.tsx` karena
// bagian yang gampang salah di sini bukan JSX-nya melainkan geometrinya (tiga
// cabang + jaminan "tidak keluar layar di kedua sisi"), dan fungsi yang tinggal
// di berkas `'use client'` hanya bisa dicocokkan ke teks sumbernya.

/** Sisa ruang minimum antara tooltip dan tepi layar. */
export const JARAK_TEPI = 8;

/** Batas lebar tooltip di layar lapang. */
export const LEBAR_MAKS = 280;

/**
 * Perkiraan tinggi tooltip SATU baris (padding + baris teks) plus jaraknya ke
 * pemilik. Dipakai untuk memutuskan apakah masih ada ruang di ATAS pemiliknya.
 * Sengaja perkiraan satu baris, bukan dua: dengan angka dua baris, tombol yang
 * masih punya ruang cukup akan ikut dibalik ke bawah tanpa perlu.
 */
export const TINGGI_KIRA = 34;

export interface LetakTip {
  top: number;
  left: number;
  /** Nilai `--tip-tx`: pergeseran mendatar terhadap `left`. */
  tx: '-50%' | '-100%' | '0%';
  /**
   * Nilai `--tip-ty`: `-100%` = tooltip di ATAS pemiliknya (lumrah), `0%` = di
   * BAWAH, dipakai kalau ruang di atas tidak cukup. Ber-satuan persen, bukan
   * `0` telanjang: keyframe-nya memakai `calc(var(--tip-ty) + 4px)`, dan
   * menambah angka tanpa satuan ke panjang membuat seluruh `calc` batal.
   */
  ty: '-100%' | '0%';
  /**
   * Nilai `--tip-maks` (max-width di CSS). Dipulangkan, BUKAN ditulis ulang di
   * CSS: perhitungan di bawah memakai angka ini sebagai batas atas lebar
   * tooltip, jadi kalau CSS-nya memakai angka lain jaminan "tidak keluar layar"
   * cuma benar di atas kertas.
   */
  lebar: number;
}

export interface KotakPemilik { left: number; right: number; width: number; top: number; bottom: number }

/**
 * Tooltip belum bisa DIUKUR saat letaknya dihitung — ia baru ada sesudah
 * render. Jadi yang dipakai batas atas lebarnya, dan `max-width` di CSS yang
 * menjamin batas itu tidak dilanggar.
 *
 * Dekat tepi kanan, yang dijangkarkan tepi KANAN tooltip (`tx: -100%`) sehingga
 * ia memanjang ke kiri; jangkarnya ditahan minimal `JARAK_TEPI + lebar` supaya
 * sisi kirinya juga tidak bisa keluar layar di layar sempit. Kebalikannya di
 * tepi kiri. Di luar kedua tepi ia tetap dipusatkan seperti sebelumnya.
 *
 * Jangkarnya juga ditahan di dalam layar, sebab `r.right` bisa MELEBIHI lebar
 * layar (tombol yang sebagian sudah keluar layar) — tanpa itu tooltipnya
 * terpotong lagi, persis keadaan yang fungsi ini ada untuk mencegahnya.
 */
export function letakTip(r: KotakPemilik, lebarLayar: number): LetakTip {
  const tengah = r.left + r.width / 2;
  const lebar  = Math.min(LEBAR_MAKS, Math.max(0, lebarLayar - 2 * JARAK_TEPI));
  // Sumbu tegak dijaga dengan aturan yang sama: kalau ruang di atas pemiliknya
  // tidak cukup, tooltipnya dibalik ke BAWAH. Tanpa ini perbaikan tepi cuma
  // separuh — tombol di dekat tepi atas layar tetap terpotong, cacat yang sama
  // persis dengan yang di tepi kanan.
  const keBawah = r.top - TINGGI_KIRA < JARAK_TEPI;
  const top = keBawah ? r.bottom + 6 : r.top - 6;
  const ty: LetakTip['ty'] = keBawah ? '0%' : '-100%';

  if (tengah + lebar / 2 > lebarLayar - JARAK_TEPI) {
    const kanan = Math.max(r.right, JARAK_TEPI + lebar);
    return { top, ty, lebar, left: Math.min(lebarLayar - JARAK_TEPI, kanan), tx: '-100%' };
  }
  if (tengah - lebar / 2 < JARAK_TEPI) {
    const kiri = Math.min(r.left, lebarLayar - JARAK_TEPI - lebar);
    return { top, ty, lebar, left: Math.max(JARAK_TEPI, kiri), tx: '0%' };
  }
  return { top, ty, lebar, left: tengah, tx: '-50%' };
}
