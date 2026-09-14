// lib/admin/jejak-paket.ts — berapa hal disunting sesudah paket akses diterapkan (T6).
// BERKAS DAUN: dibaca panel `'use client'` dan skrip uji. Nol impor.
//
// Dulu layar mengirim `asal_paket: { diubah: 1 }` mati, jadi baris ACCESS_GRANT selalu
// berbunyi "1 hal diubah" berapa pun yang disunting. Angka karangan di jejak audit lebih
// buruk daripada tidak ada angka, karena ia dipercaya.

export type DrafAkses = {
  grant: readonly string[]
  menu: Readonly<Record<string, Readonly<Record<string, string>>>>
}

/**
 * Selisih antara isi form SESAAT sesudah paket diterapkan dan isi form saat Simpan:
 * satu pintu modul yang dibuka/ditutup = 1, satu sel izin menu yang berbeda (termasuk
 * yang ditambah atau dilepas) = 1.
 */
export function hitungSuntinganPaket(sesudahPaket: DrafAkses, kini: DrafAkses): number {
  const a = new Set(sesudahPaket.grant)
  const b = new Set(kini.grant)
  let n = 0
  for (const k of a) if (!b.has(k)) n++
  for (const k of b) if (!a.has(k)) n++
  const aplikasi = new Set([...Object.keys(sesudahPaket.menu), ...Object.keys(kini.menu)])
  for (const app of aplikasi) {
    const pa = sesudahPaket.menu[app] ?? {}
    const pb = kini.menu[app] ?? {}
    for (const menu of new Set([...Object.keys(pa), ...Object.keys(pb)])) {
      if (pa[menu] !== pb[menu]) n++
    }
  }
  return n
}
