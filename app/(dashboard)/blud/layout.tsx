// app/(dashboard)/blud/layout.tsx — Server component, baca session lalu render BludShell
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BludShell from './blud-shell'
import { sql, queryOne } from '@/lib/data/db'
import { isBludRole } from '@/lib/blud/schemas'
import { hasAppAccess, modulSedangMati } from '@/lib/security/guard'
import type { Role } from '@/types'

export const dynamic = 'force-dynamic'

export default async function BludLayout({ children }: { children: React.ReactNode }) {
  const h        = await headers()
  const userId   = h.get('x-user-id')
  const username = h.get('x-username')
  const role     = h.get('x-user-role') as Role | null

  if (!userId || !username || !role) redirect('/login')
  if (!(await hasAppAccess(Number(userId), role, isBludRole))) redirect('/menu')

  // S4 — kartu BLUD di /menu memang sudah abu saat maintenance, tapi itu cuma
  // menutup SATU pintu. Mengetik /blud/dpa langsung dan FloatingDock antar-modul
  // melewatinya. Diperiksa di sini karena layout ini dilewati semua layar BLUD.
  // SUPER_ADMIN dikecualikan, sama seperti aturan di /menu — yang mematikan modul
  // tetap harus bisa masuk memeriksanya.
  if (role !== 'SUPER_ADMIN' && await modulSedangMati('app_status_blud')) {
    redirect(`/maintenance?app=${encodeURIComponent('BLUD - Anggaran')}`)
  }

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
