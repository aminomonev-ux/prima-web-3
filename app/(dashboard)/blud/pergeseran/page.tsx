// app/(dashboard)/blud/pergeseran/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import PergeseranClient from './pergeseran-client'

export const dynamic = 'force-dynamic'

export default async function PergeseranPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <PergeseranClient />
}
