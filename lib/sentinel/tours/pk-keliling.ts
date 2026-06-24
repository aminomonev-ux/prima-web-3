// Tur Perjanjian Kinerja (F4 E) — keliling ribbon nav (selalu hadir di semua
// sub-halaman PK), grounded ke modul perjanjian-kinerja. Tile yang role-hidden
// di-skip engine (G3).
import type { TourScript } from './index'

export const pkKeliling: TourScript = {
  id: 'pk-keliling',
  title: 'Keliling Perjanjian Kinerja',
  page: '/perjanjian-kinerja',
  steps: [
    { anchor: 'pk.nav-sasaran', text: 'Mulai dari Master Sasaran: kumpulan sasaran strategis — bisa kamu tarik dari Rencana Aksi supaya tidak ketik ulang.' },
    { anchor: 'pk.nav-program', text: 'Lalu Master Program: daftar program & kegiatan pendukung beserta anggarannya.' },
    { anchor: 'pk.nav-form', text: 'Di Form PK kamu merakit dokumennya — pilih sasaran, program, lalu pejabat penandatangan (pihak pertama & kedua).' },
    { anchor: 'pk.nav-pejabat', text: 'Master Pejabat tempat mengelola daftar penandatangan yang muncul di form.' },
    { anchor: 'pk.nav-riwayat', text: 'Terakhir Riwayat: lihat dokumen PK yang sudah dibuat dan unduh Word-nya. Yang sudah difinalisasi terkunci agar tidak berubah.' },
  ],
  closing: 'Itu alur besarnya 😊 Mau detail satu tab atau rumus tertentu? Tanya saja.',
}
