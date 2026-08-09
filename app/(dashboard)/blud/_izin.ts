// app/(dashboard)/blud/_izin.ts — izin per-layar untuk server component BLUD.
// Konsep: docs/CONCEPT-blud-peran.md §8 Fase C
//
// `layout.tsx` sudah menjaga pintu modul (`hasAppAccess`), jadi di sini tinggal
// satu sumbu lagi: menu ini boleh dibuka atau tidak, dan boleh diubah atau tidak.
// Nilainya dititipkan ke klien sebagai `bolehUbah` — semata untuk menyembunyikan
// tombol. Pagar yang menentukan tetap di route (`app/api/blud/_guard.ts`).
import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { MENU_REALISASI, LABEL_MENU, type Izin, type MenuBlud } from '@/lib/blud/peran'
import { petaIzinBlud, type PetaIzinBlud } from '@/lib/blud/izin-server'
import { modulSedangMati } from '@/lib/security/guard'
import type { Role } from '@/types'

export type IzinLayar = {
  role: Role
  bolehUbah: boolean
  izin: Izin
  /**
   * Izin 12 menu sekaligus. Dipakai layar yang MENUNJUK menu lain — mis. Realisasi
   * yang menulis "susun DPA lebih dulu di menu DPA BLUD". Tautan ke menu yang bagi
   * orang itu `TIDAK` harus turun jadi teks biasa: mengarahkan orang ke pintu yang
   * akan melemparnya balik lebih membingungkan daripada tidak menawarkan pintunya.
   */
  peta: PetaIzinBlud
}

export async function izinLayar(menu: MenuBlud): Promise<IzinLayar> {
  const h    = await headers()
  const uid  = h.get('x-user-id')
  const role = h.get('x-user-role') as Role | null

  if (!uid || !role) redirect('/login')

  // Izin hasil resolusi dua lapis (perkecualian orang > aturan peran > bawaan kode),
  // bukan dihitung dari role saja — kalau tidak, pengaturan per-orang di Admin Panel
  // tidak akan berpengaruh pada layar, dan layar akan berbeda pendapat dengan route.
  // Dua belas menu sekali baca: `layout.tsx` sudah memanggilnya, jadi ini kena cache.
  const peta = await petaIzinBlud(Number(uid), role)
  const izin = peta[menu]

  // Ke Beranda BLUD, bukan /menu — orangnya berhak masuk modul, cuma tidak
  // ke menu ini. Melemparnya keluar modul akan terasa seperti kehilangan akses.
  if (izin === 'TIDAK') redirect('/blud')

  // N4 — sakelar sub-modul Realisasi. Diperiksa di sini, bukan di `layout.tsx`:
  // layout tidak tahu layar mana yang sedang dibuka, sedangkan fungsi ini memang
  // dipanggil dengan nama menunya. Satu tempat, tidak diulang di 4 halaman.
  //
  // Sengaja TIDAK digabung ke `bolehBuka`: "modul dimatikan" itu keadaan sementara
  // yang hilang sendiri, "Anda tidak berhak" harus ditanyakan ke admin. Menyatukan
  // keduanya membuat pesan yang satu terbaca sebagai yang lain.
  if (MENU_REALISASI.includes(menu)
      && await modulSedangMati(['app_status_blud_realisasi'], { role })) {
    redirect(`/maintenance?app=${encodeURIComponent(`BLUD - ${LABEL_MENU[menu]}`)}`)
  }

  return { role, bolehUbah: izin === 'EDIT', izin, peta }
}
