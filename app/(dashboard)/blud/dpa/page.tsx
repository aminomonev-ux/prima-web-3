// app/(dashboard)/blud/dpa/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import DpaClient from './dpa-client'

export const dynamic = 'force-dynamic'

export default async function DpaPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <DpaClient />
}
