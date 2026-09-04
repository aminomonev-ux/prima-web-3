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
