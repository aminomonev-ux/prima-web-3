'use client'
// components/blud/SpandukLihat.tsx — pembungkus BLUD untuk `components/ui/SpandukLihat`.
// Konsep: docs/CONCEPT-blud-peran.md §8 Fase C
//
// Bentuknya pindah ke `ui/` saat PK jadi modul kedua; berkas ini sengaja dipertahankan
// supaya sepuluh pemanggil di BLUD tidak berubah dan nama menu tetap diterjemahkan oleh
// `LABEL_MENU` milik BLUD, bukan dioper sebagai teks bebas dari tiap layar.

import SpandukLihatUmum from '@/components/ui/SpandukLihat'
import { LABEL_MENU, type MenuBlud } from '@/lib/blud/peran'

export default function SpandukLihat({ menu }: { menu: MenuBlud }) {
  return <SpandukLihatUmum label={LABEL_MENU[menu]} />
}
