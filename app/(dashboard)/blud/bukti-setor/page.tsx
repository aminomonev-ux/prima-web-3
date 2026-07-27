// app/(dashboard)/blud/bukti-setor/page.tsx
// Pintu modul dijaga `layout.tsx`; di sini tinggal izin per-menu (Fase C).
import BuktiSetorClient from './bukti-setor-client'
import { izinLayar } from '../_izin'

export const dynamic = 'force-dynamic'

export default async function BuktiSetorPage() {
  const { bolehUbah } = await izinLayar('bukti-setor')
  return <BuktiSetorClient bolehUbah={bolehUbah} />
}
