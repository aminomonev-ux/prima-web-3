// app/(dashboard)/blud/pengaturan/page.tsx
// Dua izin berbeda di satu layar: mengisi Pejabat SPJ ikut izin menu, sedangkan
// MENGHAPUS versi punya daftar perannya sendiri yang jauh lebih sempit (S5).
// Keduanya cuma menyembunyikan tombol — pagarnya tetap di route.
import PengaturanClient from './pengaturan-client'
import { izinLayar } from '../_izin'
import { canHapusVersi } from '@/lib/blud/schemas'

export const dynamic = 'force-dynamic'

export default async function PengaturanPage() {
  const { role, bolehUbah } = await izinLayar('pengaturan')
  return <PengaturanClient bolehUbah={bolehUbah} bolehHapus={canHapusVersi(role)} />
}
