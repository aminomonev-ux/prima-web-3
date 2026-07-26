// app/(dashboard)/blud/buku-kas/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BukuKasClient from './buku-kas-client'

export const dynamic = 'force-dynamic'

export default async function BukuKasPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <BukuKasClient />
}
