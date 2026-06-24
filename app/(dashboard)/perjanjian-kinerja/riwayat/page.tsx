// app/(dashboard)/perjanjian-kinerja/riwayat/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

const RiwayatClient = dynamicImport(() => import('./riwayat-client'))

export default async function RiwayatPage() {
  const h = await headers()
  const role = h.get('x-user-role') as Role | null
  if (!role) redirect('/login')
  return <RiwayatClient role={role} />
}
