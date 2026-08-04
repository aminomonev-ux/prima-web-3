'use client'
// components/ui/SpandukLihat.tsx — pemberitahuan layar baca-saja, dipakai lintas modul.
//
// Dipasang di layar yang dibuka pemegang izin LIHAT. Tanpa ini, tombol yang menghilang
// terbaca sebagai aplikasi rusak — bukan sebagai batas wewenang.
//
// Pindahan dari `components/blud/SpandukLihat.tsx` saat PK jadi modul kedua. Yang
// dipindah cuma bentuknya; pembungkus per-modul tetap ada supaya sepuluh pemanggil di
// BLUD tidak perlu disentuh, dan supaya tiap modul tetap memakai LABEL_MENU-nya sendiri.
// Kelas `.blud-spanduk-lihat` di globals.css sengaja tidak diganti nama — namanya
// menyebut BLUD tapi bentuknya umum, dan mengganti nama kelas berarti menyentuh
// sepuluh berkas demi nol perubahan tampilan.

import { Eye } from 'lucide-react'

export default function SpandukLihat({ label }: { label: string }) {
  return (
    <div className="blud-spanduk-lihat">
      <Eye size={15} strokeWidth={2.3} />
      <span>
        <strong>{label} — mode lihat.</strong>{' '}
        Peran Anda boleh membaca dan mengunduh isinya, tapi tidak mengubahnya.
        Hubungi pemegang menu ini bila ada yang perlu diperbaiki.
      </span>
    </div>
  )
}
