// app/api/perjanjian-kinerja/_guard.ts — gerbang akses seluruh route PK, per menu.
// Konsep: docs/CONCEPT-pk-peran.md §6
// DUA LAPIS, dan urutannya penting:
//   1. `hasAppAccess(..., isPkRole)` — boleh masuk modul? (grant `app_access`)
//   2. `bolehEdit / bolehBuka` dari tabel peran — di dalam, boleh apa?
// Lapis kedua tidak menggantikan lapis pertama. Peran yang ada di tabel tapi tidak
// punya grant tetap ditolak di pintu; grant sendiri tidak lagi berarti wewenang
// penuh. Justru itu yang membuat grant aman diberikan lebih longgar dari dulu.
//
// Guard ditaruh di SETIAP route, bukan hanya di ribbon: menyembunyikan menu bukan
// keamanan — endpoint tetap bisa dipanggil lewat curl (pelajaran V3-1).
//
// Bentuk balasan sengaja `{ ok, message }`, BUKAN `{ ok, err }` seperti BLUD.
// Klien PK membaca `message` di semua layarnya; menyeragamkan nama kolom dengan
// BLUD akan membuat pesan galat berubah jadi "undefined" di tujuh layar.
import { NextResponse } from 'next/server'
import { hasAppAccess } from '@/lib/security/guard'
import { isPkRole } from '@/lib/data/pk-schemas'
import { LABEL_MENU_PK, LANTAI_EDIT, lantaiEditMenghalangi, type MenuPk } from '@/lib/pk/peran'
import { izinPk, petaIzinPk } from '@/lib/pk/izin-server'

export function unauthorized() {
  return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ ok: false, message: 'Akses ditolak' }, { status: 403 })
}

/**
 * Menu ini boleh dibuka — termasuk MENGUNDUH. Unduh bukan aksi tulis walaupun
 * endpoint-nya bisa saja mencatat jejak: yang menentukan bukan metode HTTP,
 * melainkan apakah angka resminya berubah.
 */
export async function bolehBukaMenu(userId: number, role: string, menu: MenuPk): Promise<boolean> {
  if (!(await hasAppAccess(userId, role, isPkRole))) return false
  return (await izinPk(userId, role, menu)) !== 'TIDAK'
}

/**
 * Menu ini boleh diubah isinya. Sudah memperhitungkan `LANTAI_EDIT` (Master Pejabat
 * & Master Unit) — lihat `lib/pk/peran.ts`. Lantainya DAN, bukan pengganti: izin
 * EDIT dari matriks tetap wajib, cek perannya menambah syarat di atasnya.
 */
export async function bolehEditMenu(userId: number, role: string, menu: MenuPk): Promise<boolean> {
  if (lantaiEditMenghalangi(role, menu)) return false
  if (!(await hasAppAccess(userId, role, isPkRole))) return false
  return (await izinPk(userId, role, menu)) === 'EDIT'
}

/**
 * Endpoint BACA yang datanya ditampilkan beberapa layar. Cukup salah satu menu terbuka.
 *
 * Guard sebuah endpoint baca menyebut menu yang MENAMPILKAN datanya, bukan yang
 * "memiliki"-nya — kepemilikan itu asumsi yang tidak pernah benar. Daftar dokumen PK
 * dipakai Beranda, Form, dan Riwayat sekaligus; daftar unit kerja jadi isi dropdown di
 * Form dan Master Pejabat. Menolak pemegang menu Form membaca daftar unit tidak
 * menjaga apa pun — namanya toh sudah tampil di layarnya; yang terjadi cuma layar sah
 * yang rusak begitu menu lain disembunyikan.
 *
 * Hanya untuk BACA. Pagar tulis tetap satu menu — pemiliknya.
 */
export async function bolehLihatSalahSatu(
  userId: number, role: string, menus: readonly MenuPk[],
): Promise<boolean> {
  if (!(await hasAppAccess(userId, role, isPkRole))) return false
  const peta = await petaIzinPk(userId, role)
  return menus.some((m) => peta[m] !== 'TIDAK')
}

/**
 * Metadata modul yang dipakai hampir semua layar. Sengaja TIDAK terikat menu mana pun:
 * menempelkannya ke satu menu adalah kekeliruan penggolongan, dan menyembunyikan menu
 * itu akan merusak layar-layar lain yang tak ada urusannya.
 */
export async function bolehModulPk(userId: number, role: string): Promise<boolean> {
  return hasAppAccess(userId, role, isPkRole)
}

/**
 * 403 yang menyebut menunya. Pesan "Akses ditolak" polos membuat orang mengira
 * akunnya rusak; menyebut menu + sifat izinnya membuat ia tahu harus minta apa.
 */
export function tolakEdit(menu: MenuPk) {
  return NextResponse.json({
    ok: false, code: 'MENU_BACA_SAJA',
    message: `Peran Anda hanya bisa melihat menu ${LABEL_MENU_PK[menu]} — perubahan tidak disimpan. `
      + 'Hubungi Admin kalau memang perlu mengubahnya.',
  }, { status: 403 })
}

/**
 * 403 untuk menu berlantai keras. Dipisah dari `tolakEdit` karena sebabnya berbeda
 * dan jalan keluarnya juga berbeda: yang ini tidak bisa dibuka lewat Admin Panel
 * sama sekali. Menyamakan pesannya akan mengirim orang meminta sesuatu yang tidak
 * akan pernah diberikan.
 */
export function tolakLantai(menu: MenuPk) {
  const peran = LANTAI_EDIT[menu] ?? []
  return NextResponse.json({
    ok: false, code: 'LANTAI_PERAN',
    message: `Isi ${LABEL_MENU_PK[menu]} hanya dapat diubah oleh ${peran.join(' & ')}.`,
  }, { status: 403 })
}
