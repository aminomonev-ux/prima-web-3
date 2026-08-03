// lib/blud/izin-server.ts — penyelesai izin menu BLUD di sisi server.
// Konsep: docs/CONCEPT-menu-access-control.md §4.5.2, §4.5.3
//
// Satu-satunya tempat yang menggabungkan tiga sumber jawaban:
//   perkecualian orang  →  aturan peran  →  TABEL di peran.ts
//
// SERVER-ONLY. Sengaja dipisah dari `peran.ts` yang wajib tetap modul daun tanpa
// import: ribbon di klien memakai `peran.ts`, dan begitu berkas itu menyeret data
// layer, bundel klien ikut menarik server. Layar menerima PETA YANG SUDAH JADI dari
// sini, bukan bahan mentah untuk dihitung ulang — satu tempat yang menghitung, jadi
// layar tidak punya kesempatan berbeda pendapat dengan server.
import { APP_BLUD, getPenimpa, getPetaPenimpa } from '@/lib/data/menu-access'
import { keyMenuBlud } from '@/lib/registry/menu-apps'
import { izinMenu, MENU_BLUD, type Izin, type MenuBlud } from './peran'

export type PetaIzinBlud = Record<MenuBlud, Izin>

export async function izinBlud(userId: number, role: string, menu: MenuBlud): Promise<Izin> {
  const penimpa = await getPenimpa(userId, role, APP_BLUD, keyMenuBlud(menu))
  return izinMenu(role, menu, penimpa)
}

/** Dua belas menu sekali baca — dipakai layout BLUD supaya ribbon tidak memicu 12 query. */
export async function petaIzinBlud(userId: number, role: string): Promise<PetaIzinBlud> {
  const penimpa = await getPetaPenimpa(userId, role, APP_BLUD)
  const peta = {} as PetaIzinBlud
  for (const menu of MENU_BLUD) {
    peta[menu] = izinMenu(role, menu, penimpa.get(keyMenuBlud(menu)) ?? null)
  }
  return peta
}

/**
 * Izin yang berlaku hari ini menurut kode saja — tanpa menyentuh DB.
 * Dipakai Admin Panel untuk menampilkan "bawaan peran" di layar pengaturan, dan
 * oleh tes 60 sel sebagai pembanding.
 */
export function petaIzinBawaan(role: string): PetaIzinBlud {
  const peta = {} as PetaIzinBlud
  for (const menu of MENU_BLUD) peta[menu] = izinMenu(role, menu)
  return peta
}
