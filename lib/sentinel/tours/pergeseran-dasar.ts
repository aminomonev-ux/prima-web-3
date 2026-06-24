// Tur dasar Pergeseran DPA — skrip dari WORKFLOW-blud-pergeseran.md (Tur 1).

import type { TourScript } from './index'

export const pergeseranDasar: TourScript = {
  id: 'pergeseran-dasar',
  title: 'Pergeseran DPA dasar',
  page: '/blud/pergeseran',
  steps: [
    { anchor: 'pergeseran.buat', text: 'Mulai dengan Buat Pergeseran — tabel dibangun dari snapshot DPA terbaru.' },
    { anchor: 'pergeseran.sumber-dpa', text: 'Badge ini menunjukkan versi DPA yang jadi basis hitunganmu.' },
    { anchor: 'pergeseran.kolom-vol-p', text: 'Isi nilai SETELAH pergeseran di kolom Vol P — kolom kiri tetap nilai DPA asli.' },
    { anchor: 'pergeseran.kolom-harga-p', text: 'Harga P juga nilai sesudah — selisihnya kuhitung otomatis.' },
    { anchor: 'pergeseran.kolom-selisih', text: 'Selisih muncul di kolom Pergeseran dan +/− — total anggaran tidak boleh berubah.' },
    { anchor: 'pergeseran.simpan', caution: true, text: 'Simpan membuat versi pergeseran baru — pastikan angkanya sudah benar ya.' },
  ],
  closing: 'Setelah disimpan, hasil pergeseran bisa diterapkan ke DPA lewat Inject. Mau kuceritakan soal Inject?',
}
