// app/(dashboard)/blud/bukti-setor/page.tsx
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import BuktiSetorClient from './bukti-setor-client'

export const dynamic = 'force-dynamic'

export default async function BuktiSetorPage() {
  const h = await headers()
  if (!h.get('x-user-id')) redirect('/login')
  return <BuktiSetorClient />
}
