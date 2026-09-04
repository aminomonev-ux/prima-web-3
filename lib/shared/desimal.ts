// lib/shared/desimal.ts — angka berkoma untuk isian & tampilan (id-ID)
//
// Satu tempat untuk DUA arah: membaca ketikan orang ("7,5") jadi angka, dan
// menulis angka jadi teks yang dibaca orang ("7,5"). Dua salinan aturan ini
// adalah cara tercepat membuat satu pintu menyimpan 75 sementara pintu
// sebelahnya menyimpan 7,5 — Renaksi punya TIGA pintu pengisian realisasi
// (kisi 12 bulan, modal Triwulan, Matriks Bulanan) dan ketiganya memanggil
// berkas ini.

/** Kolom q1..q4_realisasi & q*_target = DECIMAL(14,2). Lebih dari ini dibulatkan MySQL diam-diam. */
export const DESIMAL_RENAKSI = 2;

/**
 * Ketikan → angka. Koma maupun titik diterima sebagai pemisah desimal.
 * "" (dan teks yang bukan angka) → null, artinya "belum diisi" — BUKAN 0,
 * karena di realisasi bulanan 0 itu nilai nyata (R3).
 *
 * Menerima ketikan setengah jadi ("7,") supaya angka di belakang koma bisa
 * diketik huruf demi huruf: memulangkan null di situ membuat selnya kosong
 * tepat saat orang menekan koma.
 */
export function bacaDesimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (t === '') return null;

  const titik = t.lastIndexOf('.');
  const koma = t.lastIndexOf(',');
  let normal: string;
  if (titik >= 0 && koma >= 0) {
    // Dua-duanya hadir → yang TERAKHIR pemisah desimal, sisanya pemisah ribuan.
    // Menangkap tempelan dari Excel: "1.234,5" (id-ID) dan "1,234.5" (en) sama-sama 1234,5.
    const pisah = Math.max(titik, koma);
    normal = t.slice(0, pisah).replace(/[.,]/g, '') + '.' + t.slice(pisah + 1);
  } else {
    normal = t.replace(',', '.');
  }

  if (!/^-?\d+(\.\d*)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pembulatan yang tidak tergelincir IEEE-754: `Math.round(2.675 * 100) / 100`
 * memulangkan 2,67 karena 2.675 tersimpan sebagai 2.67499…, sedangkan
 * menggeser lewat notasi eksponen membaca ulang angkanya dari teks.
 */
export function bulatkanDesimal(n: number, desimal: number = DESIMAL_RENAKSI): number {
  if (!Number.isFinite(n)) return 0;
  const geser = Number(`${n}e${desimal}`);
  if (!Number.isFinite(geser)) return n; // angka yang sudah bernotasi eksponen (1e21)
  const balik = Number(`${Math.round(geser)}e-${desimal}`);
  return Number.isFinite(balik) ? balik : n;
}

/**
 * Angka → teks layar. 7,5 → "7,5" · 7 → "7" · 1234,5 → "1.234,5" · null → "".
 * Nol tetap "0": ia nilai nyata, bukan sel kosong.
 */
export function tulisDesimal(n: number | null | undefined, desimal: number = DESIMAL_RENAKSI): string {
  if (n == null || !Number.isFinite(n)) return '';
  return bulatkanDesimal(n, desimal).toLocaleString('id-ID', { maximumFractionDigits: desimal });
}

/** Buang huruf & simbol dari ketikan, sisakan angka + pemisah + tanda minus. */
export function bersihkanKetikan(s: string): string {
  return s.replace(/[^\d.,-]/g, '');
}
