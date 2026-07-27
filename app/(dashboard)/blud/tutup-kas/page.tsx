// app/(dashboard)/blud/tutup-kas/page.tsx
// Dua izin berbeda di satu layar: MENUTUP ikut izin menu, MEMBUKA punya daftar
// perannya sendiri yang lebih sempit (§4.5). Keduanya cuma menyembunyikan tombol —
// yang menentukan tetap route POST & DELETE.
import TutupKasClient from './tutup-kas-client'
import { izinLayar } from '../_izin'
import { bolehBukaPeriode } from '@/lib/blud/realisasi-schemas'

export const dynamic = 'force-dynamic'

export default async function TutupKasPage() {
  const { role, bolehUbah } = await izinLayar('tutup-kas')
  return <TutupKasClient bolehUbah={bolehUbah} bolehBukaKembali={bolehBukaPeriode(role)} />
}
