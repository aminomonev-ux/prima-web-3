// Tur orientasi PRIMA — keliling menu utama. Step yang elemennya tidak tampil
// untuk role user otomatis di-skip oleh engine (G3 via skip-by-absence).

import type { TourScript } from './index'

export const kenalPrima: TourScript = {
  id: 'kenal-prima',
  title: 'Kenalan dengan PRIMA',
  page: '/menu',
  steps: [
    { anchor: 'menu.user-badge', text: 'Ini profilmu — dari sini bisa ke halaman profil, ganti tema, dan logout.' },
    { anchor: 'menu.brand-status', text: 'Kartu status: jumlah modul aktif dan versi PRIMA — kalau ada gangguan, cek di sini dulu.' },
    { anchor: 'menu.daftar-app', text: 'Ini daftar modulmu — yang tampil mengikuti akses role. Klik BUKA untuk masuk ke modul.' },
  ],
  closing: 'Singkat kan? 😊 Kalau bingung di modul mana pun, buka aku lagi dan tanya saja — atau minta tur per modul.',
}
