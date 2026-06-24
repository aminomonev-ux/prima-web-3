// app/(dashboard)/blud/cetak/page.tsx
// Server component — auth guard + role check. Data fetching dilakukan client-side
// (toolbar interaktif, user pilih versi sebelum fetch).
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import CetakClient from './cetak-client'
import { isBludRole } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

export default async function CetakPage() {
  const h    = await headers()
  const uid  = h.get('x-user-id')
  const role = h.get('x-user-role') as Role | null

  if (!uid || !role) redirect('/login')
  if (!(await hasAppAccess(Number(uid), role, isBludRole))) redirect('/menu')

  return <CetakClient />
}
