// Tur orientasi Kinerja (F4e) — keliling sidebar (selalu hadir, tab lazy-load
// jadi anchor di dalam tab tidak diandalkan). Grounded ke WORKFLOW-kinerja.md.
import type { TourScript } from './index'

export const kinerjaKeliling: TourScript = {
  id: 'kinerja-keliling',
  title: 'Keliling Modul Kinerja',
  page: '/kinerja',
  steps: [
    { anchor: 'kinerja.sidebar-tahun', text: 'Semua data Kinerja terikat tahun anggaran — pastikan tahun yang dipilih benar dulu di sini.' },
    { anchor: 'kinerja.sidebar-master', text: 'Mulai dari Master Rekening: isi Program → Kegiatan → Sub Kegiatan → Uraian SSK → Sumber Anggaran sebagai fondasinya.' },
    { anchor: 'kinerja.sidebar-rko', text: 'Lalu RKO — pilih sumber dana (mis. SSK BLUD), Inject Rekening, isi target per bulan, dan Simpan. Versi MURNI bisa diedit; Buat Perubahan Baru mengunci versi lama.' },
    { anchor: 'kinerja.sidebar-realisasi', text: 'Terakhir Realisasi — Init dari SSK lalu isi realisasi bulanan. Persen realisasi keuangan/fisik dihitung otomatis terhadap pagu. Cetak & laporan ada di bawahnya.' },
  ],
  closing: 'Itu alur besarnya 😊 Mau rumus hitung persennya, atau detail satu tab? Tanya saja.',
}
