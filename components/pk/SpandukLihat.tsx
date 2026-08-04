'use client'
// components/pk/SpandukLihat.tsx — pembungkus PK untuk `components/ui/SpandukLihat`.
// Konsep: docs/CONCEPT-pk-peran.md §7

import SpandukLihatUmum from '@/components/ui/SpandukLihat'
import { LABEL_MENU_PK, type MenuPk } from '@/lib/pk/peran'

export default function SpandukLihatPk({ menu }: { menu: MenuPk }) {
  return <SpandukLihatUmum label={LABEL_MENU_PK[menu]} />
}
