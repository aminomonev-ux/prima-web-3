// Tur Buku Besar Aset (F4d) — catat aset + realisasi, grounded ke
// docs/session/sentinel/workflows/WORKFLOW-buku-besar-aset.md.
// Step yang elemennya tidak tampil (role-hidden / belum ada baris) di-skip engine (G3).
import type { TourScript } from './index'

export const bbaEntry: TourScript = {
  id: 'bba-entry',
  title: 'Mencatat Aset & Realisasi',
  page: '/buku-besar-aset',
  steps: [
    { anchor: 'bba.tambah-item', text: 'Catat belanja modal baru di sini — Tambah Item. Di modalnya, Nilai Rencana dihitung otomatis = volume × harga, bukan diketik.' },
    { anchor: 'bba.tarik-usulan', text: 'Atau tarik langsung dari Usulan yang sudah final disetujui — praktis, tidak perlu ketik ulang. (Khusus Admin.)' },
    { anchor: 'bba.kpi-cards', text: 'Ringkasan register tahun ini: total rencana vs realisasi, persen terakomodir, dan sisa yang belum terealisasi.' },
    { anchor: 'bba.row-realisasi', text: 'Setelah belanja benar-benar terjadi, klik ikon realisasi di barisnya untuk mengisi nilai + unit yang terpakai.' },
    { anchor: 'bba.tab-keputusan', text: 'Filter asal item — baris dari usulan yang Ditolak tetap dicatat sebagai sejarah, tapi tidak dihitung di KPI.' },
  ],
  closing: 'Selesai! 😊 Statusnya (penuh/sebagian/tidak terealisasi) disarankan otomatis saat kamu isi realisasi. Tanya aku kapan pun ya.',
}
