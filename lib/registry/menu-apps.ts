// lib/registry/menu-apps.ts — daftar modul yang punya pengaturan akses PER MENU.
// Konsep: docs/CONCEPT-menu-access-control.md §4.1
//
// DATA MURNI: tidak mengimpor React, ikon, maupun data layer — supaya bisa dipakai
// server, klien, dan Zod tanpa efek samping. Yang diimpornya cuma `peran.ts` tiap
// modul, yang sendirinya modul daun.
//
// Ini bentuk kecil dari registry Fase 1. Yang ia selesaikan cuma satu hal, tapi hal
// yang tepat: sebelum ada berkas ini, nama modul `'blud'` tertulis di tiga tempat
// terpisah (daftar key menu, allowlist Zod, dan panel Admin). Terbukti saat PK masuk
// sebagai modul kedua (2026-08-03): ketiganya tidak perlu disentuh sama sekali —
// yang bertambah cuma satu entri di bawah.
//
// Yang BELUM ia lakukan, dan sengaja: menggantikan enam daftar modul hardcoded di §1.2
// (kartu /menu, checkbox akses aplikasi, label App Control, dst.). Itu Fase 1 penuh.
import {
  LABEL_MENU, MENU_BACA_SAJA, MENU_BLUD, izinMenu as izinMenuBlud, type Izin, type MenuBlud,
} from '@/lib/blud/peran'
import {
  LABEL_MENU_PK, LANTAI_EDIT, MENU_BACA_SAJA_PK, MENU_PK,
  izinMenu as izinMenuPk, type MenuPk,
} from '@/lib/pk/peran'

export type { Izin }

export type InfoMenu = {
  key: string
  label: string
  /** Tidak punya jalur tulis sama sekali — posisi "boleh ubah" tidak berarti apa-apa. */
  bacaSaja: boolean
  /**
   * Kalau diisi: "boleh ubah" hanya berarti bagi peran-peran ini; untuk peran lain
   * selnya dimatikan di matriks. Dipakai Master Pejabat (PII) — route-nya menolak
   * siapa pun di luar daftar ini walau matriksnya diatur EDIT, jadi menawarkan
   * saklarnya sama saja dengan berbohong ke admin.
   */
  editHanyaPeran?: readonly string[]
}

export type AplikasiMenu = {
  key: string
  label: string
  menus: readonly InfoMenu[]
  /**
   * Peran yang naik ke grup atas pemilih di tab matriks Admin Panel. **Bukan** daftar
   * siapa yang boleh diatur — semua peran bisa, dan semuanya muncul; ini cuma urutan
   * baca, supaya yang biasa dipakai tidak tenggelam di antara 22 peran.
   *
   * Bukan pula daftar siapa yang berhak — itu urusan `TABEL` tiap modul dan grant
   * `app_access`. SUPER_ADMIN sengaja tidak pernah bisa diatur (§4.5.4 nomor 5).
   */
  peranUtama: readonly string[]
}

/** `tutup-kas` → `blud.tutup_kas`. Titik memisahkan modul, garis bawah di dalam nama menu. */
export function keyMenuBlud(menu: MenuBlud): string {
  return `blud.${menu.replace(/-/g, '_')}`
}

/**
 * `unit-kerja` → `perjanjian_kinerja.unit_kerja`.
 * Awalannya WAJIB sama dengan key `app_access` PK (`PK_APP_KEY`), bukan singkatan
 * seperti `pk`. Pembersihan baris yatim saat grant modul dicabut mencocokkan
 * `app_key` dengan key grant; kalau berbeda, izin per-menu akan hidup terus untuk
 * orang yang aksesnya sudah dicabut.
 */
export function keyMenuPk(menu: MenuPk): string {
  return `perjanjian_kinerja.${menu.replace(/-/g, '_')}`
}

export const MENU_APPS: readonly AplikasiMenu[] = [
  {
    key: 'blud',
    label: 'BLUD',
    peranUtama: ['ADMIN', 'PROGRAM', 'KEUANGAN', 'PERBENDAHARAAN'],
    menus: MENU_BLUD.map((m) => ({
      key: keyMenuBlud(m),
      label: LABEL_MENU[m],
      bacaSaja: MENU_BACA_SAJA.includes(m),
    })),
  },
  {
    key: 'perjanjian_kinerja',
    label: 'Perjanjian Kinerja',
    peranUtama: ['ADMIN', 'ADMIN_KASUBAG', 'ADMIN_KABAG', 'RENBANG', 'PROGRAM'],
    menus: MENU_PK.map((m) => ({
      key: keyMenuPk(m),
      label: LABEL_MENU_PK[m],
      bacaSaja: MENU_BACA_SAJA_PK.includes(m),
      editHanyaPeran: LANTAI_EDIT[m],
    })),
  },
]

export const MENU_APP_KEYS = MENU_APPS.map((a) => a.key) as readonly string[]

const PETA_APP = new Map(MENU_APPS.map((a) => [a.key, a]))
const PETA_MENU = new Map(
  MENU_APPS.flatMap((a) => a.menus.map((m) => [`${a.key}\0${m.key}`, m] as const)),
)

export function aplikasiMenu(appKey: string): AplikasiMenu | null {
  return PETA_APP.get(appKey) ?? null
}

/**
 * Izin sebuah key menu menurut `TABEL` modul pemiliknya. Registry-lah satu-satunya
 * yang tahu key mana milik modul mana, jadi pemetaannya tinggal di sini — kalau
 * tidak, Admin Panel harus meng-`if` nama modul tiap kali ada modul baru, dan itu
 * persis daftar hardcoded yang mau dihapus berkas ini.
 *
 * Penyelesainya disimpan per-key, bukan diurai dari string key-nya. Menerjemahkan
 * `perjanjian_kinerja.unit_kerja` balik jadi `unit-kerja` dengan potong-dan-ganti
 * akan diam-diam salah pada hari ada nama menu yang memang bergaris bawah.
 *
 * `null` = key tidak dikenal (sisa menu yang sudah dihapus/berganti nama).
 */
type PenyelesaiIzin = (role: string, penimpa: Izin | null) => Izin
const PENYELESAI = new Map<string, PenyelesaiIzin>([
  ...MENU_BLUD.map((m) => [keyMenuBlud(m), (role: string, p: Izin | null) => izinMenuBlud(role, m, p)] as const),
  ...MENU_PK.map((m) => [keyMenuPk(m), (role: string, p: Izin | null) => izinMenuPk(role, m, p)] as const),
])

export function izinMenuRegistry(
  appKey: string, menuKey: string, role: string, penimpa: Izin | null = null,
): Izin | null {
  if (!PETA_MENU.has(`${appKey}\0${menuKey}`)) return null
  return PENYELESAI.get(menuKey)?.(role, penimpa) ?? null
}

/** `null` = key tidak dikenal registry — sisa menu yang sudah dihapus/berganti nama (§5). */
export function infoMenu(appKey: string, menuKey: string): InfoMenu | null {
  return PETA_MENU.get(`${appKey}\0${menuKey}`) ?? null
}

export function semuaKeyMenu(appKey: string): readonly string[] {
  return aplikasiMenu(appKey)?.menus.map((m) => m.key) ?? []
}
