// app/(dashboard)/blud/master-akun/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import MasterAkunClient from './master-akun-client'

export const dynamic = 'force-dynamic'

export default async function MasterAkunPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <MasterAkunClient />
}
