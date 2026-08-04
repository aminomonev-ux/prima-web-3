// lib/pk/izin-server.ts — penyelesai izin menu PK di sisi server.
// Konsep: docs/CONCEPT-pk-peran.md §7
// Satu-satunya tempat yang menggabungkan tiga sumber jawaban:
//   perkecualian orang  →  aturan peran  →  TABEL di peran.ts
// SERVER-ONLY. Sengaja dipisah dari `peran.ts` yang wajib tetap modul daun tanpa
// import: ribbon di klien memakai `peran.ts`, dan begitu berkas itu menyeret data
// layer, bundel klien ikut menarik server. Layar menerima PETA YANG SUDAH JADI dari
// sini, bukan bahan mentah untuk dihitung ulang.
import { APP_PK, getPenimpa, getPetaPenimpa } from '@/lib/data/menu-access'
import { keyMenuPk } from '@/lib/registry/menu-apps'
import { izinMenu, MENU_PK, type Izin, type MenuPk } from './peran'

export type PetaIzinPk = Record<MenuPk, Izin>

export async function izinPk(userId: number, role: string, menu: MenuPk): Promise<Izin> {
  const penimpa = await getPenimpa(userId, role, APP_PK, keyMenuPk(menu))
  return izinMenu(role, menu, penimpa)
}

/** Tujuh menu sekali baca — dipakai layout PK supaya ribbon tidak memicu 7 query. */
export async function petaIzinPk(userId: number, role: string): Promise<PetaIzinPk> {
  const penimpa = await getPetaPenimpa(userId, role, APP_PK)
  const peta = {} as PetaIzinPk
  for (const menu of MENU_PK) {
    peta[menu] = izinMenu(role, menu, penimpa.get(keyMenuPk(menu)) ?? null)
  }
  return peta
}

/**
 * Izin yang berlaku menurut kode saja — tanpa menyentuh DB. Dipakai Admin Panel
 * untuk menampilkan "bawaan peran", dan oleh tes 42 sel sebagai pembanding.
 */
export function petaIzinBawaanPk(role: string): PetaIzinPk {
  const peta = {} as PetaIzinPk
  for (const menu of MENU_PK) peta[menu] = izinMenu(role, menu)
  return peta
}
