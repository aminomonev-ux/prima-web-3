// app/(dashboard)/perjanjian-kinerja/_izin.ts — izin per-layar untuk server component PK.
// Konsep: docs/CONCEPT-pk-peran.md §7
//
// `layout.tsx` sudah menjaga pintu modul (`hasAppAccess`), jadi di sini tinggal
// satu sumbu lagi: menu ini boleh dibuka atau tidak, dan boleh diubah atau tidak.
// Nilainya dititipkan ke klien sebagai `bolehUbah` — semata untuk menyembunyikan
// tombol. Pagar yang menentukan tetap di route (`app/api/perjanjian-kinerja/_guard.ts`).
import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { bolehEdit, type Izin, type MenuPk } from '@/lib/pk/peran'
import { petaIzinPk, type PetaIzinPk } from '@/lib/pk/izin-server'
import type { Role } from '@/types'

export type IzinLayarPk = {
  role: Role
  bolehUbah: boolean
  izin: Izin
  /**
   * Izin tujuh menu sekaligus. Dipakai layar yang MENUNJUK menu lain — mis. Form PK
   * yang menulis "lengkapi Master Sasaran dulu". Tautan ke menu yang bagi orang itu
   * `TIDAK` harus turun jadi teks biasa: mengarahkan orang ke pintu yang akan
   * melemparnya balik lebih membingungkan daripada tidak menawarkan pintunya.
   */
  peta: PetaIzinPk
}

export async function izinLayarPk(menu: MenuPk): Promise<IzinLayarPk> {
  const h    = await headers()
  const uid  = h.get('x-user-id')
  const role = h.get('x-user-role') as Role | null

  if (!uid || !role) redirect('/login')

  // Izin hasil resolusi dua lapis (perkecualian orang > aturan peran > bawaan kode),
  // bukan dihitung dari role saja — kalau tidak, pengaturan per-orang di Admin Panel
  // tidak berpengaruh pada layar, dan layar berbeda pendapat dengan route.
  // Tujuh menu sekali baca: `layout.tsx` sudah memanggilnya, jadi ini kena cache.
  const peta = await petaIzinPk(Number(uid), role)
  const izin = peta[menu]

  // Ke Beranda PK, bukan /menu — orangnya berhak masuk modul, cuma tidak ke menu ini.
  // Melemparnya keluar modul akan terasa seperti kehilangan akses.
  if (izin === 'TIDAK') redirect('/perjanjian-kinerja')

  // `bolehEdit`, bukan `izin === 'EDIT'`: lantai peran Master Pejabat & Master Unit
  // ikut diperhitungkan di sini, supaya tombol Simpan tidak muncul untuk orang yang
  // pasti ditolak route-nya.
  return { role, bolehUbah: bolehEdit(role, menu, peta[menu]), izin, peta }
}
