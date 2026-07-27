'use client'
// components/blud/SpandukLihat.tsx — pemberitahuan layar baca-saja.
// Konsep: docs/CONCEPT-blud-peran.md §8 Fase C
//
// Dipasang di layar yang dibuka pemegang izin LIHAT. Tanpa ini, tombol yang
// menghilang terbaca sebagai aplikasi rusak — bukan sebagai batas wewenang.

import { Eye } from 'lucide-react'
import { LABEL_MENU, type MenuBlud } from '@/lib/blud/peran'

export default function SpandukLihat({ menu }: { menu: MenuBlud }) {
  return (
    <div className="blud-spanduk-lihat">
      <Eye size={15} strokeWidth={2.3} />
      <span>
        <strong>{LABEL_MENU[menu]} — mode lihat.</strong>{' '}
        Peran Anda boleh membaca dan mengunduh isinya, tapi tidak mengubahnya.
        Hubungi pemegang menu ini bila ada yang perlu diperbaiki.
      </span>
    </div>
  )
}
