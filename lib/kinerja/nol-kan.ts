// lib/kinerja/nol-kan.ts — menonaktifkan baris SSK tanpa menghapusnya.
//
// PURE: tidak menyentuh DB, React, maupun jaringan — supaya aturannya bisa diuji
// perilakunya, bukan cuma teks sumbernya.
//
// KENAPA BERHENTI DI FORM, bukan lewat `PATCH /api/kinerja/ssk/nullify`:
// tab SSK adalah layar isi-form-lalu-Simpan — satu tombol menulis ulang seluruh
// versi. Route yang menulis langsung ke DB tidak bisa hidup berdampingan dengan
// itu: Nol-kan lewat route membuat baris di DB jadi nol, tapi layar masih
// memegang angka lamanya, dan Simpan sesudahnya MENIMPA BALIK hasilnya tanpa
// satu pesan pun.
//
// Tidak perlu route sama sekali, karena `is_nullified` sudah ikut jalur Simpan:
// ada di `SskRowSchema`, ditulis `saveSskBatch`, dibaca balik `getSskRows`, dan
// pagar `locked_at` sudah berlaku otomatis. Pola yang sama dengan Pulihkan,
// Salin Versi, Impor, dan Tutup Pergeseran (L78/L80/L82).
//
// Konsep: docs/CONCEPT-kinerja-yatim-dan-hapus-ssk.md §2

import type { SskRow, SskMonths } from '@/app/(dashboard)/kinerja/_types';
import { hitungTurunanRko } from './gabung-rko';

const MONTHS_KEYS: (keyof SskMonths)[] =
  ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'];

function bulanNol(): SskMonths {
  return MONTHS_KEYS.reduce((a, m) => { a[m] = 0; return a; }, {} as SskMonths);
}

/**
 * Nol-kan satu baris: targetnya jadi nol, tapi rekeningnya TETAP ADA di versi
 * ini — jadi baris realisasi yang menunjuknya tidak kehilangan pagu sebagai
 * pembagi dan tidak jadi yatim. Itu seluruh bedanya dengan menghapus.
 *
 * Turunannya lewat `hitungTurunanRko`, bukan ditulis nol satu-satu: rumusnya
 * sudah dipusatkan di situ, dan menuliskannya ulang di sini melahirkan salinan
 * kedua yang cepat atau lambat berbeda pendapat.
 */
export function nolkanBaris(rows: SskRow[], idx: number): SskRow[] {
  return rows.map((r, i) => {
    if (i !== idx) return r;
    const months = bulanNol();
    return { ...r, is_nullified: true, pagu: 0, months, ...hitungTurunanRko(0, months) };
  });
}

/**
 * Aktifkan kembali: HANYA benderanya yang dibalik.
 *
 * Angkanya SENGAJA tidak dikembalikan — route `nullify` yang lama pun tidak
 * ("User harus isi pagu/months lagi manual"), dan menebak angka lama adalah hal
 * yang tidak boleh dilakukan sebuah tombol. Dialognya wajib mengatakannya,
 * kalau tidak orang menekan Aktifkan lalu menyangka pagunya pulih.
 */
export function aktifkanBaris(rows: SskRow[], idx: number): SskRow[] {
  return rows.map((r, i) => (i === idx ? { ...r, is_nullified: false } : r));
}

/** Sudah dinol-kan? Bendera boleh `undefined` pada baris yang belum tersimpan. */
export function sudahDinolkan(r: SskRow): boolean {
  return r.is_nullified === true;
}

/**
 * Berapa baris yang dinol-kan pada payload ini — untuk detail audit
 * `KINERJA_SAVE_SSK`.
 *
 * Bertipe struktural, bukan `SskRow[]`: pemanggilnya route, yang memegang baris
 * hasil Zod, bukan tipe layar. Mengecornya jadi `SskRow` di sana cuma
 * menyembunyikan bahwa yang dibutuhkan sebenarnya satu medan saja.
 */
export function hitungDinolkan(rows: { is_nullified?: boolean }[]): number {
  return rows.reduce((n, r) => n + (r.is_nullified === true ? 1 : 0), 0);
}

// ─── Sisi HAPUS ──────────────────────────────────────────────────────────────
// Nol-kan dan Hapus adalah dua jawaban untuk pertanyaan yang sama ("baris ini
// tidak dipakai lagi"), jadi keduanya tinggal serumah: dialog hapus WAJIB
// menawarkan Nol-kan, dan kalimat itu cuma benar selama keduanya masih sejalan.

export interface JawabanHapus {
  count:   number;
  nominal: number;
}

/**
 * Perlu bertanya ke `check-deletable` dulu?
 *
 * Baris tanpa `canonical_id` belum pernah tersimpan (baru dari Inject Rekening
 * atau Import RKO), jadi tidak ada baris realisasi yang bisa merujuknya —
 * bertanya cuma menambah satu perjalanan dan satu jeda untuk jawaban yang sudah
 * pasti.
 */
export function perluPeriksaHapus(r: SskRow): boolean {
  return typeof r.canonical_id === 'string' && r.canonical_id.length > 0;
}

/**
 * Kalimat dialognya. Dipisah ke sini supaya bisa diuji perilakunya — selama ia
 * di dalam komponen, tes cuma bisa mencocokkan potongan teksnya.
 *
 * Menyebut NOMINAL, bukan cuma jumlah baris: orang bisa menaksir "12 baris" itu
 * sepele, tidak bisa menaksir angka rupiahnya sepele. Nominal nol tidak ikut
 * disebut — "(realisasi keuangan Rp 0)" terbaca seperti galat, padahal artinya
 * barisnya ada tapi belum diisi uangnya.
 */
export function pesanHapusSsk(nama: string, d: JawabanHapus): string {
  const uang = d.nominal > 0
    ? ` (realisasi keuangan Rp ${d.nominal.toLocaleString('id-ID')})`
    : '';
  return `"${nama}" dirujuk ${d.count} baris realisasi${uang}.\n\n`
    + 'Kalau dihapus, baris realisasi itu TIDAK ikut terhapus — tapi kehilangan pagu dan '
    + 'targetnya, sehingga persennya tidak bisa dihitung lagi dan nominalnya tidak ikut '
    + 'dijumlah di Laporan maupun Cetak.\n\n'
    + 'Kalau maksud Anda menonaktifkan item ini, pakai Nol-kan — targetnya jadi nol tapi '
    + 'realisasinya tetap punya rekening.';
}
