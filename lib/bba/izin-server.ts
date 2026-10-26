// lib/bba/izin-server.ts — penyelesai izin bagian BBA di sisi server.
// Konsep: docs/CONCEPT-bba-buku-aset.md §3.1
// Satu tempat yang menggabungkan: perkecualian orang → aturan peran → TABEL di peran.ts.
// SERVER-ONLY; `peran.ts` tetap modul daun supaya layar tidak menyeret data layer.
import { APP_BBA, getPetaPenimpa } from '@/lib/data/menu-access'
import { keyMenuBba } from '@/lib/registry/menu-apps'
import { izinMenu, MENU_BBA, type Izin, type MenuBba } from './peran'

export type PetaIzinBba = Record<MenuBba, Izin>

/** Lima bagian sekali baca — layar & route sama-sama butuh lebih dari satu. */
export async function petaIzinBba(userId: number, role: string): Promise<PetaIzinBba> {
  const penimpa = await getPetaPenimpa(userId, role, APP_BBA)
  const peta = {} as PetaIzinBba
  for (const menu of MENU_BBA) peta[menu] = izinMenu(role, menu, penimpa.get(keyMenuBba(menu)) ?? null)
  return peta
}

/** Menurut kode saja, tanpa DB — pembanding di uji. */
export function petaIzinBawaanBba(role: string): PetaIzinBba {
  const peta = {} as PetaIzinBba
  for (const menu of MENU_BBA) peta[menu] = izinMenu(role, menu)
  return peta
}
