// Tur Usulan (F4c) — membuat usulan baru dari nol sampai terkirim, grounded ke
// docs/session/sentinel/workflows/WORKFLOW-usulan-kebutuhan.md Tur 1.
// Step yang elemennya tidak tampil (role/panel belum dibuka) di-skip engine (G3).
import type { TourScript } from './index'

export const usulanBuatBaru: TourScript = {
  id: 'usulan-buat-baru',
  title: 'Membuat Usulan Baru',
  page: '/usulan-kebutuhan',
  steps: [
    { anchor: 'usulan.sidebar-grup-pengajuan', text: 'Mulai dari sidebar — buka grup Pengajuan ini dulu.', waitFor: 'usulan.sidebar-buat' },
    { anchor: 'usulan.sidebar-buat', text: 'Lalu klik Buat Usulan.', waitFor: 'usulan.field-nama' },
    { anchor: 'usulan.tahun-mulai', text: 'Pilih tahun anggaran dan jenisnya (MURNI/PERUBAHAN), lalu Mulai Pengajuan.' },
    { anchor: 'usulan.field-nama', text: 'Isi nama barangnya — yang jelas dan spesifik supaya telaah cepat.' },
    { anchor: 'usulan.field-qty', text: 'Jumlah barangnya di sini.' },
    { anchor: 'usulan.field-harga', text: 'Harga perkiraan per satuan — total dihitung otomatis.' },
    { anchor: 'usulan.tambah-item', text: 'Tambah ke Daftar — ulangi untuk item lain, bisa banyak sekaligus.' },
    { anchor: 'usulan.preview-no', text: 'Nomor usulan dipratinjau otomatis — tidak perlu mengarang nomor.' },
    { anchor: 'usulan.btn-ajukan', caution: true, text: 'Draft untuk simpan dulu, Kirim Usulan untuk mengajukan — yang ini tersimpan beneran, kirim kalau datanya sudah yakin.' },
    { anchor: 'usulan.tab-tracking', text: 'Pantau statusnya di Lacak Usulan — alurnya: telaah Admin → Kasubag → putusan Kabag.' },
  ],
  closing: 'Selesai! 😊 Kalau usulanmu ditolak/direvisi, catatannya bisa dibaca di detail usulan. Tanya aku kapan pun ya.',
}
