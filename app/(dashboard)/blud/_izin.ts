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
import { bolehBuka, bolehEdit, type MenuBlud } from '@/lib/blud/peran'
import type { Role } from '@/types'

export async function izinLayar(menu: MenuBlud): Promise<{ role: Role; bolehUbah: boolean }> {
  const h    = await headers()
  const uid  = h.get('x-user-id')
  const role = h.get('x-user-role') as Role | null

  if (!uid || !role) redirect('/login')
  // Ke Beranda BLUD, bukan /menu — orangnya berhak masuk modul, cuma tidak
  // ke menu ini. Melemparnya keluar modul akan terasa seperti kehilangan akses.
  if (!bolehBuka(role, menu)) redirect('/blud')

  return { role, bolehUbah: bolehEdit(role, menu) }
}
