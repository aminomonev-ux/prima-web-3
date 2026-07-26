// app/(dashboard)/blud/tutup-kas/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import TutupKasClient from './tutup-kas-client'

export const dynamic = 'force-dynamic'

export default async function TutupKasPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  // Role dibaca dari header proxy (V3-1) — dipakai HANYA untuk menyembunyikan
  // tombol "Buka Kembali". Izin sebenarnya tetap dijaga di route DELETE.
  return <TutupKasClient superAdmin={h.get('x-user-role') === 'SUPER_ADMIN'} />
}
