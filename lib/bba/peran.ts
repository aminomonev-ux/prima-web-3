// lib/bba/peran.ts — izin dua sumbu modul Buku Besar Aset: peran × bagian.
// Konsep: docs/CONCEPT-bba-buku-aset.md §3.1, §16
//
// MODUL DAUN — tidak mengimpor apa pun (pola `lib/pk/peran.ts`). Layar memakainya untuk
// menyembunyikan tombol, route untuk pagar sungguhannya; keduanya membaca tabel yang sama.

export const MENU_BBA = ['aset', 'rencana', 'pengadaan', 'master', 'cetak'] as const
export type MenuBba = typeof MENU_BBA[number]

/** EDIT = boleh mengubah · LIHAT = boleh membuka & MENGUNDUH · TIDAK = ditolak. */
export type Izin = 'EDIT' | 'LIHAT' | 'TIDAK'

export const LABEL_MENU_BBA: Record<MenuBba, string> = {
  aset:      'Buku Aset',
  rencana:   'Rencana',
  pengadaan: 'Pengadaan',
  master:    'Master',
  cetak:     'Cetak & Excel',
}

interface AturanPeran {
  bawaan: Izin
  khusus?: Partial<Record<MenuBba, Izin>>
}

/**
 * §3.1: Umum Aset = role `RUMAH TANGGA`, Perencanaan = role `PROGRAM`. Pengadaan TIDAK
 * punya baris di sini — petugasnya bisa ber-role apa saja, jadi izinnya diberikan per
 * orang lewat Pusat Akses. Memasangnya per role akan ikut membuka semua akun ber-role itu.
 */
const TABEL: Record<string, AturanPeran> = {
  SUPER_ADMIN:    { bawaan: 'EDIT' },
  ADMIN:          { bawaan: 'EDIT' },
  'RUMAH TANGGA': { bawaan: 'LIHAT', khusus: { aset: 'EDIT', master: 'EDIT' } },
  PROGRAM:        { bawaan: 'LIHAT', khusus: { rencana: 'EDIT' } },
}

/**
 * Peran ber-grant `app_access` yang tidak ada di tabel. LIHAT, bukan EDIT: grant
 * berarti "boleh masuk", wewenang menulis diberikan sadar lewat matriks Admin Panel.
 *
 * PERUBAHAN PERILAKU yang disengaja (Tahap A): sebelum ini setiap pemegang grant BBA
 * bisa mengubah semuanya.
 */
const BAWAAN_TAK_TERDAFTAR: Izin = 'LIHAT'

/** Tanpa jalur tulis — Cetak hanya mengunduh. */
export const MENU_BACA_SAJA_BBA: readonly MenuBba[] = ['cetak']

/**
 * Halaman depan modul (`/buku-besar-aset`). Ditutup = orang yang berhak masuk modul
 * dilempar keluar dari pintunya sendiri; `izinLayarBba` melempar ke sini, jadi
 * menutupnya juga berarti lingkaran.
 */
const MENU_SELALU_TERBUKA: readonly MenuBba[] = ['rencana']

/** `penimpa` = izin dari Admin Panel (orang > peran), diselesaikan `lib/bba/izin-server.ts`. */
export function izinMenu(role: string, menu: MenuBba, penimpa?: Izin | null): Izin {
  const aturan = TABEL[role]
  const bawaan = aturan ? (aturan.khusus?.[menu] ?? aturan.bawaan) : BAWAAN_TAK_TERDAFTAR
  const izin = penimpa ?? bawaan
  // Sesudah penimpa — tidak bisa ditembus lewat Admin Panel.
  if (izin === 'EDIT' && MENU_BACA_SAJA_BBA.includes(menu)) return 'LIHAT'
  if (izin === 'TIDAK' && MENU_SELALU_TERBUKA.includes(menu)) return 'LIHAT'
  return izin
}

export function bolehEdit(role: string, menu: MenuBba, penimpa?: Izin | null): boolean {
  return izinMenu(role, menu, penimpa) === 'EDIT'
}

export function bolehBuka(role: string, menu: MenuBba, penimpa?: Izin | null): boolean {
  return izinMenu(role, menu, penimpa) !== 'TIDAK'
}

export function isMenuBba(v: unknown): v is MenuBba {
  return typeof v === 'string' && (MENU_BBA as readonly string[]).includes(v)
}
