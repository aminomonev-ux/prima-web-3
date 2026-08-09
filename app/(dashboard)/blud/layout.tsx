// app/(dashboard)/blud/layout.tsx — Server component, baca session lalu render BludShell
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BludShell from './blud-shell'
import { sql, queryOne } from '@/lib/data/db'
import { isBludRole } from '@/lib/blud/schemas'
import { hasAppAccess, modulSedangMati } from '@/lib/security/guard'
import { petaIzinBlud } from '@/lib/blud/izin-server'
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
  // Pengecualian perannya (`PERAN_TEMBUS_SAKELAR`) sekarang dipegang guard, bukan
  // ditulis ulang di sini — dulu layar dan API punya aturan sendiri-sendiri, dan
  // yang di API tidak ada sama sekali (S1).
  if (await modulSedangMati(['app_status_blud'], { role })) {
    redirect(`/maintenance?app=${encodeURIComponent('BLUD - Anggaran')}`)
  }

  const row = await queryOne<{ theme_preference: string }>(
    sql`SELECT theme_preference FROM users WHERE id = ${Number(userId)} LIMIT 1`
  )
  const themePreference = (row?.theme_preference ?? 'dark') as 'dark' | 'light'

  // Dua belas menu diselesaikan sekali di sini, bukan per tile — layout ini dilewati
  // semua layar BLUD, jadi ribbon tidak pernah memicu 12 pemeriksaan terpisah.
  const izin = await petaIzinBlud(Number(userId), role)

  return (
    <BludShell username={username} role={role} izin={izin} themePreference={themePreference}>
      {children}
    </BludShell>
  )
}
