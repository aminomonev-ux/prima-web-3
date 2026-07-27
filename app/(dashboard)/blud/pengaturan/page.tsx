// app/(dashboard)/blud/pengaturan/page.tsx
// Server component — auth + role guard. Data versi history di-fetch client-side
// supaya bisa refresh after delete tanpa router.refresh().
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import PengaturanClient from './pengaturan-client'
import { isBludRole, canHapusVersi } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PengaturanPage() {
  const h    = await headers()
  const uid  = h.get('x-user-id')
  const role = h.get('x-user-role') as Role | null

  if (!uid || !role) redirect('/login')
  if (!(await hasAppAccess(Number(uid), role, isBludRole))) redirect('/menu')

  // S5: klien hanya menyembunyikan tombolnya. Pagar sungguhannya di route DELETE —
  // menyembunyikan tanpa memagari bukan izin, cuma dekorasi.
  return <PengaturanClient bolehHapus={canHapusVersi(role)} />
}
