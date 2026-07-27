// app/(dashboard)/blud/pergeseran/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import PergeseranClient from './pergeseran-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function PergeseranPage() {
  const { bolehUbah } = await izinLayar('pergeseran')
  return <PergeseranClient bolehUbah={bolehUbah} />
}
