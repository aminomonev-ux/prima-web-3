// app/(dashboard)/perjanjian-kinerja/pejabat/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

const PejabatClient = dynamicImport(() => import('./pejabat-client'))

// Admin-only guard di server: SUPER_ADMIN + ADMIN saja yang boleh akses halaman ini.
// Pattern mirror dengan backend POST /api/perjanjian-kinerja/pejabat yang juga whitelist.
export default async function PejabatPage() {
  const h = await headers()
  const role = h.get('x-user-role') as Role | null
  if (!role) redirect('/login')
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect('/perjanjian-kinerja')
  return <PejabatClient />
}
