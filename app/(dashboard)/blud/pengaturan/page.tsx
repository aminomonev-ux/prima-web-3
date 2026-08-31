// app/(dashboard)/blud/pengaturan/page.tsx
// Tiga izin berbeda di satu layar: mengisi Pejabat SPJ ikut izin menu, sedangkan
// MENGHAPUS versi dan MENJALANKAN pencadangan punya daftar perannya sendiri yang
// jauh lebih sempit (S5).
// Ketiganya cuma menyembunyikan tombol — pagarnya tetap di route.
import PengaturanClient from './pengaturan-client'
import { izinLayar } from '../_izin'
import { canHapusVersi, canCadangkanJson } from '@/lib/blud/schemas'

export const dynamic = 'force-dynamic'

export default async function PengaturanPage() {
  const { role, bolehUbah } = await izinLayar('pengaturan')
  // Tiga izin, tiga daftar peran terpisah — lihat catatan di `schemas.ts`.
  return (
    <PengaturanClient
      bolehUbah={bolehUbah}
      bolehHapus={canHapusVersi(role)}
      bolehCadang={canCadangkanJson(role)}
    />
  )
}
