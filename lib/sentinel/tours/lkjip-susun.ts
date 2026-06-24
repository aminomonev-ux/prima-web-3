// Tur LKJIP (F4 E) — adaptif: di daftar dokumen hanya step "Buat" yang tampil;
// di editor /lkjip/[id] step kerangka·blok yang tampil (sisanya di-skip engine,
// G3). page '/lkjip' cocok untuk kedua rute (prefix match).
import type { TourScript } from './index'

export const lkjipSusun: TourScript = {
  id: 'lkjip-susun',
  title: 'Menyusun LKJIP',
  page: '/lkjip',
  steps: [
    { anchor: 'lkjip.list-buat', text: 'Mulai di sini: Buat E-LKJIP — pilih tahun dan template (kerangka bab standar atau kosong), lalu buka dokumennya.' },
    { anchor: 'lkjip.editor-tree', text: 'Panel kiri = Kerangka: pohon bab/sub-bab. Nomornya dihitung otomatis dari posisi, jadi tidak perlu kamu ketik.' },
    { anchor: 'lkjip.editor-tambah-bab', text: 'Tambah bab atau sub-bab baru lewat sini, lalu posisinya bisa kamu geser di pohon.' },
    { anchor: 'lkjip.editor-blok', text: 'Panel tengah mengisi bab yang dipilih — di sinilah konten setiap bagian dirakit.' },
    { anchor: 'lkjip.editor-addblock', text: 'Tambah blok isi: Narasi (teks kaya), Tabel, Gambar, atau Grafik. Semua dirangkai jadi satu Word rapi saat kamu Unduh.' },
  ],
  closing: 'Selesai! 😊 Daftar isi, daftar tabel/gambar, dan penomoran halaman dibuat otomatis saat Unduh Word. Tanya aku kapan pun ya.',
}
