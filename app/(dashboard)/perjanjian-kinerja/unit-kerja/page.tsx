// app/(dashboard)/perjanjian-kinerja/unit-kerja/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

const UnitKerjaClient = dynamicImport(() => import('./unit-kerja-client'))

export default async function UnitKerjaPage() {
  const h = await headers()
  const role = h.get('x-user-role') as Role | null
  if (!role) redirect('/login')
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect('/perjanjian-kinerja')
  return <UnitKerjaClient />
}
