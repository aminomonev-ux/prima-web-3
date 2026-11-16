// lib/pk/unduh-massal.ts — aturan unduh banyak dokumen PK sekaligus (satu ZIP).
// PURE, aman-klien: batasnya dipakai layar Riwayat DAN skema Zod route, satu angka.

/** Batas dokumen sekali unduh. */
export const BATAS_UNDUH_MASSAL = 30;

/**
 * Batas khusus PDF. LibreOffice di server mengubah satu berkas pada satu waktu (antrean di
 * `docxKePdf`), jadi 10 dokumen sudah satu permintaan yang menunggu puluhan detik.
 */
export const BATAS_PDF_MASSAL = 10;

/**
 * Jumlah dokumen per PERMINTAAN untuk PDF. 10 dokumen dalam satu permintaan bisa melewati
 * `proxy_read_timeout` Nginx (bawaan 60 detik) → 504, dan berkasnya hilang walau konversinya
 * sudah jalan. 5 dokumen ≈ 15–30 detik per permintaan (konversi 3–6 detik/berkas), lalu
 * layar menggabungkan ZIP-nya di peramban — lama satu permintaan jadi terbatas.
 */
export const PERMINTAAN_PDF_MASSAL = 5;

/** Potong daftar jadi bagian berukuran `n` — dipakai layar, murni, tanpa efek samping. */
export function potongPer<T>(xs: readonly T[], n: number): T[][] {
  const keluar: T[][] = [];
  for (let i = 0; i < xs.length; i += n) keluar.push(xs.slice(i, i + n));
  return keluar;
}

/**
 * Nama berkas di dalam ZIP harus unik — dua dokumen dengan unit & jenis yang sama bisa
 * menghasilkan nama identik, dan ZIP hanya menyimpan satu entri per nama (yang lain hilang
 * diam-diam). Yang kedua dan seterusnya diberi " (2)", " (3)", … sebelum ekstensinya.
 */
export function namaUnik(nama: string, dipakai: Set<string>): string {
  if (!dipakai.has(nama)) { dipakai.add(nama); return nama; }
  const titik = nama.lastIndexOf('.');
  const dasar = titik > 0 ? nama.slice(0, titik) : nama;
  const ekstensi = titik > 0 ? nama.slice(titik) : '';
  for (let i = 2; ; i++) {
    const calon = `${dasar} (${i})${ekstensi}`;
    if (!dipakai.has(calon)) { dipakai.add(calon); return calon; }
  }
}
