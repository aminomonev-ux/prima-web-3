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
import { hasAppAccess, modulMati } from '@/lib/security/guard'
import { isBludRole } from '@/lib/blud/schemas'
import { LABEL_MENU, type MenuBlud } from '@/lib/blud/peran'
import { izinBlud, petaIzinBlud } from '@/lib/blud/izin-server'

export const FLAG_BLUD = 'app_status_blud'
export const FLAG_BLUD_REALISASI = 'app_status_blud_realisasi'

/**
 * S4 — sakelar mati modul. Dipanggil di TIAP route, sesudah `getSession()` dan
 * sebelum apa pun yang menyentuh data:
 *
 *   const mati = await bludMati(session.role)  // route umum BLUD
 *   if (mati) return mati
 *
 * Sengaja TIDAK dilebur ke `bolehBukaMenu`. Dua alasannya: hasilnya akan jadi 403
 * padahal ini 503, dan lebih halus — `bolehBukaMenu` menjawab "siapa Anda",
 * sedangkan ini menjawab "apakah modulnya sedang hidup". Menggabung dua pertanyaan
 * berbeda ke satu jawaban boolean membuat keduanya sulit diperbaiki terpisah.
 *
 * Berjenjang: mematikan BLUD ikut mematikan Realisasi, tidak sebaliknya.
 *
 * S1 — `role` dioper supaya `PERAN_TEMBUS_SAKELAR` berlaku sama seperti di layar.
 * Lupa mengopernya TIDAK menimbulkan error: SUPER_ADMIN cuma kembali ditolak 503
 * di layar yang membiarkannya masuk. Yang menangkap kelalaian itu pemeriksaan
 * statis di `scripts/test-blud-killswitch.mjs`, bukan tsc.
 */
export function bludMati(role?: string, lingkup?: 'realisasi') {
  return lingkup === 'realisasi'
    ? modulMati([FLAG_BLUD, FLAG_BLUD_REALISASI], { role })
    : modulMati([FLAG_BLUD], { role })
}

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
  if (!(await hasAppAccess(userId, role, isBludRole))) return false
  return (await izinBlud(userId, role, menu)) !== 'TIDAK'
}

/** Menu ini boleh diubah isinya. */
export async function bolehEditMenu(userId: number, role: string, menu: MenuBlud): Promise<boolean> {
  if (!(await hasAppAccess(userId, role, isBludRole))) return false
  return (await izinBlud(userId, role, menu)) === 'EDIT'
}

/**
 * Endpoint BACA yang datanya ditampilkan beberapa layar. Cukup salah satu menu terbuka.
 *
 * Guard sebuah endpoint baca menyebut menu yang **menampilkan** datanya, bukan yang
 * "memiliki"-nya — kepemilikan itu asumsi yang tidak pernah benar. `pagu` dipakai layar
 * Buku Kas DAN Realisasi; `master-akun` dipakai layar Master Akun, DPA, dan Pergeseran.
 * Menolak pemegang menu Realisasi membaca `pagu` tidak menjaga apa pun — angkanya toh
 * sudah tampil di layarnya; yang terjadi cuma layar sah yang rusak begitu menu lain
 * disembunyikan. Pola `||` ini sudah dipakai `realisasi/permintaan` sejak awal.
 *
 * Hanya untuk BACA. Pagar tulis tetap satu menu — pemiliknya.
 */
export async function bolehLihatSalahSatu(userId: number, role: string, menus: readonly MenuBlud[]): Promise<boolean> {
  if (!(await hasAppAccess(userId, role, isBludRole))) return false
  const peta = await petaIzinBlud(userId, role)
  return menus.some((m) => peta[m] !== 'TIDAK')
}

/**
 * Metadata modul yang dipakai hampir semua layar — hari ini cuma daftar tahun
 * (`?mode=tahun-list`), isi dropdown yang ada di 7 dari 12 layar BLUD.
 *
 * Sengaja TIDAK terikat menu mana pun. Menempelkannya ke menu DPA adalah kekeliruan
 * penggolongan: yang dijawab bukan "apa isi DPA" melainkan "tahun berapa saja yang ada
 * datanya". Mengikatnya ke DPA membuat menyembunyikan menu DPA merusak enam layar lain.
 */
export async function bolehModulBlud(userId: number, role: string): Promise<boolean> {
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
