// app/api/blud/_guard.ts — gerbang akses seluruh route BLUD, per menu.
// Konsep: docs/CONCEPT-blud-peran.md §5.2, §5.4
//
// DUA LAPIS, dan urutannya penting:
//   1. `hasAppAccess(..., isBludRole)` — boleh masuk modul? (grant `app_access`)
//   2. `bolehEdit / bolehBuka` dari tabel peran — di dalam, boleh apa?
//
// Lapis kedua tidak menggantikan lapis pertama. Peran yang ada di tabel tapi tidak
// punya grant tetap ditolak di pintu; grant sendiri tidak lagi berarti wewenang
// penuh. Justru itu yang membuat grant aman diberikan lebih longgar dari dulu.
//
// Guard ditaruh di SETIAP route, bukan hanya di ribbon: menyembunyikan menu bukan
// keamanan — endpoint tetap bisa dipanggil lewat curl (pelajaran V3-1, dan baru
// saja diulang di S5).
import { NextResponse } from 'next/server'
import { hasAppAccess } from '@/lib/security/guard'
import { isBludRole } from '@/lib/blud/schemas'
import { bolehBuka, bolehEdit, LABEL_MENU, type MenuBlud } from '@/lib/blud/peran'

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
}

export function forbidden() {
  return NextResponse.json({ ok: false, error: 'Akses ditolak' }, { status: 403 })
}

/**
 * Menu ini boleh dibuka — termasuk MENGUNDUH. Unduh bukan aksi tulis walaupun
 * endpoint-nya `POST` (mis. `export-log` yang cuma mencatat jejak unduhan):
 * yang menentukan bukan metode HTTP, melainkan apakah angka resminya berubah.
 */
export async function bolehBukaMenu(userId: number, role: string, menu: MenuBlud): Promise<boolean> {
  if (!bolehBuka(role, menu)) return false
  return hasAppAccess(userId, role, isBludRole)
}

/** Menu ini boleh diubah isinya. */
export async function bolehEditMenu(userId: number, role: string, menu: MenuBlud): Promise<boolean> {
  if (!bolehEdit(role, menu)) return false
  return hasAppAccess(userId, role, isBludRole)
}

/**
 * 403 yang menyebut menunya. Pesan "Akses ditolak" polos membuat orang mengira
 * akunnya rusak; menyebut menu + sifat izinnya membuat ia tahu harus minta apa.
 */
export function tolakEdit(menu: MenuBlud) {
  return NextResponse.json({
    ok: false, code: 'MENU_BACA_SAJA',
    error: `Peran Anda hanya bisa melihat menu ${LABEL_MENU[menu]} — perubahan tidak disimpan. `
      + 'Hubungi Admin kalau memang perlu mengubahnya.',
  }, { status: 403 })
}
