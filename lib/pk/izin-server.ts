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
import { modul } from '@/lib/registry/apps'
import { modulDibekukan } from '@/lib/security/guard'
import { izinMenu, MENU_PK, type Izin, type MenuPk } from './peran'

export type PetaIzinPk = Record<MenuPk, Izin>

const FLAG = modul('perjanjian_kinerja')?.sakelar ?? ''
const bekuPk = (role: string) => modulDibekukan([FLAG], { role })

/**
 * P5 — saat modulnya dibekukan, izin apa pun dijepit ke `LIHAT`.
 *
 * Dipasang DI SINI, di satu-satunya tempat yang menyelesaikan izin menu, karena dari
 * sinilah dua hal berangkat sekaligus: ribbon di layar (tombol simpan mati) DAN
 * `bolehEditMenu` di `_guard.ts` (route menolak). Menjepitnya di layar saja akan
 * mengulangi L82 — tombol mati bukan pagar; menjepitnya di route saja membuat orang
 * mengetik satu jam lalu ditolak saat menekan Simpan.
 *
 * Ini pagar KEDUA, bukan satu-satunya: `modulMati` sudah menolak metode tulis di
 * seluruh route BLUD/PK lewat sakelar yang sama. Yang ditambahkan di sini bagian yang
 * TERLIHAT — dan itu bedanya "tombolnya mati dengan alasan" dari "tombolnya hidup lalu
 * gagal".
 *
 * `role` dioper supaya PERAN_TEMBUS_SAKELAR berlaku sama seperti di tempat lain.
 */
function jepitBeku(izin: Izin, beku: boolean): Izin {
  return beku && izin === 'EDIT' ? 'LIHAT' : izin
}


export async function izinPk(userId: number, role: string, menu: MenuPk): Promise<Izin> {
  const [penimpa, beku] = await Promise.all([
    getPenimpa(userId, role, APP_PK, keyMenuPk(menu)),
    bekuPk(role),
  ])
  return jepitBeku(izinMenu(role, menu, penimpa), beku)
}

/** Tujuh menu sekali baca — dipakai layout PK supaya ribbon tidak memicu 7 query. */
export async function petaIzinPk(userId: number, role: string): Promise<PetaIzinPk> {
  const [penimpa, beku] = await Promise.all([
    getPetaPenimpa(userId, role, APP_PK),
    bekuPk(role),
  ])
  const peta = {} as PetaIzinPk
  for (const menu of MENU_PK) {
    peta[menu] = jepitBeku(izinMenu(role, menu, penimpa.get(keyMenuPk(menu)) ?? null), beku)
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
