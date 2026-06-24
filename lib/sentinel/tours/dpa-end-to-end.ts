// Tur DPA dari nol — skrip dari docs/session/sentinel/workflows/WORKFLOW-blud-dpa.md.
// Catatan audit workflow 2026-06-12: DPA TIDAK punya tombol "kunci versi" —
// versi otomatis per tanggal, jadi step penutup kembali ke versi-dropdown.

import type { TourScript } from './index'

export const dpaEndToEnd: TourScript = {
  id: 'dpa-end-to-end',
  title: 'DPA dari awal sampai akhir',
  page: '/blud/dpa',
  steps: [
    { anchor: 'dpa.versi-dropdown', text: 'Mulai dari sini — pilih versi lama untuk melanjutkan, atau biarkan kosong untuk mulai baru.' },
    { anchor: 'dpa.form-baru', waitFor: 'dpa.overlay-buat-form', text: 'Form Baru membangun kerangka dari template Kode Besar. Klik untuk melihat overlay-nya — kutunggu. (Kalau templatenya kosong, isi dulu lewat menu Kode Besar.)' },
    { anchor: 'dpa.overlay-buat-form', text: 'Kurasi baris yang mau dipakai di overlay ini, lalu klik Buat Form.' },
    { anchor: 'dpa.kolom-uraian', text: 'Isi uraian lewat pencarian Master Akun — kode rekening terisi otomatis dan tidak bisa diketik manual.' },
    { anchor: 'dpa.kolom-vol', text: 'Vol, Satuan, dan Harga hanya diisi di baris rincian (✎) — jumlah baris induk kuhitung otomatis.' },
    { anchor: 'dpa.kolom-pj', text: 'Tetapkan Penanggung Jawab di sini — aku mengawasi konflik chain vertikalnya.' },
    { anchor: 'dpa.simpan', caution: true, text: 'Yang ini beneran tersimpan ya — Simpan membuat versi tanggal hari ini, dan server cek dulu entri ganda & versi.' },
    { anchor: 'dpa.versi-dropdown', text: 'Selesai! Versi tersimpan otomatis per tanggal — versi terbaru jadi acuan Pergeseran.' },
  ],
  closing: 'Itu alur DPA dari nol 🎉 Mau lanjut tur Import dari Usulan, atau cukup dulu?',
}
