// app/(dashboard)/blud/layout.tsx — Server component, baca session lalu render BludShell
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BludShell from './blud-shell'
import { sql, queryOne } from '@/lib/data/db'
import { isBludRole } from '@/lib/blud/schemas'
import { hasAppAccess } from '@/lib/security/guard'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

export default async function BludLayout({ children }: { children: React.ReactNode }) {
  const h        = await headers()
  const userId   = h.get('x-user-id')
  const username = h.get('x-username')
  const role     = h.get('x-user-role') as Role | null

  if (!userId || !username || !role) redirect('/login')
  if (!(await hasAppAccess(Number(userId), role, isBludRole))) redirect('/menu')

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`
  )
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light'

  return (
    <BludShell username={username} role={role} themePreference={themePreference}>
      {children}
    </BludShell>
  )
}
