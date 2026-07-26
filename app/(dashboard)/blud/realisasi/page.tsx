// app/(dashboard)/blud/realisasi/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import RealisasiClient from './realisasi-client'

export const dynamic = 'force-dynamic'

export default async function RealisasiPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <RealisasiClient />
}
