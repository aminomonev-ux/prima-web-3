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
import { modul } from '@/lib/registry/apps'
import { modulDibekukan } from '@/lib/security/guard'
import { izinMenu, MENU_BLUD, type Izin, type MenuBlud } from './peran'

export type PetaIzinBlud = Record<MenuBlud, Izin>

/** Kunci sakelarnya dibaca dari registry, bukan diketik — daftar keempat yang menyebut
 *  `app_status_blud` adalah daftar keempat yang bisa ketinggalan. */
const FLAG = modul('blud')?.sakelar ?? ''
const bekuBlud = (role: string) => modulDibekukan([FLAG], { role })

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


export async function izinBlud(userId: number, role: string, menu: MenuBlud): Promise<Izin> {
  const [penimpa, beku] = await Promise.all([
    getPenimpa(userId, role, APP_BLUD, keyMenuBlud(menu)),
    bekuBlud(role),
  ])
  return jepitBeku(izinMenu(role, menu, penimpa), beku)
}

/** Dua belas menu sekali baca — dipakai layout BLUD supaya ribbon tidak memicu 12 query. */
export async function petaIzinBlud(userId: number, role: string): Promise<PetaIzinBlud> {
  const [penimpa, beku] = await Promise.all([
    getPetaPenimpa(userId, role, APP_BLUD),
    bekuBlud(role),
  ])
  const peta = {} as PetaIzinBlud
  for (const menu of MENU_BLUD) {
    peta[menu] = jepitBeku(izinMenu(role, menu, penimpa.get(keyMenuBlud(menu)) ?? null), beku)
  }
  return peta
}
