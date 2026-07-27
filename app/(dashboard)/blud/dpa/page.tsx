// app/(dashboard)/blud/dpa/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import DpaClient from './dpa-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function DpaPage() {
  const { bolehUbah } = await izinLayar('dpa')
  return <DpaClient bolehUbah={bolehUbah} />
}
