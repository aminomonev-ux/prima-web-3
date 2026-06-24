// app/(dashboard)/perjanjian-kinerja/layout.tsx
// Server layout: baca session via x-* headers (di-set proxy.ts), redirect ke /login
// kalau tidak ada. Fetch theme_preference dari DB lalu render PkShell + PkYearProvider.
// Pattern mirror app/(dashboard)/blud/layout.tsx.

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import PkShell from './pk-shell'
import { PkYearProvider } from './_context/PkYearContext'
import { sql, queryOne } from '@/lib/data/db'
import { isPkRole } from '@/lib/data/pk-schemas'
import { hasAppAccess } from '@/lib/security/guard'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

export default async function PerjanjianKinerjaLayout({ children }: { children: React.ReactNode }) {
  const h        = await headers()
  const userId   = h.get('x-user-id')
  const username = h.get('x-username')
  const role     = h.get('x-user-role') as Role | null

  if (!userId || !username || !role) redirect('/login')
  if (!(await hasAppAccess(Number(userId), role, isPkRole))) redirect('/menu')

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`,
  )
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light'

  return (
    <PkYearProvider>
      <PkShell username={username} role={role} themePreference={themePreference}>
        {children}
      </PkShell>
    </PkYearProvider>
  )
}
